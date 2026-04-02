#!/usr/bin/env node
/**
 * Notion Knowledge Base → Obsidian Vault (markdown) 同期
 * QMDのローカル検索速度を維持するためのsync
 *
 * Usage: NOTION_TOKEN=xxx NOTION_DB_KNOWLEDGE_ID=xxx node scripts/sync-notion-knowledge-to-obsidian.mjs
 */
import process from "node:process";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_KNOWLEDGE_ID;
const vaultDir =
  process.env.OBSIDIAN_KNOWLEDGE_DIR ||
  join(process.env.HOME, "Documents", "Obsidian Vault", "knowledge");

if (!token || !dbId) {
  console.error(
    "Missing env. Set NOTION_TOKEN and NOTION_DB_KNOWLEDGE_ID, then re-run.",
  );
  process.exit(1);
}

const notionVersion = "2022-06-28";

function richTextToPlain(rt) {
  if (!rt || !Array.isArray(rt)) return "";
  return rt.map((t) => t.plain_text || "").join("");
}

const cursorFile = join(vaultDir, ".sync-cursor");

function loadLastSync() {
  try { return readFileSync(cursorFile, "utf-8").trim(); } catch { return null; }
}

function saveLastSync(iso) {
  writeFileSync(cursorFile, iso, "utf-8");
}

async function fetchPages(since) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (since) {
      body.filter = {
        property: "created_at",
        created_time: { on_or_after: since },
      };
    }
    const res = await fetch(
      `https://api.notion.com/v1/databases/${dbId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": notionVersion,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) throw new Error(`Notion query error: ${res.status}`);
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

function pageToMarkdown(page) {
  const p = page.properties;
  const title = richTextToPlain(p.title_field?.title) || "untitled";
  const category = p.category?.select?.name || "";
  const subcategory = richTextToPlain(p.subcategory?.rich_text) || "";
  const content = richTextToPlain(p.content?.rich_text) || "";
  const tags = (p.tags?.multi_select || []).map((t) => t.name);
  const source = p.source?.select?.name || "";
  const reliability = p.reliability?.select?.name || "";

  return `---
title: "${title.replace(/"/g, '\\"')}"
category: ${category}
subcategory: ${subcategory}
source: ${source}
reliability: ${reliability}
tags: [${tags.join(", ")}]
notion_id: ${page.id}
---

${content}
`;
}

function sanitizeFilename(name) {
  return name.replace(/[/\\:*?"<>|]/g, "_").slice(0, 100);
}

async function main() {
  if (!existsSync(vaultDir)) {
    mkdirSync(vaultDir, { recursive: true });
  }

  const lastSync = process.argv.includes("--full") ? null : loadLastSync();
  console.log(lastSync ? `Incremental sync since ${lastSync}...` : "Full sync...");
  const pages = await fetchPages(lastSync);
  console.log(`Found ${pages.length} entries. Syncing to ${vaultDir}...`);

  let count = 0;
  for (const page of pages) {
    const p = page.properties;
    const title = richTextToPlain(p.title_field?.title) || "untitled";
    const category = p.category?.select?.name || "uncategorized";

    const catDir = join(vaultDir, category);
    if (!existsSync(catDir)) mkdirSync(catDir, { recursive: true });

    const filename = `${sanitizeFilename(title)}.md`;
    writeFileSync(join(catDir, filename), pageToMarkdown(page), "utf-8");
    count++;
  }

  saveLastSync(new Date().toISOString());
  console.log(`Sync complete: ${count} files written to ${vaultDir}`);
}

main();
