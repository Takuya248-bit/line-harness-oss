#!/usr/bin/env node
/**
 * コンテンツパイプラインDBのステータスを更新する
 * Usage: node scripts/content-idea-update.mjs <notion-page-id> <status> [published_url]
 * status: idea/planning/writing/review/published/dropped
 * 例: node scripts/content-idea-update.mjs abc123 published https://example.com/article
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
if (!token) { console.error("Set NOTION_TOKEN and NOTION_DB_CONTENT_ID"); process.exit(1); }

const VALID_STATUSES = ["idea", "planning", "writing", "review", "published", "dropped"];
const [,, pageId, status, publishedUrl] = process.argv;

if (!pageId || !status) { console.error("Usage: content-idea-update.mjs <notion-page-id> <status> [published_url]"); process.exit(1); }
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
