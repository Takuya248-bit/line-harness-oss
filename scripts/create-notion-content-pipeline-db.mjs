#!/usr/bin/env node
/**
 * コンテンツパイプラインDB（ネタDB）をNotionに作成する
 * Usage: NOTION_TOKEN=xxx NOTION_PARENT_PAGE_ID=xxx node scripts/create-notion-content-pipeline-db.mjs
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

if (!token || !parentPageId) {
  console.error("Set NOTION_TOKEN and NOTION_PARENT_PAGE_ID");
  process.exit(1);
}

const res = await fetch("https://api.notion.com/v1/databases", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: "Content Pipeline" } }],
    properties: {
      title_field: { title: {} },
      status: {
        select: {
          options: [
            { name: "idea", color: "gray" },
            { name: "planning", color: "yellow" },
            { name: "writing", color: "blue" },
            { name: "review", color: "purple" },
            { name: "published", color: "green" },
            { name: "dropped", color: "red" },
          ],
        },
      },
      channel: {
        multi_select: {
          options: [
            { name: "seo_article" },
            { name: "x_barilingual" },
            { name: "x_lcustom" },
            { name: "instagram" },
          ],
        },
      },
      category: {
        select: {
          options: [
            { name: "education" },
            { name: "market" },
            { name: "technology" },
            { name: "method" },
            { name: "case" },
            { name: "locale" },
            { name: "people" },
            { name: "ai_news" },
            { name: "regulation" },
          ],
        },
      },
      angle: { rich_text: {} },
      notes: { rich_text: {} },
      priority: {
        select: {
          options: [
            { name: "high", color: "red" },
            { name: "medium", color: "yellow" },
            { name: "low", color: "gray" },
          ],
        },
      },
      target_date: { date: {} },
      published_url: { url: {} },
      knowledge_ref: { rich_text: {} },
      created_at: { created_time: {} },
    },
  }),
});

const body = await res.json();
if (!res.ok) {
  console.error(`Error ${res.status}: ${JSON.stringify(body)}`);
  process.exit(1);
}
console.log(JSON.stringify({ id: body.id, url: body.url }, null, 2));
console.log("\nSet this as NOTION_DB_CONTENT_ID in your env.");
