#!/usr/bin/env node
/**
 * Notion (Knowledge / Content Pipeline / CS Cases) → Obsidian Vault (markdown) 同期
 *
 * Usage:
 *   node scripts/sync-notion-to-obsidian.mjs [knowledge|content|cs|all]
 *
 * Env:
 *   NOTION_TOKEN            (required)
 *   NOTION_DB_KNOWLEDGE_ID  (required for knowledge/all)
 *   NOTION_DB_CONTENT_ID    (required for content/all)
 *   NOTION_DB_CS_ID         (required for cs/all)
 *   OBSIDIAN_VAULT_PATH     (default: ~/obsidian-vault)
 */
import process from "node:process";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const token = process.env.NOTION_TOKEN;
if (!token) {
  console.error("Missing NOTION_TOKEN");
  process.exit(1);
}

const vaultBase =
  process.env.OBSIDIAN_VAULT_PATH ||
  join(process.env.HOME, "obsidian-vault");

const notionVersion = "2022-06-28";

const DB_CONFIG = {
  knowledge: {
    envKey: "NOTION_DB_KNOWLEDGE_ID",
    folder: "notion-sync/knowledge",
    titleField: "title_field",
    toMarkdown: knowledgeToMarkdown,
  },
  content: {
    envKey: "NOTION_DB_CONTENT_ID",
    folder: "notion-sync/content-pipeline",
    titleField: "title",
    toMarkdown: contentToMarkdown,
  },
  cs: {
    envKey: "NOTION_DB_CS_ID",
    folder: "notion-sync/cs-cases",
    titleField: "title",
    toMarkdown: csToMarkdown,
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────

function richTextToPlain(rt) {
  if (!rt || !Array.isArray(rt)) return "";
  return rt.map((t) => t.plain_text || "").join("");
}

function sanitizeFilename(name) {
  return name.replace(/[/\\:*?"<>|]/g, "-").replace(/-+/g, "-").slice(0, 120);
}

// ── page → markdown converters ───────────────────────────────────────────────

function knowledgeToMarkdown(page) {
  const p = page.properties;
  const title = richTextToPlain(p.title_field?.title) || "untitled";
  const category = p.category?.select?.name || "";
  const subcategory = richTextToPlain(p.subcategory?.rich_text) || "";
  const content = richTextToPlain(p.content?.rich_text) || "";
  const tags = (p.tags?.multi_select || []).map((t) => t.name);
  const source = p.source?.select?.name || "";
  const reliability = p.reliability?.select?.name || "";
  const createdAt = page.created_time || "";

  return `---
title: "${title.replace(/"/g, '\\"')}"
category: ${category}
subcategory: ${subcategory}
source: ${source}
reliability: ${reliability}
tags: [${tags.join(", ")}]
notion_id: ${page.id}
created_at: ${createdAt}
---

${content}
`;
}

function contentToMarkdown(page) {
  const p = page.properties;
  const title =
    richTextToPlain(p.title?.title) ||
    richTextToPlain(p.Name?.title) ||
    "untitled";
  const status = p.status?.select?.name || p.Status?.select?.name || "";
  const platform =
    p.platform?.select?.name || p.Platform?.select?.name || "";
  const tags = (
    p.tags?.multi_select ||
    p.Tags?.multi_select ||
    []
  ).map((t) => t.name);
  const publishDate =
    p.publish_date?.date?.start ||
    p["Publish Date"]?.date?.start ||
    "";
  const body =
    richTextToPlain(p.content?.rich_text) ||
    richTextToPlain(p.Content?.rich_text) ||
    "";

  return `---
title: "${title.replace(/"/g, '\\"')}"
status: ${status}
platform: ${platform}
tags: [${tags.join(", ")}]
publish_date: ${publishDate}
notion_id: ${page.id}
created_at: ${page.created_time || ""}
---

${body}
`;
}

function csToMarkdown(page) {
  const p = page.properties;
  const title =
    richTextToPlain(p.title?.title) ||
    richTextToPlain(p.Name?.title) ||
    "untitled";
  const status = p.status?.select?.name || p.Status?.select?.name || "";
  const category =
    p.category?.select?.name || p.Category?.select?.name || "";
  const summary =
    richTextToPlain(p.summary?.rich_text) ||
    richTextToPlain(p.Summary?.rich_text) ||
    "";
  const resolution =
    richTextToPlain(p.resolution?.rich_text) ||
    richTextToPlain(p.Resolution?.rich_text) ||
    "";
  const tags = (
    p.tags?.multi_select ||
    p.Tags?.multi_select ||
    []
  ).map((t) => t.name);

  return `---
title: "${title.replace(/"/g, '\\"')}"
status: ${status}
category: ${category}
tags: [${tags.join(", ")}]
notion_id: ${page.id}
created_at: ${page.created_time || ""}
---

## Summary
${summary}

## Resolution
${resolution}
`;
}

// ── notion fetch ──────────────────────────────────────────────────────────────

async function fetchAllPages(dbId) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
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
    if (!res.ok) throw new Error(`Notion query error: ${res.status} for db ${dbId}`);
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

// ── sync one DB ───────────────────────────────────────────────────────────────

async function syncDb(name, config) {
  const dbId = process.env[config.envKey];
  if (!dbId) {
    console.warn(`Skipping ${name}: ${config.envKey} not set`);
    return 0;
  }

  const outDir = join(vaultBase, config.folder);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`Fetching ${name} (db: ${dbId.slice(0, 8)}...)...`);
  const pages = await fetchAllPages(dbId);
  console.log(`  ${pages.length} pages found`);

  let count = 0;
  for (const page of pages) {
    const p = page.properties;
    const titleProp =
      p[config.titleField]?.title ||
      p.title?.title ||
      p.Name?.title ||
      [];
    const title = richTextToPlain(titleProp) || `untitled-${page.id.slice(0, 8)}`;
    const filename = `${sanitizeFilename(title)}.md`;
    const md = config.toMarkdown(page);
    writeFileSync(join(outDir, filename), md, "utf-8");
    count++;
  }

  console.log(`  → ${count} files written to ${outDir}`);
  return count;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2] || "all";
  const targets =
    arg === "all"
      ? Object.keys(DB_CONFIG)
      : arg.split(",").map((s) => s.trim()).filter((s) => DB_CONFIG[s]);

  if (targets.length === 0) {
    console.error(`Unknown target: ${arg}. Use knowledge|content|cs|all`);
    process.exit(1);
  }

  let total = 0;
  for (const name of targets) {
    total += await syncDb(name, DB_CONFIG[name]);
  }

  console.log(`\nDone. Total ${total} files synced to ${vaultBase}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
