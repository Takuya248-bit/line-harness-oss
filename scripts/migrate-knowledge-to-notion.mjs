#!/usr/bin/env node
/**
 * Workers D1 の knowledge_entries → Notion Knowledge Base へ移行
 * Usage: NOTION_TOKEN=xxx NOTION_DB_KNOWLEDGE_ID=xxx node scripts/migrate-knowledge-to-notion.mjs
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_KNOWLEDGE_ID;
const sourceApi =
  process.env.KNOWLEDGE_API_URL ||
  "https://ig-auto-poster.archbridge24.workers.dev/api/knowledge";

if (!token || !dbId) {
  console.error(
    "Missing env. Set NOTION_TOKEN and NOTION_DB_KNOWLEDGE_ID, then re-run.",
  );
  process.exit(1);
}

const notionVersion = "2022-06-28";

async function fetchAllKnowledge() {
  // まずカテゴリ一覧を取得
  const indexRes = await fetch(sourceApi);
  if (!indexRes.ok) throw new Error(`Source API error: ${indexRes.status}`);
  const index = await indexRes.json();

  const allEntries = [];
  for (const cat of index.categories || []) {
    const res = await fetch(`${sourceApi}?category=${cat.category}&limit=1000`);
    if (!res.ok) {
      console.error(`  Skip ${cat.category}: ${res.status}`);
      continue;
    }
    const data = await res.json();
    const entries = data.entries || [];
    allEntries.push(...entries);
    console.log(`  ${cat.category}: ${entries.length} entries`);
  }
  return allEntries;
}

function toNotionPage(entry) {
  const tags = (entry.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((name) => ({ name }));

  return {
    parent: { database_id: dbId },
    properties: {
      title_field: { title: [{ text: { content: entry.title || "" } }] },
      category: entry.category ? { select: { name: entry.category } } : undefined,
      subcategory: {
        rich_text: [{ text: { content: entry.subcategory || "" } }],
      },
      content: {
        rich_text: [{ text: { content: (entry.content || "").slice(0, 2000) } }],
      },
      tags: { multi_select: tags },
      source: entry.source ? { select: { name: entry.source } } : undefined,
      reliability: entry.reliability
        ? { select: { name: entry.reliability } }
        : undefined,
      use_count: { number: entry.use_count || 0 },
    },
  };
}

async function createNotionPage(page) {
  // undefined プロパティを除去
  const props = Object.fromEntries(
    Object.entries(page.properties).filter(([, v]) => v !== undefined),
  );
  page.properties = props;

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(page),
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(`Notion error ${res.status}: ${JSON.stringify(body)}`);
  }
  return res.json();
}

async function main() {
  console.log("Fetching knowledge entries from Workers API...");
  const entries = await fetchAllKnowledge();
  console.log(`Found ${entries.length} entries. Migrating...`);

  let ok = 0;
  let fail = 0;
  for (const entry of entries) {
    try {
      await createNotionPage(toNotionPage(entry));
      ok++;
      if (ok % 10 === 0) console.log(`  ${ok}/${entries.length} done`);
      // Notion API rate limit: 3 req/sec
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      fail++;
      console.error(`  FAIL [${entry.title}]: ${e.message}`);
    }
  }

  console.log(`\nMigration complete: ${ok} success, ${fail} failed`);
}

main();
