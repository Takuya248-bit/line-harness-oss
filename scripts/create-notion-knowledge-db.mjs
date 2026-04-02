#!/usr/bin/env node
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

if (!token || !parentPageId) {
  console.error(
    "Missing env. Set NOTION_TOKEN and NOTION_PARENT_PAGE_ID, then re-run.",
  );
  process.exit(1);
}

const notionVersion = "2022-06-28";
const baseUrl = "https://api.notion.com/v1";

async function notionCreateDatabase(payload) {
  const res = await fetch(`${baseUrl}/databases`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Notion API error ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const payload = {
  parent: { type: "page_id", page_id: parentPageId },
  title: [{ type: "text", text: { content: "Knowledge Base" } }],
  properties: {
    title_field: { title: {} },
    category: {
      select: {
        options: [
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
    subcategory: { rich_text: {} },
    content: { rich_text: {} },
    tags: { multi_select: {} },
    source: {
      select: {
        options: [
          { name: "firsthand" },
          { name: "student_feedback" },
          { name: "client_feedback" },
          { name: "observation" },
          { name: "research" },
          { name: "auto" },
          { name: "experiment" },
        ],
      },
    },
    reliability: {
      select: {
        options: [{ name: "verified" }, { name: "unverified" }],
      },
    },
    use_count: { number: { format: "number" } },
    created_at: { created_time: {} },
  },
};

const result = await notionCreateDatabase(payload);
console.log(JSON.stringify({ id: result.id, url: result.url }, null, 2));
