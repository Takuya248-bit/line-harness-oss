#!/usr/bin/env node
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const notionVersion = "2022-06-28";
const baseUrl = "https://api.notion.com/v1";

if (!token) {
  console.error("Missing env. Set NOTION_TOKEN, then re-run.");
  process.exit(1);
}

async function notionFetch(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Notion API error ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

// Resolve parent: NOTION_PARENT_PAGE_ID or retrieve from knowledge DB's parent
async function resolveParent() {
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  if (parentPageId) {
    return { type: "page_id", page_id: parentPageId };
  }

  const knowledgeDbId = process.env.NOTION_DB_KNOWLEDGE_ID;
  if (!knowledgeDbId) {
    console.error(
      "Missing env. Set NOTION_PARENT_PAGE_ID or NOTION_DB_KNOWLEDGE_ID.",
    );
    process.exit(1);
  }

  console.log(`NOTION_PARENT_PAGE_ID not set. Fetching parent from knowledge DB (${knowledgeDbId})...`);
  const db = await notionFetch(`/databases/${knowledgeDbId}`);
  const parent = db.parent;
  console.log(`Using parent: ${JSON.stringify(parent)}`);
  return parent;
}

const parent = await resolveParent();

const payload = {
  parent,
  title: [{ type: "text", text: { content: "X投稿ドラフト" } }],
  properties: {
    投稿テキスト: { title: {} },
    status: {
      select: {
        options: [
          { name: "draft" },
          { name: "approved" },
          { name: "posted" },
          { name: "rejected" },
        ],
      },
    },
    source_entry_id: { rich_text: {} },
    account: {
      select: {
        options: [
          { name: "barilingual" },
          { name: "lcustom" },
        ],
      },
    },
    created_at: { created_time: {} },
  },
};

const result = await notionFetch("/databases", {
  method: "POST",
  body: JSON.stringify(payload),
});

console.log(JSON.stringify({ id: result.id, url: result.url }, null, 2));

// Append to ~/.env.notion
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const envPath = join(homedir(), ".env.notion");
appendFileSync(envPath, `\nexport NOTION_DB_X_DRAFTS_ID="${result.id}"\n`);
console.log(`\nAppended NOTION_DB_X_DRAFTS_ID to ${envPath}`);
