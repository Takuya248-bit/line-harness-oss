import { publishCarousel, publishReel } from "./instagram";
import { sendPreview, sendNotification, parsePostback } from "./line-preview";
import { collectInsights, collectInsightsV4 } from "./insights";
import { renderGalleryList, renderGalleryDetail } from "./gallery";
import { fetchKnowledge, fetchGuardrails, formatKnowledgeForPrompt } from "./knowledge";
import type { KnowledgeEntry } from "./knowledge";
import { handleDailyPostCron } from "./worker/cron-poster";
import { handleApproval } from "./worker/approval-api";

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
  NOTION_API_KEY: string;
  NOTION_KNOWLEDGE_DB_ID: string;
  PEXELS_API_KEY?: string;
  GROQ_API_KEY?: string;
}

// --- 設定取得ヘルパー ---
async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM ig_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function handleV3PostCron(env: Env): Promise<void> {
  const row = await env.DB
    .prepare(
      "SELECT id, content_json, caption, category, COALESCE(NULLIF(TRIM(format_type), ''), 'carousel') AS format_type FROM generated_content WHERE status = 'approved' ORDER BY id ASC LIMIT 1",
    )
    .first<{ id: number; content_json: string; caption: string; category: string; format_type: string }>();

  if (!row) {
    console.log("No approved content to post.");
    return;
  }

  const stored = JSON.parse(row.content_json) as {
    title?: string;
    slideUrls?: string[];
    videoUrl?: string;
  };

  let publishedId: string;

  if (row.format_type === "reel" && stored.videoUrl) {
    publishedId = await publishReel(
      stored.videoUrl,
      row.caption,
      env.IG_ACCESS_TOKEN,
      env.IG_BUSINESS_ACCOUNT_ID,
    );
  } else if (stored.slideUrls?.length) {
    publishedId = await publishCarousel(stored.slideUrls, row.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
  } else {
    console.log("Content not ready for posting (need videoUrl for reel or slideUrls for carousel).");
    return;
  }

  await env.DB
    .prepare("UPDATE generated_content SET status = 'posted', posted_at = datetime('now'), ig_media_id = ? WHERE id = ?")
    .bind(publishedId, row.id)
    .run();

  await sendNotification(
    `投稿完了: ${stored.title ?? "(no title)"}\nカテゴリ: ${row.category}\n形式: ${row.format_type}`,
    env.LINE_OWNER_USER_ID,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
  console.log(`Posted #${row.id} (${row.format_type})`);
}

// --- 週次Insights + 最適化 ---
async function handleWeeklyInsightsCron(env: Env): Promise<void> {
  console.log("Weekly insights collection started");

  // V3 legacy insights
  const metrics = await collectInsights(env.DB, env.IG_ACCESS_TOKEN);
  console.log(`Collected v3 insights for ${metrics.length} posts`);

  // V4 insights (A/B test results)
  await collectInsightsV4(env.DB, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
  console.log("V4 insights collected");
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

    // V4 postback handling
    if (event.postback?.data.startsWith("v4_")) {
      const action = event.postback.data.replace("v4_", "");
      const result = await handleApproval(env.DB, action);
      await sendNotification(result.message, env.LINE_OWNER_USER_ID, env.LINE_CHANNEL_ACCESS_TOKEN);
      continue;
    }

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
        await sendNotification("リジェクトしました。V4パイプラインで次回生成されます。", env.LINE_OWNER_USER_ID, env.LINE_CHANNEL_ACCESS_TOKEN);
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

    // V4: 毎日 UTC 9:00 (バリ 17:00) → スケジュールキューから投稿
    if (hour === 9) {
      await handleDailyPostCron(env.DB, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
      return;
    }

    // 日次: UTC 1,10 → 投稿（カルーセル / リール、旧v3承認済みコンテンツ用）
    if (hour === 1 || hour === 10) {
      await handleV3PostCron(env);
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
      // --- V4 Approval API ---
      if (request.method === "POST" && url.pathname === "/api/v4/approve") {
        const body = await request.json() as { action: string };
        if (!body.action) return json({ ok: false, message: "action required" }, 400);
        const result = await handleApproval(env.DB, body.action);
        return json(result, result.ok ? 200 : 400);
      }

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

      // --- Image Pipeline API ---
      if (request.method === "GET" && url.pathname === "/api/pending-images") {
        const rows = await env.DB
          .prepare(
            "SELECT id, content_json, caption, category, format_type, template_name FROM generated_content WHERE status = 'pending_images' ORDER BY id ASC LIMIT 5",
          )
          .all<{
            id: number;
            content_json: string;
            caption: string;
            category: string;
            format_type: string | null;
            template_name: string | null;
          }>();
        return json({ items: rows.results });
      }

      if (request.method === "POST" && url.pathname === "/api/slides") {
        const body = await request.json() as {
          contentId: number;
          slides: { index: number; imageBase64: string }[];
          isVideo?: boolean;
        };
        if (!body.contentId || !body.slides?.length) {
          return json({ error: "contentId and slides are required" }, 400);
        }
        const row = await env.DB
          .prepare("SELECT content_json FROM generated_content WHERE id = ?")
          .bind(body.contentId)
          .first<{ content_json: string }>();
        if (!row) return json({ error: "Content not found" }, 404);

        const stored = JSON.parse(row.content_json) as Record<string, unknown>;
        const autoApprove = await getSetting(env.DB, "auto_approve");
        const newStatus = autoApprove === "true" ? "approved" : "pending_review";

        if (body.isVideo === true && body.slides.length === 1) {
          const slide = body.slides[0];
          const binary = Uint8Array.from(atob(slide.imageBase64), (c) => c.charCodeAt(0));
          const key = `reels/${body.contentId}/${Date.now()}/reel.mp4`;
          await env.IMAGES.put(key, binary, {
            httpMetadata: { contentType: "video/mp4" },
          });
          stored.videoUrl = `${env.R2_PUBLIC_URL}/${key}`;
          await env.DB
            .prepare("UPDATE generated_content SET content_json = ?, status = ? WHERE id = ?")
            .bind(JSON.stringify(stored), newStatus, body.contentId)
            .run();
          return json({
            success: true,
            contentId: body.contentId,
            isVideo: true,
            videoUrl: stored.videoUrl,
          });
        }

        const slideUrls: string[] = (stored.slideUrls as string[] | undefined) ?? [];
        const timestamp = Date.now();

        for (const slide of body.slides) {
          const binary = Uint8Array.from(atob(slide.imageBase64), (c) => c.charCodeAt(0));
          const key = `slides/${body.contentId}/${timestamp}/slide-${slide.index + 1}.jpg`;
          await env.IMAGES.put(key, binary, {
            httpMetadata: { contentType: "image/jpeg" },
          });
          slideUrls[slide.index] = `${env.R2_PUBLIC_URL}/${key}`;
        }

        stored.slideUrls = slideUrls;
        await env.DB
          .prepare("UPDATE generated_content SET content_json = ?, status = ? WHERE id = ?")
          .bind(JSON.stringify(stored), newStatus, body.contentId)
          .run();

        return json({ success: true, contentId: body.contentId, slideCount: body.slides.length, slideUrls });
      }

      // --- Status ---
      if (request.method === "GET" && url.pathname === "/status") {
        const pendingCount = await env.DB
          .prepare("SELECT COUNT(*) as count FROM generated_content WHERE status = 'pending_review'")
          .first<{ count: number }>();
        const approvedCount = await env.DB
          .prepare("SELECT COUNT(*) as count FROM generated_content WHERE status = 'approved'")
          .first<{ count: number }>();
        const pendingImagesCount = await env.DB
          .prepare("SELECT COUNT(*) as count FROM generated_content WHERE status = 'pending_images'")
          .first<{ count: number }>();
        const weights = await env.DB
          .prepare("SELECT category, weight, avg_saves, total_posts FROM category_weights ORDER BY weight DESC")
          .all<{ category: string; weight: number; avg_saves: number; total_posts: number }>();
        const autoApprove = await getSetting(env.DB, "auto_approve");
        return json({
          version: "v3.0",
          pendingImages: pendingImagesCount?.count ?? 0,
          pendingReview: pendingCount?.count ?? 0,
          approved: approvedCount?.count ?? 0,
          autoApprove: autoApprove === "true",
          categoryWeights: weights.results,
        });
      }

      // --- Manual triggers ---
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

      // --- Knowledge DB API ---
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

      return json({
        endpoints: [
          "GET  /status             - 現在の状態（v3.0）",
          "GET  /gallery            - コンテンツギャラリー",
          "GET  /gallery/:id        - コンテンツ詳細",
          "POST /gallery/:id/approve - 承認",
          "POST /gallery/:id/skip   - スキップ",
          "GET  /api/pending-images - 画像生成待ちコンテンツ取得",
          "POST /api/slides         - スライド画像アップロード",
          "POST /collect-insights   - Insights手動収集+最適化",
          "POST /settings/auto-approve - 自動承認切替 {enabled:bool}",
          "POST /line-webhook       - LINE Webhook",
          "GET  /api/knowledge      - 知識エントリ取得",
          "POST /api/knowledge      - 知識エントリ追加",
        ],
      }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: message }, 500);
    }
  },
};
