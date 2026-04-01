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
  title: [{ type: "text", text: { content: "CS Cases" } }],
  properties: {
    title_field: { title: {} },
    status: {
      select: {
        options: [
          { name: "open" },
          { name: "in_progress" },
          { name: "resolved" },
          { name: "escalated" },
        ],
      },
    },
    category: {
      select: {
        options: [
          { name: "pricing" },
          { name: "enrollment" },
          { name: "visa" },
          { name: "accommodation" },
          { name: "curriculum" },
          { name: "technical" },
          { name: "other" },
        ],
      },
    },
    channel: {
      select: {
        options: [
          { name: "line" },
          { name: "email" },
          { name: "instagram" },
          { name: "phone" },
        ],
      },
    },
    customer_name: { rich_text: {} },
    summary: { rich_text: {} },
    resolution: { rich_text: {} },
    faq_candidate: { checkbox: {} },
    knowledge_ref: { rich_text: {} },
    resolved_at: { date: {} },
    created_at: { created_time: {} },
  },
};

const result = await notionCreateDatabase(payload);
console.log(JSON.stringify({ id: result.id, url: result.url }, null, 2));
