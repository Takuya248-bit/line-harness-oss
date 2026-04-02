#!/usr/bin/env node
/**
 * Content Pipeline DB と CS Cases DB の状態を集計してレポートする
 * Usage: node scripts/content-pipeline-report.mjs [--append-progress]
 * 環境変数: NOTION_TOKEN, NOTION_DB_CONTENT_ID, NOTION_DB_CS_ID
 */
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { queryAll } from "./lib/notion-helpers.mjs";

const contentDbId = process.env.NOTION_DB_CONTENT_ID;
const csDbId = process.env.NOTION_DB_CS_ID;

if (!process.env.NOTION_TOKEN || !contentDbId || !csDbId) {
  console.error("Set NOTION_TOKEN, NOTION_DB_CONTENT_ID, NOTION_DB_CS_ID");
  process.exit(1);
}

const appendProgress = process.argv.includes("--append-progress");

function getSelect(page, prop) {
  return page.properties[prop]?.select?.name ?? null;
}

function getMultiSelect(page, prop) {
  return (page.properties[prop]?.multi_select ?? []).map(s => s.name);
}

function getCheckbox(page, prop) {
  return page.properties[prop]?.checkbox ?? false;
}

function getTitle(page, prop) {
  const t = page.properties[prop]?.title ?? [];
  return t.map(r => r.plain_text ?? "").join("") || "(無題)";
}

function getCreatedTime(page) {
  return new Date(page.created_time);
}

function countBy(arr, fn) {
  const counts = {};
  for (const item of arr) {
    const key = fn(item) ?? "(未設定)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function formatCounts(counts) {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `  - ${k}: ${v}件`)
    .join("\n");
}

const now = new Date();
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

// --- Fetch ---
const [contentPages, csPages] = await Promise.all([
  queryAll(contentDbId),
  queryAll(csDbId),
]);

// --- Content Pipeline 集計 ---
const contentStatusCounts = countBy(contentPages, p => getSelect(p, "status"));

const channelCounts = {};
for (const p of contentPages) {
  for (const ch of getMultiSelect(p, "channel")) {
    channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
  }
}
if (Object.keys(channelCounts).length === 0) channelCounts["(未設定)"] = contentPages.filter(p => getMultiSelect(p, "channel").length === 0).length;

const stalledIdeas = contentPages.filter(p => {
  const status = getSelect(p, "status");
  const created = getCreatedTime(p);
  return status === "idea" && created < sevenDaysAgo;
});

const recentPublished = contentPages.filter(p => {
  const status = getSelect(p, "status");
  const created = getCreatedTime(p);
  return status === "published" && created >= sevenDaysAgo;
});

// --- CS Cases 集計 ---
const csStatusCounts = countBy(csPages, p => getSelect(p, "status"));

const faqUnresolved = csPages.filter(p => {
  const faq = getCheckbox(p, "faq_candidate");
  const status = getSelect(p, "status");
  return faq && status !== "resolved";
});

const categoryCounts = countBy(csPages, p => getSelect(p, "category"));

// --- レポート生成 ---
const today = now.toISOString().slice(0, 10);

const lines = [
  `# Content Pipeline & CS Cases レポート`,
  `生成日時: ${now.toISOString().replace("T", " ").slice(0, 19)} JST`,
  "",
  "## Content Pipeline",
  "",
  "### status別件数",
  formatCounts(contentStatusCounts),
  "",
  "### channel別件数",
  formatCounts(channelCounts),
  "",
  `### idea滞留（7日以上、${stalledIdeas.length}件）`,
  stalledIdeas.length === 0
    ? "  なし"
    : stalledIdeas.map(p => {
        const title = getTitle(p, "title_field") || getTitle(p, "Name") || getTitle(p, "title");
        const created = getCreatedTime(p).toISOString().slice(0, 10);
        return `  - ${title}（作成: ${created}）`;
      }).join("\n"),
  "",
  `### 直近7日間の公開数: ${recentPublished.length}件`,
  "",
  "---",
  "",
  "## CS Cases",
  "",
  "### status別件数",
  formatCounts(csStatusCounts),
  "",
  `### FAQ候補・未処理件数: ${faqUnresolved.length}件`,
  faqUnresolved.length > 0
    ? faqUnresolved.map(p => {
        const title = getTitle(p, "title_field") || getTitle(p, "Name") || getTitle(p, "title");
        const status = getSelect(p, "status") ?? "未設定";
        return `  - ${title}（${status}）`;
      }).join("\n")
    : "  なし",
  "",
  "### category別問い合わせ分布",
  formatCounts(categoryCounts),
].join("\n");

console.log(lines);

// --- progress.md への追記 ---
if (appendProgress) {
  const notesDir = path.join(process.cwd(), ".company/secretary/notes");
  const progressFile = path.join(notesDir, `${today}-progress.md`);
  const time = now.toTimeString().slice(0, 5);
  const entry = [
    "",
    `## ${time} [content-pipeline-report]`,
    `- 作業内容: Content Pipeline & CS Cases レポート生成`,
    `- 対象: NOTION_DB_CONTENT_ID / NOTION_DB_CS_ID`,
    `- 結果: 完了`,
    `- 変更点:`,
    `  - Content: ${contentPages.length}件取得、status集計、idea滞留${stalledIdeas.length}件、直近公開${recentPublished.length}件`,
    `  - CS: ${csPages.length}件取得、status集計、FAQ未処理${faqUnresolved.length}件`,
  ].join("\n");

  try {
    fs.mkdirSync(notesDir, { recursive: true });
    fs.appendFileSync(progressFile, entry + "\n");
    console.error(`\nprogress.md に追記しました: ${progressFile}`);
  } catch (e) {
    console.error(`\nprogress.md 追記失敗: ${e.message}`);
  }
}
