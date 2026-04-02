#!/usr/bin/env node
/**
 * cs-case-add.mjs <title> <category> <channel> <summary> [customer_name] [faq_candidate]
 * 例: node scripts/cs-case-add.mjs "料金について" pricing line "月額の質問" "田中さん" true
 */
import process from "node:process";
import { createPage } from "./lib/notion-helpers.mjs";

const dbId = process.env.NOTION_DB_CS_ID;
if (!process.env.NOTION_TOKEN || !dbId) { console.error("Set NOTION_TOKEN and NOTION_DB_CS_ID"); process.exit(1); }

const [,, title, category, channel, summary, customer_name, faq_candidate] = process.argv;
if (!title || !category || !channel || !summary) {
  console.error("Usage: cs-case-add.mjs <title> <category> <channel> <summary> [customer_name] [faq_candidate]");
  process.exit(1);
}

await createPage(dbId, {
  title_field: { title: [{ text: { content: title } }] },
  status: { select: { name: "open" } },
  category: { select: { name: category } },
  channel: { select: { name: channel } },
  customer_name: { rich_text: [{ text: { content: customer_name || "" } }] },
  summary: { rich_text: [{ text: { content: summary.slice(0, 2000) } }] },
  faq_candidate: { checkbox: faq_candidate === "true" },
});
console.log("OK");
