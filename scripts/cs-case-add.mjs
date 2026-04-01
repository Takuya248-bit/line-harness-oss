#!/usr/bin/env node
/**
 * cs-case-add.mjs <title> <category> <channel> <summary> [customer_name] [faq_candidate]
 * 例: node scripts/cs-case-add.mjs "料金について" pricing line "月額の質問" "田中さん" true
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_CS_ID;
if (!token || !dbId) { console.error("Set NOTION_TOKEN and NOTION_DB_CS_ID"); process.exit(1); }

const [,, title, category, channel, summary, customer_name, faq_candidate] = process.argv;
if (!title || !category || !channel || !summary) {
  console.error("Usage: cs-case-add.mjs <title> <category> <channel> <summary> [customer_name] [faq_candidate]");
  process.exit(1);
}

const res = await fetch("https://api.notion.com/v1/pages", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
  body: JSON.stringify({
    parent: { database_id: dbId },
    properties: {
      title_field: { title: [{ text: { content: title } }] },
      status: { select: { name: "open" } },
      category: { select: { name: category } },
      channel: { select: { name: channel } },
      customer_name: { rich_text: [{ text: { content: customer_name || "" } }] },
      summary: { rich_text: [{ text: { content: summary.slice(0, 2000) } }] },
      faq_candidate: { checkbox: faq_candidate === "true" },
    },
  }),
});
if (!res.ok) { const e = await res.json(); console.error(`Error ${res.status}: ${JSON.stringify(e)}`); process.exit(1); }
console.log("OK");
