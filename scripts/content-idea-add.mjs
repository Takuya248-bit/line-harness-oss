#!/usr/bin/env node
/**
 * コンテンツパイプラインDBにネタを追加する
 * Usage: node scripts/content-idea-add.mjs <title> <channel> [category] [angle] [priority] [knowledge_ref]
 * channel: seo_article, x_barilingual, x_lcustom, instagram (カンマ区切りで複数可)
 * 例: node scripts/content-idea-add.mjs "バリ留学の費用比較2026" "seo_article,x_barilingual" education "実体験ベースの費用内訳" high
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_CONTENT_ID;
if (!token || !dbId) { console.error("Set NOTION_TOKEN and NOTION_DB_CONTENT_ID"); process.exit(1); }

const [,, title, channels, category, angle, priority, knowledgeRef] = process.argv;
if (!title || !channels) { console.error("Usage: content-idea-add.mjs <title> <channel> [category] [angle] [priority] [knowledge_ref]"); process.exit(1); }

const res = await fetch("https://api.notion.com/v1/pages", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
  body: JSON.stringify({
    parent: { database_id: dbId },
    properties: {
      title_field: { title: [{ text: { content: title } }] },
      status: { select: { name: "idea" } },
      channel: { multi_select: channels.split(",").filter(Boolean).map(name => ({ name: name.trim() })) },
      ...(category && { category: { select: { name: category } } }),
      ...(angle && { angle: { rich_text: [{ text: { content: angle } }] } }),
      ...(priority && { priority: { select: { name: priority } } }),
      ...(knowledgeRef && { knowledge_ref: { rich_text: [{ text: { content: knowledgeRef } }] } }),
    },
  }),
});
if (!res.ok) { const e = await res.json(); console.error(`Error ${res.status}: ${JSON.stringify(e)}`); process.exit(1); }
const body = await res.json();
console.log(`OK: ${body.url}`);
