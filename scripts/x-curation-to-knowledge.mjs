#!/usr/bin/env node
/**
 * x-curation-to-knowledge.mjs
 * .company/x-insights/*.md を走査し、AI系インサイトを Notion ナレッジDBに投入する
 * カテゴリ判定: technology / method / ai_news（それ以外はスキップ）
 * 投入済みファイルには frontmatter に notion_synced: true を追記（重複防止）
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_KNOWLEDGE_ID;

if (!token || !dbId) {
  console.error("Set NOTION_TOKEN and NOTION_DB_KNOWLEDGE_ID");
  process.exit(1);
}

const INSIGHTS_DIR = path.resolve(process.cwd(), ".company/x-insights");

if (!fs.existsSync(INSIGHTS_DIR)) {
  console.log("No x-insights directory found");
  process.exit(0);
}

/** frontmatter を parse して { meta, body } を返す */
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) meta[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: match[2] };
}

/** frontmatter に notion_synced: true を追記して上書き保存 */
function markSynced(filePath, originalText, meta) {
  meta.notion_synced = "true";
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join("\n");
  const body = originalText.replace(/^---\n[\s\S]*?\n---\n?/, "");
  fs.writeFileSync(filePath, `---\n${lines}\n---\n${body}`, "utf8");
}

/** カテゴリ判定 */
function detectCategory(meta, body) {
  const text = `${meta.category || ""} ${meta.tags || ""} ${body}`.toLowerCase();
  const SKIP_PATTERNS = /marketing|business|sales|brand|advertis|商業|マーケ|ビジネス|セールス/;
  if (SKIP_PATTERNS.test(text)) return null;
  if (/ai.news|ai_news|llm.news|gpt|openai|anthropic|gemini|llm.update/.test(text)) return "ai_news";
  if (/engineer|technology|tech|framework|library|code|開発|技術|実装|アーキ/.test(text)) return "technology";
  if (/method|workflow|process|template|guide|手法|ワークフロー|プロセス|運用/.test(text)) return "method";
  return null;
}

/** キーワード抽出（frontmatter tags 優先、なければ本文から簡易抽出） */
function extractTags(meta, body) {
  if (meta.tags) {
    return meta.tags
      .replace(/[\[\]]/g, "")
      .split(/[,、]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  const words = body.match(/\b[A-Z][a-zA-Z]{3,}\b/g) || [];
  return [...new Set(words)].slice(0, 5);
}

/** タイトル抽出 */
function extractTitle(meta, body, fileName) {
  if (meta.title) return meta.title;
  const h1 = body.match(/^#\s+(.+)/m);
  if (h1) return h1[1].trim();
  return path.basename(fileName, ".md");
}

/** 要約抽出（最初の段落 or 本文先頭 800 文字） */
function extractSummary(body) {
  const stripped = body.replace(/^#+.*/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return stripped.slice(0, 800);
}

/** Notion に1件投入 */
async function postToNotion({ category, title, summary, tags }) {
  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        title_field: { title: [{ text: { content: title } }] },
        category: { select: { name: category } },
        subcategory: { rich_text: [{ text: { content: "x_curation" } }] },
        content: { rich_text: [{ text: { content: summary } }] },
        tags: {
          multi_select: tags.map((name) => ({ name })),
        },
        source: { select: { name: "research" } },
        reliability: { select: { name: "unverified" } },
      },
    }),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(`Notion API ${res.status}: ${JSON.stringify(e)}`);
  }
}

// ── メイン処理 ──────────────────────────────────────

const files = fs
  .readdirSync(INSIGHTS_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => path.join(INSIGHTS_DIR, f));

if (files.length === 0) {
  console.log("No .md files in x-insights directory");
  process.exit(0);
}

let synced = 0;
let skipped = 0;
let errors = 0;

for (const filePath of files) {
  const raw = fs.readFileSync(filePath, "utf8");
  const { meta, body } = parseFrontmatter(raw);

  if (meta.notion_synced === "true") {
    console.log(`[skip] already synced: ${path.basename(filePath)}`);
    skipped++;
    continue;
  }

  const category = detectCategory(meta, body);
  if (!category) {
    console.log(`[skip] non-AI category: ${path.basename(filePath)}`);
    skipped++;
    continue;
  }

  const title = extractTitle(meta, body, filePath);
  const summary = extractSummary(body);
  const tags = extractTags(meta, body);

  try {
    await postToNotion({ category, title, summary, tags });
    markSynced(filePath, raw, meta);
    console.log(`[ok] ${path.basename(filePath)} → ${category}`);
    synced++;
  } catch (err) {
    console.error(`[error] ${path.basename(filePath)}: ${err.message}`);
    errors++;
  }
}

console.log(`\nDone: synced=${synced}, skipped=${skipped}, errors=${errors}`);
if (errors > 0) process.exit(1);
