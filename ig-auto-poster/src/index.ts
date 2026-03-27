import { generateImage } from "./gemini";
import { publishCarousel } from "./instagram";
import { buildPrompts } from "./prompts";
import { getCaption } from "./captions";
import { CONTENT_POOL } from "./content-data";

export interface Env {
  IMAGES: R2Bucket;
  DB: D1Database;
  GEMINI_API_KEY: string;
  IG_ACCESS_TOKEN: string;
  IG_BUSINESS_ACCOUNT_ID: string;
  R2_PUBLIC_URL: string;
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

async function postCarousel(env: Env): Promise<string> {
  // 1. Get next content index
  const contentIndex = await getContentIndex(env.DB);
  const content = CONTENT_POOL[contentIndex % CONTENT_POOL.length];

  // 2. Build prompts
  const prompts = buildPrompts(content);

  // 3. Generate images via Gemini and upload to R2
  const imageUrls: string[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < prompts.length; i++) {
    const imageBytes = await generateImage(prompts[i], env.GEMINI_API_KEY);

    const key = `posts/${timestamp}/slide-${i + 1}.png`;
    await env.IMAGES.put(key, imageBytes, {
      httpMetadata: { contentType: "image/png" },
    });

    const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;
    imageUrls.push(publicUrl);

    // Delay between Gemini calls to avoid rate limiting
    if (i < prompts.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // 4. Build caption
  const caption = getCaption(content.title.replace("\n", " "), contentIndex);

  // 5. Publish carousel to Instagram
  const publishedId = await publishCarousel(
    imageUrls,
    caption,
    env.IG_ACCESS_TOKEN,
    env.IG_BUSINESS_ACCOUNT_ID,
  );

  // 6. Update content index
  const nextIndex = (contentIndex + 1) % CONTENT_POOL.length;
  await updateContentIndex(env.DB, nextIndex);

  return publishedId;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      postCarousel(env)
        .then((id) => console.log(`Posted carousel: ${id}`))
        .catch((err) => console.error(`Carousel post failed: ${err}`)),
    );
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/post") {
      try {
        const publishedId = await postCarousel(env);
        return new Response(
          JSON.stringify({ success: true, id: publishedId }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(
          JSON.stringify({ success: false, error: message }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/status") {
      const index = await getContentIndex(env.DB);
      const row = await env.DB
        .prepare("SELECT last_posted_at FROM ig_post_state WHERE id = 1")
        .first<{ last_posted_at: string | null }>();
      return new Response(
        JSON.stringify({
          contentIndex: index,
          totalContent: CONTENT_POOL.length,
          nextContent: CONTENT_POOL[index % CONTENT_POOL.length].title.replace("\n", " "),
          lastPostedAt: row?.last_posted_at,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("ig-auto-poster: POST /post or GET /status", {
      status: 404,
    });
  },
};
