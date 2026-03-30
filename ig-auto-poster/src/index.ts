import { generateSlideImages, generateFirstSlideSvg, generateSingleSlidePng, getSlideCount, generateV2SlideImages, generateV2SinglePng, getV2SlideCount } from "./image-generator";
import { publishCarousel } from "./instagram";
import { getCaption } from "./captions";
import { allContent } from "./content-data";
import { generateBaliContent } from "./content-generator-v2";
import { sendPreview, sendNotification, parsePostback } from "./line-preview";
import { collectInsights } from "./insights";
import { optimizeWeights, sendWeeklyReport } from "./optimizer";
import { renderGalleryList, renderGalleryDetail } from "./gallery";
import type { ContentItem } from "./content-data";
import type { BaliContentV2 } from "./templates/index";
import { fetchKnowledge, fetchGuardrails, formatKnowledgeForPrompt } from "./knowledge";
import type { KnowledgeEntry } from "./knowledge";

export interface Env {
  IMAGES: R2Bucket;
  DB: D1Database;
  IG_ACCESS_TOKEN: string;
  IG_BUSINESS_ACCOUNT_ID: string;
  R2_PUBLIC_URL: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_OWNER_USER_ID: string;
  UNSPLASH_ACCESS_KEY: string;
  SERPER_API_KEY: string;
}

// --- 既存データ用ヘルパー（フォールバック） ---
async function getContentIndex(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT content_index FROM ig_post_state WHERE id = 1")
    .first<{ content_index: number }>();
  return row?.content_index ?? 0;
}

async function updateContentIndex(db: D1Database, newIndex: number): Promise<void> {
  await db
    .prepare("UPDATE ig_post_state SET content_index = ?, last_posted_at = datetime('now') WHERE id = 1")
    .bind(newIndex)
    .run();
}

// --- 設定取得ヘルパー ---
async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM ig_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

// --- PNG画像1枚生成+R2保存（v1用） ---
async function generateAndStoreSingleImage(
  content: ContentItem,
  slideIndex: number,
  env: Env,
  prefix: string,
  timestamp: number,
): Promise<string> {
  const png = await generateSingleSlidePng(content, slideIndex);
  const key = `${prefix}/${timestamp}/slide-${slideIndex + 1}.png`;
  await env.IMAGES.put(key, png, {
    httpMetadata: { contentType: "image/png" },
  });
  return `${env.R2_PUBLIC_URL}/${key}`;
}

// --- V2 PNG画像1枚生成+R2保存 ---
async function generateAndStoreV2Image(
  content: BaliContentV2,
  slideIndex: number,
  env: Env,
  prefix: string,
  timestamp: number,
): Promise<string> {
  const png = await generateV2SinglePng(content, slideIndex);
  const key = `${prefix}/${timestamp}/slide-${slideIndex + 1}.png`;
  await env.IMAGES.put(key, png, {
    httpMetadata: { contentType: "image/png" },
  });
  return `${env.R2_PUBLIC_URL}/${key}`;
}

