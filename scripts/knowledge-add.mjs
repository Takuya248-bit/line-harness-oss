#!/usr/bin/env node
/**
 * knowledge-add.mjs <category> <subcategory> <title> <content> [tags] [source] [reliability]
 * 例: node scripts/knowledge-add.mjs locale bali_cafe "カフェ名" "内容" "tag1,tag2" research verified
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_KNOWLEDGE_ID;
if (!token || !dbId) { console.error("Set NOTION_TOKEN and NOTION_DB_KNOWLEDGE_ID"); process.exit(1); }

const [,, category, subcategory, title, content, tags, source, reliability] = process.argv;
if (!category || !title || !content) { console.error("Usage: knowledge-add.mjs <cat> <subcat> <title> <content> [tags] [source] [reliability]"); process.exit(1); }

const res = await fetch("https://api.notion.com/v1/pages", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
  body: JSON.stringify({
    parent: { database_id: dbId },
    properties: {
      title_field: { title: [{ text: { content: title } }] },
      category: { select: { name: category } },
      subcategory: { rich_text: [{ text: { content: subcategory || "" } }] },
      content: { rich_text: [{ text: { content: content.slice(0, 2000) } }] },
      tags: { multi_select: (tags || "").split(",").filter(Boolean).map(name => ({ name: name.trim() })) },
      source: { select: { name: source || "research" } },
      reliability: { select: { name: reliability || "unverified" } },
    },
  }),
});
if (!res.ok) { const e = await res.json(); console.error(`Error ${res.status}: ${JSON.stringify(e)}`); process.exit(1); }
console.log("OK");
