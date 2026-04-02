#!/usr/bin/env node
/**
 * knowledge-save.mjs — Notion DB + Obsidian Vault 同時投入
 *
 * Usage:
 *   node scripts/knowledge-save.mjs <category> <subcategory> <title> <content> [tags] [source] [reliability] [url]
 *
 * 例:
 *   node scripts/knowledge-save.mjs technology line_api "Webhook署名検証" "HMACで検証する手順..." "LINE,webhook" research verified "https://..."
 */
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// --- 環境変数 ---
const envFile = path.join(process.env.HOME, ".env.notion");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^export\s+(\w+)="(.*)"/);
    if (m) process.env[m[1]] = m[2];
  }
}

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_KNOWLEDGE_ID;
if (!token || !dbId) {
  console.error("Set NOTION_TOKEN and NOTION_DB_KNOWLEDGE_ID in ~/.env.notion");
  process.exit(1);
}

const [,, category, subcategory, title, content, tags, source, reliability, url] = process.argv;
if (!category || !title || !content) {
  console.error("Usage: knowledge-save.mjs <cat> <subcat> <title> <content> [tags] [source] [reliability] [url]");
  process.exit(1);
}

const tagList = (tags || "").split(",").filter(Boolean).map(t => t.trim());
const srcVal = source || "research";
const relVal = reliability || "unverified";
const now = new Date();
const dateStr = now.toISOString().slice(0, 10);

// --- 1. Notion DB 投入 ---
async function saveToNotion() {
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
        subcategory: { rich_text: [{ text: { content: subcategory || "" } }] },
        content: { rich_text: [{ text: { content: content.slice(0, 2000) } }] },
        tags: { multi_select: tagList.map(name => ({ name })) },
        source: { select: { name: srcVal } },
        reliability: { select: { name: relVal } },
      },
    }),
  });
  if (!res.ok) {
    const e = await res.json();
    console.error(`Notion error ${res.status}: ${JSON.stringify(e)}`);
    return false;
  }
  return true;
}

// --- 2. Obsidian Vault 保存 ---
function saveToObsidian() {
  const vaultDir = path.join(process.env.HOME, "Documents", "Obsidian Vault", "knowledge", "Research");
  if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir, { recursive: true });

  const safeTitle = title.replace(/[/\\:*?"<>|]/g, "_").slice(0, 80);
  const fileName = `${dateStr}-${safeTitle}.md`;
  const filePath = path.join(vaultDir, fileName);

  const frontmatter = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `category: ${category}`,
    `subcategory: ${subcategory || ""}`,
    `tags: [${tagList.map(t => `"${t}"`).join(", ")}]`,
    `source: ${srcVal}`,
    `reliability: ${relVal}`,
    `date: ${dateStr}`,
    url ? `url: "${url}"` : null,
    "---",
  ].filter(Boolean).join("\n");

  const body = `${frontmatter}\n\n# ${title}\n\n${content}\n${url ? `\n## Source\n${url}\n` : ""}`;

  fs.writeFileSync(filePath, body, "utf-8");
  return filePath;
}

// --- 3. QMD インデックス更新 ---
function updateQmd() {
  try {
    execSync("npx @tobilu/qmd update", { timeout: 30000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// --- 実行 ---
const results = { notion: false, obsidian: null, qmd: false };

results.notion = await saveToNotion();
results.obsidian = saveToObsidian();
results.qmd = updateQmd();

console.log(JSON.stringify({
  status: results.notion ? "OK" : "PARTIAL",
  notion: results.notion ? "saved" : "failed",
  obsidian: results.obsidian || "failed",
  qmd: results.qmd ? "updated" : "skipped",
}));
