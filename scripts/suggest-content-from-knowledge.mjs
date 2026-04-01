#!/usr/bin/env node
/**
 * 未活用ナレッジを分析してContent Pipeline DBにネタ候補を投入する
 * Usage: node scripts/suggest-content-from-knowledge.mjs [--auto]
 * 環境変数: NOTION_TOKEN, NOTION_DB_KNOWLEDGE_ID, NOTION_DB_CONTENT_ID
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const knowledgeDbId = process.env.NOTION_DB_KNOWLEDGE_ID;
const contentDbId = process.env.NOTION_DB_CONTENT_ID;
if (!token || !knowledgeDbId || !contentDbId) {
  console.error("Set NOTION_TOKEN, NOTION_DB_KNOWLEDGE_ID, NOTION_DB_CONTENT_ID");
  process.exit(1);
}

const autoFlag = process.argv.includes("--auto");

/** Notion Database を全ページ取得（ページネーション対応） */
async function queryAll(dbId, filter) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.json(); console.error(`Query error ${res.status}: ${JSON.stringify(e)}`); process.exit(1); }
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

/** Notion ページのプロパティからテキストを取得するユーティリティ */
function getText(prop) {
  if (!prop) return "";
  if (prop.title) return prop.title.map(t => t.plain_text).join("");
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join("");
  if (prop.select) return prop.select?.name ?? "";
  return "";
}

// 1. ナレッジDB全取得
console.log("ナレッジDB取得中...");
const knowledgePages = await queryAll(knowledgeDbId);
console.log(`  ${knowledgePages.length}件取得`);

// 2. Content Pipeline DB全取得 → knowledge_ref一覧を収集
console.log("Content Pipeline DB取得中...");
const contentPages = await queryAll(contentDbId);
console.log(`  ${contentPages.length}件取得`);

const usedRefs = new Set();
for (const page of contentPages) {
  const ref = getText(page.properties?.knowledge_ref);
  if (ref) ref.split(",").forEach(r => usedRefs.add(r.trim()));
}

// 3. 未活用ナレッジを判定
const unused = knowledgePages.filter(p => !usedRefs.has(p.id));
console.log(`\n未活用ナレッジ: ${unused.length}件 / 全${knowledgePages.length}件`);

// 4. categoryごとに未活用件数を集計
const byCat = {};
for (const p of unused) {
  const cat = getText(p.properties?.category) || "uncategorized";
  const title = getText(p.properties?.title_field) || getText(p.properties?.Name) || "(無題)";
  if (!byCat[cat]) byCat[cat] = [];
  byCat[cat].push({ id: p.id, title });
}

// 5. 未活用3件以上のカテゴリを表示
const candidates = Object.entries(byCat).filter(([, items]) => items.length >= 3);
if (candidates.length === 0) {
  console.log("\n未活用3件以上のカテゴリなし。終了。");
  process.exit(0);
}

console.log("\n--- 未活用3件以上のカテゴリ ---");
for (const [cat, items] of candidates.sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n[${cat}] ${items.length}件`);
  items.forEach(({ title }) => console.log(`  - ${title}`));
}

if (!autoFlag) {
  console.log("\n--auto フラグなし。投入をスキップ。");
  process.exit(0);
}

// 6. --auto: Content Pipeline DBに自動投入
/** チャンネル判定 */
function resolveChannel(cat) {
  if (cat === "education") return "x_barilingual";
  if (cat === "technology" || cat === "ai_news") return "x_lcustom";
  return "seo_article";
}

/** 優先度判定 */
function resolvePriority(count) {
  if (count >= 5) return "high";
  return "medium";
}

console.log("\n--- Content Pipeline DBへ投入中 ---");
for (const [cat, items] of candidates) {
  const title = `${cat}まとめ — 未活用ナレッジ${items.length}件`;
  const channel = resolveChannel(cat);
  const angle = items.map(i => i.title).join("\n").slice(0, 2000);
  const priority = resolvePriority(items.length);
  const knowledgeRef = items.map(i => i.id).join(",");

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify({
      parent: { database_id: contentDbId },
      properties: {
        title_field: { title: [{ text: { content: title } }] },
        status: { select: { name: "idea" } },
        channel: { multi_select: [{ name: channel }] },
        category: { select: { name: cat } },
        angle: { rich_text: [{ text: { content: angle } }] },
        priority: { select: { name: priority } },
        knowledge_ref: { rich_text: [{ text: { content: knowledgeRef } }] },
      },
    }),
  });

  if (!res.ok) {
    const e = await res.json();
    console.error(`  [${cat}] 失敗 ${res.status}: ${JSON.stringify(e)}`);
  } else {
    const body = await res.json();
    console.log(`  [${cat}] 投入OK: ${body.url}`);
  }
}
console.log("完了。");
