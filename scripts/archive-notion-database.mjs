#!/usr/bin/env node
/**
 * Archive all active pages in a Notion database (by database_id).
 * Usage: NOTION_TOKEN=... node scripts/archive-notion-database.mjs <database_id>
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const databaseId = process.argv[2];

if (!token || !databaseId) {
  console.error("Usage: NOTION_TOKEN=... node scripts/archive-notion-database.mjs <database_id>");
  process.exit(1);
}

const notionVersion = "2022-06-28";
const baseUrl = "https://api.notion.com/v1";
const headers = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": notionVersion,
  "Content-Type": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listAll() {
  const out = [];
  let cursor;
  do {
    const res = await fetch(`${baseUrl}/databases/${databaseId}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(j));
    out.push(...(j.results ?? []).filter((r) => !r.archived));
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return out;
}

async function archivePage(id) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(`${baseUrl}/pages/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ archived: true }),
    });
    if (res.ok) return;
    const j = await res.json();
    if (res.status === 429) {
      await sleep(350 * (i + 1));
      continue;
    }
    throw new Error(JSON.stringify(j));
  }
  throw new Error("rate_limited");
}

const rows = await listAll();
let n = 0;
for (const r of rows) {
  await archivePage(r.id);
  n++;
  if (n % 25 === 0) console.log(`${n}/${rows.length}`);
}
console.log(`archived ${rows.length} pages from ${databaseId}`);
