import { generateSlideImages, generateFirstSlideSvg, generateSingleSlidePng, getSlideCount } from "./image-generator";
import { publishCarousel } from "./instagram";
import { getCaption } from "./captions";
import { allContent } from "./content-data";
import { generateContent } from "./content-generator";
import { sendPreview, sendNotification, parsePostback } from "./line-preview";
import type { ContentItem } from "./content-data";

export interface Env {
  IMAGES: R2Bucket;
  DB: D1Database;
  IG_ACCESS_TOKEN: string;
  IG_BUSINESS_ACCOUNT_ID: string;
  R2_PUBLIC_URL: string;
  ANTHROPIC_API_KEY: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_OWNER_USER_ID: string;
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

// --- PNG画像1枚生成+R2保存 ---
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


// --- Cronハンドラー ---
async function handleGenerateCron(env: Env): Promise<void> {
  const { content, caption } = await generateContent(env.ANTHROPIC_API_KEY, env.DB);
  const timestamp = Date.now();

  // プレビュー用: カバー1枚だけPNG変換（CPU節約）
  const coverUrl = await generateAndStoreSingleImage(content, 0, env, "preview", timestamp);

  // コンテンツをDBに保存（画像は投稿時に全枚生成）
  await env.DB
    .prepare("UPDATE generated_content SET content_json = ? WHERE id = (SELECT MAX(id) FROM generated_content)")
    .bind(JSON.stringify({ ...content, coverUrl, caption }))
    .run();

  await sendPreview(
    [coverUrl],
    content.id,
    content.type,
    content.title,
    env.LINE_OWNER_USER_ID,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
  console.log(`Preview sent for: ${content.title}`);
}

async function handlePostCron(env: Env): Promise<void> {
  const row = await env.DB
    .prepare("SELECT id, content_json, caption FROM generated_content WHERE status = 'approved' ORDER BY id ASC LIMIT 1")
    .first<{ id: number; content_json: string; caption: string }>();

  if (!row) {
    console.log("No approved content. Using fallback from content-data.ts");
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
    console.log(`Fallback posted: ${content.title}`);
    return;
  }

  const stored = JSON.parse(row.content_json) as ContentItem & { coverUrl: string; caption: string };
  // 承認済みコンテンツ: 全スライドPNG生成
  const timestamp = Date.now();
  const total = getSlideCount(stored);
  const imageUrls: string[] = [];
  for (let i = 0; i < total; i++) {
    const url = await generateAndStoreSingleImage(stored, i, env, "post", timestamp);
    imageUrls.push(url);
  }
  await publishCarousel(imageUrls, row.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);

  await env.DB
    .prepare("UPDATE generated_content SET status = 'posted', posted_at = datetime('now') WHERE id = ?")
    .bind(row.id)
    .run();

  await sendNotification(
    `投稿完了: ${stored.title.replaceAll("\\n", " ")}`,
    env.LINE_OWNER_USER_ID,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
  console.log(`Posted: ${stored.title}`);
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
        await handleGenerateCron(env);
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

// --- 既存プレビューAPI（後方互換） ---
interface PreviewResult {
  contentIndex: number;
  content: { id: number; type: string; title: string; subtitle: string };
  caption: string;
  imageUrls: string[];
}

async function generatePreview(env: Env, indexOverride?: number): Promise<PreviewResult> {
  const contentIndex = indexOverride ?? await getContentIndex(env.DB);
  const content = allContent[contentIndex % allContent.length];
  const timestamp = Date.now();
  // カバー1枚のみPNG変換（CPU節約）
  const coverUrl = await generateAndStoreSingleImage(content, 0, env, "preview", timestamp);
  const caption = getCaption(content.title.replaceAll("\n", " "), contentIndex);

  return {
    contentIndex,
    content: { id: content.id, type: content.type, title: content.title, subtitle: content.subtitle },
    caption,
    imageUrls: [coverUrl],
  };
}

// --- メインエクスポート ---
export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const hour = new Date(controller.scheduledTime).getUTCHours();

    if (hour === 0 || hour === 8) {
      await handleGenerateCron(env);
    } else if (hour === 1 || hour === 10) {
      await handlePostCron(env);
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

    try {
      if (request.method === "POST" && url.pathname === "/line-webhook") {
        return handleLineWebhook(request, env);
      }

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
        return json({
          contentIndex: index,
          totalContent: allContent.length,
          nextContent: allContent[index % allContent.length].title.replaceAll("\n", " "),
          lastPostedAt: row?.last_posted_at,
          pendingReview: pendingCount?.count ?? 0,
          approved: approvedCount?.count ?? 0,
        });
      }

      if (request.method === "POST" && url.pathname === "/preview") {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const indexOverride = typeof body.index === "number" ? body.index : undefined;
        const preview = await generatePreview(env, indexOverride);
        return json({ success: true, ...preview });
      }

      if (request.method === "POST" && url.pathname === "/generate") {
        await handleGenerateCron(env);
        return json({ success: true, message: "Content generated and preview sent to LINE" });
      }

      if (request.method === "POST" && url.pathname === "/publish") {
        const body = await request.json() as {
          imageUrls: string[];
          caption: string;
          contentIndex: number;
        };
        if (!body.imageUrls || !body.caption) {
          return json({ error: "imageUrls and caption are required." }, 400);
        }
        const publishedId = await publishCarousel(
          body.imageUrls, body.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID,
        );
        const nextIndex = (body.contentIndex + 1) % allContent.length;
        await updateContentIndex(env.DB, nextIndex);
        return json({ success: true, id: publishedId });
      }

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

      if (request.method === "GET" && url.pathname === "/content") {
        const list = allContent.map((c) => ({
          id: c.id, type: c.type, title: c.title.replaceAll("\n", " "),
        }));
        return json({ total: list.length, content: list });
      }

      if (request.method === "POST" && url.pathname === "/preview-all") {
        const results: { index: number; title: string; svg: string }[] = [];
        for (let i = 0; i < allContent.length; i++) {
          const content = allContent[i];
          const svg = await generateFirstSlideSvg(content);
          results.push({
            index: i,
            title: content.title.replaceAll("\n", " "),
            svg,
          });
        }
        return json(results);
      }

      return json({
        endpoints: [
          "GET  /status       - 現在の状態",
          "GET  /content      - 既存ネタリスト",
          "POST /preview      - 既存データでプレビュー生成",
          "POST /preview-all  - 全コンテンツ1枚目プレビュー(SVG)",
          "POST /generate     - AI生成+LINEプレビュー送信",
          "POST /publish      - 手動投稿",
          "POST /line-webhook - LINE Webhook",
        ],
      }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: message }, 500);
    }
  },
};
