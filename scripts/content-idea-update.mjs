#!/usr/bin/env node
/**
 * コンテンツパイプラインDBのステータスを更新する
 * Usage: node scripts/content-idea-update.mjs <notion-page-id> <status> [published_url] [--no-promo]
 * status: idea/planning/writing/review/published/dropped
 * 例: node scripts/content-idea-update.mjs abc123 published https://example.com/article
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
if (!token) { console.error("Set NOTION_TOKEN and NOTION_DB_CONTENT_ID"); process.exit(1); }

const VALID_STATUSES = ["idea", "planning", "writing", "review", "published", "dropped"];
const args = process.argv.slice(2).filter(a => a !== "--no-promo");
const noPromo = process.argv.includes("--no-promo");
const [pageId, status, publishedUrl] = args;

if (!pageId || !status) { console.error("Usage: content-idea-update.mjs <notion-page-id> <status> [published_url] [--no-promo]"); process.exit(1); }
if (!VALID_STATUSES.includes(status)) { console.error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(", ")}`); process.exit(1); }
if (status === "published" && !publishedUrl) { console.warn("Warning: status=published but published_url not specified"); }

const properties = {
  status: { select: { name: status } },
  ...(publishedUrl && { published_url: { url: publishedUrl } }),
};

const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
  body: JSON.stringify({ properties }),
});
if (!res.ok) { const e = await res.json(); console.error(`Error ${res.status}: ${JSON.stringify(e)}`); process.exit(1); }
const body = await res.json();
console.log(`OK: ${body.url}`);

// プロモツイート候補生成（published 変更時のみ）
if (status === "published" && !noPromo) {
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
  });
  if (pageRes.ok) {
    const page = await pageRes.json();
    const props = page.properties || {};

    const titleRaw = props.title_field?.title?.[0]?.plain_text
      || props.Name?.title?.[0]?.plain_text
      || props.title?.title?.[0]?.plain_text
      || "";
    const angle = props.angle?.rich_text?.[0]?.plain_text || "";
    const url = publishedUrl || props.published_url?.url || "";

    const titleSummary = titleRaw.slice(0, 30);
    const angleLine = angle.split(/\n/)[0].slice(0, 60);

    let tweet = `${titleSummary}\n\n${angleLine}\n\n${url}`;
    // 140文字超の場合はtitleSummaryを短縮
    if (tweet.length > 140) {
      const overhead = tweet.length - 140;
      const cutTitle = titleSummary.slice(0, Math.max(1, titleSummary.length - overhead));
      tweet = `${cutTitle}\n\n${angleLine}\n\n${url}`;
    }

    console.log("\n--- プロモツイート候補 ---");
    console.log(tweet);
    console.log("---");
    console.log("x-auto-posterで投稿する場合: このテキストをコピーしてください");
  }
}