// --- V2 Cronハンドラー ---
async function handleV2GenerateCron(env: Env): Promise<void> {
  const content = await generateBaliContent(
    env.UNSPLASH_ACCESS_KEY,
    env.DB,
    env.SERPER_API_KEY,
  );

  // DBに保存（PNG生成なし）
  const autoApprove = await getSetting(env.DB, "auto_approve");
  await env.DB
    .prepare("INSERT INTO generated_content (template_type, content_json, caption, status, category) VALUES ('bali_v2', ?, ?, ?, ?)")
    .bind(
      JSON.stringify(content),
      content.caption,
      autoApprove === "true" ? "approved" : "pending_review",
      content.category,
    )
    .run();

  if (autoApprove !== "true") {
    await sendNotification(
      `新しい投稿が生成されました\nテーマ: ${content.title}\nカテゴリ: ${content.category}\nギャラリーで確認してください`,
      env.LINE_OWNER_USER_ID,
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
  }

  console.log(`V2 content generated: ${content.title} (${content.category})`);
}

async function handleV2PostCron(env: Env): Promise<void> {
  const row = await env.DB
    .prepare("SELECT id, content_json, caption, category FROM generated_content WHERE status = 'approved' AND template_type = 'bali_v2' ORDER BY id ASC LIMIT 1")
    .first<{ id: number; content_json: string; caption: string; category: string }>();

  if (!row) {
    // v2承認済みなし → v1フォールバック
    console.log("No approved v2 content. Using v1 fallback.");
    const contentIndex = await getContentIndex(env.DB);
    const content = allContent[contentIndex % allContent.length];
    const timestamp = Date.now();
    const total = getSlideCount(content);
    const imageUrls: string[] = [];
    for (let i = 0; i < total; i++) {
      const url = await generateAndStoreSingleImage(content, i, env, "auto", timestamp);
      imageUrls.push(url);
    }
    const caption = getCaption(content.title.replaceAll("\n", " "), contentIndex);
    await publishCarousel(imageUrls, caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
    await updateContentIndex(env.DB, (contentIndex + 1) % allContent.length);
    console.log(`V1 fallback posted: ${content.title}`);
    return;
  }

  const stored = JSON.parse(row.content_json) as BaliContentV2 & { coverUrl: string };
  const timestamp = Date.now();
  const total = getV2SlideCount(stored);
  const imageUrls: string[] = [];
  for (let i = 0; i < total; i++) {
    const url = await generateAndStoreV2Image(stored, i, env, "post", timestamp);
    imageUrls.push(url);
  }
  const publishedId = await publishCarousel(imageUrls, row.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);

  await env.DB
    .prepare("UPDATE generated_content SET status = 'posted', posted_at = datetime('now'), ig_media_id = ? WHERE id = ?")
    .bind(publishedId, row.id)
    .run();

  await sendNotification(
    `投稿完了: ${stored.title}\nカテゴリ: ${row.category}`,
    env.LINE_OWNER_USER_ID,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
  console.log(`V2 posted: ${stored.title} (${row.category}) ig_media_id=${publishedId}`);
}

// --- 週次Insights + 最適化 ---
async function handleWeeklyInsightsCron(env: Env): Promise<void> {
  console.log("Weekly insights collection started");

  const metrics = await collectInsights(env.DB, env.IG_ACCESS_TOKEN);
  console.log(`Collected insights for ${metrics.length} posts`);

  const scores = await optimizeWeights(env.DB);
  await sendWeeklyReport(scores, env.LINE_OWNER_USER_ID, env.LINE_CHANNEL_ACCESS_TOKEN);

  console.log("Weekly insights and optimization complete");
}

// --- LINE Webhookハンドラー ---
interface LineWebhookEvent {
  type: string;
  message?: { type: string; text?: string };
  postback?: { data: string };
  source?: { userId: string };
}

async function handleLineWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { events: LineWebhookEvent[] };

  for (const event of body.events) {
    if (event.type !== "postback" || !event.postback) continue;
    if (event.source?.userId !== env.LINE_OWNER_USER_ID) continue;

    const parsed = parsePostback(event.postback.data);
    if (!parsed) continue;

    switch (parsed.action) {
      case "approve": {
        await env.DB
          .prepare("UPDATE generated_content SET status = 'approved' WHERE id = ?")
          .bind(parsed.id)
          .run();
        await sendNotification("承認しました。次の投稿時間に自動投稿します。", env.LINE_OWNER_USER_ID, env.LINE_CHANNEL_ACCESS_TOKEN);
        break;
      }
      case "regenerate": {
        await env.DB
          .prepare("UPDATE generated_content SET status = 'rejected' WHERE id = ?")
          .bind(parsed.id)
          .run();
        await handleV2GenerateCron(env);
        break;
      }
      case "skip": {
        await env.DB
          .prepare("UPDATE generated_content SET status = 'skipped' WHERE id = ?")
          .bind(parsed.id)
          .run();
        await sendNotification("スキップしました。", env.LINE_OWNER_USER_ID, env.LINE_CHANNEL_ACCESS_TOKEN);
        break;
      }
    }
  }

  return new Response(JSON.stringify({ status: "ok" }), {
    headers: { "Content-Type": "application/json" },
  });
}

// --- メインエクスポート ---
export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const hour = new Date(controller.scheduledTime).getUTCHours();
    const dayOfWeek = new Date(controller.scheduledTime).getUTCDay();

    // 毎週月曜 UTC 2:00 (バリ時間10:00) → Insights + 最適化
    if (dayOfWeek === 1 && hour === 2) {
      await handleWeeklyInsightsCron(env);
      return;
    }

    // 日次: UTC 0,8 → V2コンテンツ生成
    if (hour === 0 || hour === 8) {
      await handleV2GenerateCron(env);
    }
    // 日次: UTC 1,10 → V2投稿
    else if (hour === 1 || hour === 10) {
      await handleV2PostCron(env);
    }
  },

  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const html = (body: string, status = 200) =>
      new Response(body, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });

    try {
      // --- LINE Webhook ---
      if (request.method === "POST" && url.pathname === "/line-webhook") {
        return handleLineWebhook(request, env);
      }

      // --- Gallery ---
      if (request.method === "GET" && url.pathname === "/gallery") {
        const filter = url.searchParams.get("filter") ?? undefined;
        return html(await renderGalleryList(env.DB, filter));
      }

      if (request.method === "GET" && url.pathname.match(/^\/gallery\/\d+$/)) {
        const id = parseInt(url.pathname.split("/")[2], 10);
        const page = await renderGalleryDetail(env.DB, id);
        if (!page) return html("<p>Not found</p>", 404);
        return html(page);
      }

      if (request.method === "POST" && url.pathname.match(/^\/gallery\/\d+\/preview\/\d+$/)) {
        const parts = url.pathname.split("/");
        const id = parseInt(parts[2], 10);
        const slideIndex = parseInt(parts[4], 10);

        const row = await env.DB
          .prepare("SELECT content_json, template_type FROM generated_content WHERE id = ?")
          .bind(id)
          .first<{ content_json: string; template_type: string }>();

        if (!row) return json({ error: "Not found" }, 404);

        const stored = JSON.parse(row.content_json) as BaliContentV2 & { coverUrl?: string; slideUrls?: string[] };
        const total = getV2SlideCount(stored);

        if (slideIndex < 0 || slideIndex >= total) {
          return json({ error: `Slide index out of range (0-${total - 1})` }, 400);
        }

        const timestamp = Date.now();
        const slideUrl = await generateAndStoreV2Image(stored, slideIndex, env, "preview", timestamp);

        const slideUrls = stored.slideUrls ?? [];
        slideUrls[slideIndex] = slideUrl;
        stored.slideUrls = slideUrls;

        await env.DB
          .prepare("UPDATE generated_content SET content_json = ? WHERE id = ?")
          .bind(JSON.stringify(stored), id)
          .run();

        return json({ success: true, slideIndex, slideUrl, totalSlides: total });
      }

      if (request.method === "POST" && url.pathname.match(/^\/gallery\/\d+\/(approve|skip)$/)) {
        const parts = url.pathname.split("/");
        const id = parseInt(parts[2], 10);
        const action = parts[3];
        const newStatus = action === "approve" ? "approved" : "skipped";
        await env.DB
          .prepare("UPDATE generated_content SET status = ? WHERE id = ?")
          .bind(newStatus, id)
          .run();
        return Response.redirect(`${url.origin}/gallery`, 303);
      }

      // --- Status ---
      if (request.method === "GET" && url.pathname === "/status") {
        const index = await getContentIndex(env.DB);
        const row = await env.DB
          .prepare("SELECT last_posted_at FROM ig_post_state WHERE id = 1")
          .first<{ last_posted_at: string | null }>();
        const pendingCount = await env.DB
          .prepare("SELECT COUNT(*) as count FROM generated_content WHERE status = 'pending_review'")
          .first<{ count: number }>();
        const approvedCount = await env.DB
          .prepare("SELECT COUNT(*) as count FROM generated_content WHERE status = 'approved'")
          .first<{ count: number }>();
        const weights = await env.DB
          .prepare("SELECT category, weight, avg_saves, total_posts FROM category_weights ORDER BY weight DESC")
          .all<{ category: string; weight: number; avg_saves: number; total_posts: number }>();
        const autoApprove = await getSetting(env.DB, "auto_approve");
        return json({
          version: "v2.1",
          contentIndex: index,
          totalFallbackContent: allContent.length,
          lastPostedAt: row?.last_posted_at,
          pendingReview: pendingCount?.count ?? 0,
          approved: approvedCount?.count ?? 0,
          autoApprove: autoApprove === "true",
          categoryWeights: weights.results,
        });
      }

      // --- Manual triggers ---
      if (request.method === "POST" && url.pathname === "/generate") {
        await handleV2GenerateCron(env);
        return json({ success: true, message: "V2 content generated" });
      }

      if (request.method === "POST" && url.pathname === "/collect-insights") {
        await handleWeeklyInsightsCron(env);
        return json({ success: true, message: "Insights collected and weights optimized" });
      }

      // --- Settings ---
      if (request.method === "POST" && url.pathname === "/settings/auto-approve") {
        const body = await request.json() as { enabled: boolean };
        await env.DB
          .prepare("UPDATE ig_settings SET value = ? WHERE key = 'auto_approve'")
          .bind(body.enabled ? "true" : "false")
          .run();
        return json({ success: true, autoApprove: body.enabled });
      }

      // --- R2 images ---
      if (request.method === "GET" && url.pathname.startsWith("/images/")) {
        const key = url.pathname.replace("/images/", "");
        const object = await env.IMAGES.get(key);
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType ?? "image/png",
            "Cache-Control": "public, max-age=31536000",
          },
        });
      }

      // --- Knowledge DB API (unchanged) ---
      if (request.method === "GET" && url.pathname === "/api/knowledge") {
        const category = url.searchParams.get("category");
        const tagsParam = url.searchParams.get("tags");
        const limit = parseInt(url.searchParams.get("limit") || "20");
        const categories = category ? category.split(",") : [];
        const tags = tagsParam ? tagsParam.split(",") : [];

        if (categories.length === 0) {
          const counts = await env.DB
            .prepare("SELECT category, COUNT(*) as count FROM knowledge_entries GROUP BY category")
            .all<{ category: string; count: number }>();
          const guardrailCount = await env.DB
            .prepare("SELECT COUNT(*) as count FROM content_guardrails")
            .first<{ count: number }>();
          return json({ categories: counts.results, guardrails: guardrailCount?.count ?? 0 });
        }

        const entries = await fetchKnowledge(env.DB, categories, tags, limit);
        const guardrails = await fetchGuardrails(env.DB, url.searchParams.get("platform") || "all");
        return json({ entries, guardrails });
      }

      if (request.method === "POST" && url.pathname === "/api/knowledge") {
        const body = await request.json() as {
          category: string;
          subcategory?: string;
          title: string;
          content: string;
          tags?: string;
          source?: string;
          reliability?: string;
          source_url?: string;
        };

        if (!body.category || !body.title || !body.content) {
          return json({ error: "category, title, content are required" }, 400);
        }

        const result = await env.DB
          .prepare(
            `INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability, source_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            body.category,
            body.subcategory || null,
            body.title,
            body.content,
            body.tags || null,
            body.source || "auto",
            body.reliability || "unverified",
            body.source_url || null
          )
          .run();

        return json({ success: true, id: result.meta.last_row_id });
      }

      // --- V1 legacy endpoints ---
      if (request.method === "GET" && url.pathname === "/content") {
        const list = allContent.map((c) => ({
          id: c.id, type: c.type, title: c.title.replaceAll("\n", " "),
        }));
        return json({ total: list.length, content: list });
      }

      return json({
        endpoints: [
          "GET  /status             - 現在の状態（v2.1）",
          "GET  /gallery            - コンテンツギャラリー",
          "GET  /gallery/:id        - コンテンツ詳細",
          "POST /gallery/:id/approve - 承認",
          "POST /gallery/:id/skip   - スキップ",
          "POST /generate           - V2コンテンツ手動生成",
          "POST /collect-insights   - Insights手動収集+最適化",
          "POST /settings/auto-approve - 自動承認切替 {enabled:bool}",
          "POST /line-webhook       - LINE Webhook",
          "GET  /api/knowledge      - 知識エントリ取得",
          "POST /api/knowledge      - 知識エントリ追加",
          "GET  /content            - V1ネタリスト（レガシー）",
        ],
      }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: message }, 500);
    }
  },
};
