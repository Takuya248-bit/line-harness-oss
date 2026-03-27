import { generateSlideImages } from "./image-generator";
import { publishCarousel } from "./instagram";
import { getCaption } from "./captions";
import { allContent } from "./content-data";

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

async function getContentIndex(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT content_index FROM ig_post_state WHERE id = 1")
    .first<{ content_index: number }>();
  return row?.content_index ?? 0;
}

async function updateContentIndex(
  db: D1Database,
  newIndex: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE ig_post_state SET content_index = ?, last_posted_at = datetime('now') WHERE id = 1",
    )
    .bind(newIndex)
    .run();
}

interface PreviewResult {
  contentIndex: number;
  content: { id: number; type: string; title: string; subtitle: string };
  caption: string;
  imageUrls: string[];
}

async function generatePreview(env: Env, indexOverride?: number): Promise<PreviewResult> {
  const contentIndex = indexOverride ?? await getContentIndex(env.DB);
  const content = allContent[contentIndex % allContent.length];

  // Generate all slide images via Satori + resvg-wasm
  const slideImages = await generateSlideImages(content);

  const imageUrls: string[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < slideImages.length; i++) {
    const key = `preview/${timestamp}/slide-${i + 1}.png`;
    await env.IMAGES.put(key, slideImages[i], {
      httpMetadata: { contentType: "image/png" },
    });
    imageUrls.push(`${env.R2_PUBLIC_URL}/${key}`);
  }

  const caption = getCaption(content.title.replaceAll("\n", " "), contentIndex);

  return {
    contentIndex,
    content: { id: content.id, type: content.type, title: content.title, subtitle: content.subtitle },
    caption,
    imageUrls,
  };
}

async function postFromPreview(
  env: Env,
  imageUrls: string[],
  caption: string,
  contentIndex: number,
): Promise<string> {
  const publishedId = await publishCarousel(
    imageUrls,
    caption,
    env.IG_ACCESS_TOKEN,
    env.IG_BUSINESS_ACCOUNT_ID,
  );

  const nextIndex = (contentIndex + 1) % allContent.length;
  await updateContentIndex(env.DB, nextIndex);

  return publishedId;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const preview = await generatePreview(env);
    await postFromPreview(env, preview.imageUrls, preview.caption, preview.contentIndex);
    console.log(`Auto-posted content index ${preview.contentIndex}: ${preview.content.title}`);
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
      // GET /status - 現在の状態を確認
      if (request.method === "GET" && url.pathname === "/status") {
        const index = await getContentIndex(env.DB);
        const row = await env.DB
          .prepare("SELECT last_posted_at FROM ig_post_state WHERE id = 1")
          .first<{ last_posted_at: string | null }>();
        return json({
          contentIndex: index,
          totalContent: allContent.length,
          nextContent: allContent[index % allContent.length].title.replaceAll("\n", " "),
          nextType: allContent[index % allContent.length].type,
          lastPostedAt: row?.last_posted_at,
        });
      }

      // POST /preview - 画像生成+R2保存（Instagram投稿しない）
      if (request.method === "POST" && url.pathname === "/preview") {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const indexOverride = typeof body.index === "number" ? body.index : undefined;
        const preview = await generatePreview(env, indexOverride);
        return json({ success: true, ...preview });
      }

      // POST /publish - プレビュー済み画像をInstagramに投稿
      if (request.method === "POST" && url.pathname === "/publish") {
        const body = await request.json() as {
          imageUrls: string[];
          caption: string;
          contentIndex: number;
        };
        if (!body.imageUrls || !body.caption) {
          return json({ error: "imageUrls and caption are required. Run POST /preview first." }, 400);
        }
        const publishedId = await postFromPreview(env, body.imageUrls, body.caption, body.contentIndex);
        return json({ success: true, id: publishedId });
      }

      // GET /images/* - R2から画像を配信（Instagram Graph APIに必要）
      if (request.method === "GET" && url.pathname.startsWith("/images/")) {
        const key = url.pathname.replace("/images/", "");
        const object = await env.IMAGES.get(key);
        if (!object) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType ?? "image/png",
            "Cache-Control": "public, max-age=31536000",
          },
        });
      }

      // POST /preview-all - 全コンテンツのslide-2をまとめて生成
      if (request.method === "POST" && url.pathname === "/preview-all") {
        const results: { index: number; id: number; type: string; title: string; slide2: string }[] = [];
        for (let i = 0; i < allContent.length; i++) {
          const preview = await generatePreview(env, i);
          results.push({
            index: i,
            id: preview.content.id,
            type: preview.content.type,
            title: preview.content.title.replaceAll("\n", " "),
            slide2: preview.imageUrls[1],
          });
        }
        return json({ total: results.length, previews: results });
      }

      // GET /content - ネタリスト一覧
      if (request.method === "GET" && url.pathname === "/content") {
        const list = allContent.map((c) => ({
          id: c.id,
          type: c.type,
          title: c.title.replaceAll("\n", " "),
        }));
        return json({ total: list.length, content: list });
      }

      return json({
        endpoints: [
          "GET  /status   - 現在の投稿インデックスと状態",
          "GET  /content  - ネタリスト一覧",
          "POST /preview  - 下書き生成（画像+キャプション）",
          "POST /publish  - プレビュー済みを投稿",
        ],
      }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: message }, 500);
    }
  },
};
