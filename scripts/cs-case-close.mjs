#!/usr/bin/env node
/**
 * cs-case-close.mjs <notion-page-id> <resolution-text>
 * 例: node scripts/cs-case-close.mjs abc123 "料金は月額9,800円と案内しました"
 */
import process from "node:process";

const token = process.env.NOTION_TOKEN;
const knowledgeDbId = process.env.NOTION_DB_KNOWLEDGE_ID;
if (!token) { console.error("Set NOTION_TOKEN"); process.exit(1); }

const [,, pageId, resolution] = process.argv;
if (!pageId || !resolution) {
  console.error("Usage: cs-case-close.mjs <notion-page-id> <resolution-text>");
  process.exit(1);
}

const CATEGORY_MAP = {
  pricing: "market",
  enrollment: "education",
  visa: "regulation",
  accommodation: "locale",
  curriculum: "education",
  technical: "technology",
  other: "method",
};

// 1. ページ取得（category と faq_candidate を読む）
const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
  headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
});
if (!pageRes.ok) { const e = await pageRes.json(); console.error(`Get error ${pageRes.status}: ${JSON.stringify(e)}`); process.exit(1); }
const page = await pageRes.json();

const faqCandidate = page.properties?.faq_candidate?.checkbox ?? false;
const csCategory = page.properties?.category?.select?.name ?? "other";
const caseTitle = page.properties?.title_field?.title?.[0]?.plain_text ?? "CSケース";

// 2. ステータスを resolved に更新
const updateRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
  body: JSON.stringify({
    properties: {
      status: { select: { name: "resolved" } },
      resolved_at: { date: { start: new Date().toISOString() } },
      resolution: { rich_text: [{ text: { content: resolution.slice(0, 2000) } }] },
    },
  }),
});
if (!updateRes.ok) { const e = await updateRes.json(); console.error(`Update error ${updateRes.status}: ${JSON.stringify(e)}`); process.exit(1); }
console.log(`Closed: ${pageId}`);

// 3. faq_candidate=true ならナレッジDBに投入
if (faqCandidate) {
  if (!knowledgeDbId) { console.error("Set NOTION_DB_KNOWLEDGE_ID for knowledge insertion"); process.exit(1); }
  const knCategory = CATEGORY_MAP[csCategory] ?? "method";
  const tags = ["CS", "FAQ", csCategory].filter(Boolean);

  const knRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify({
      parent: { database_id: knowledgeDbId },
      properties: {
        title_field: { title: [{ text: { content: caseTitle } }] },
        category: { select: { name: knCategory } },
        subcategory: { rich_text: [{ text: { content: "cs_faq" } }] },
        content: { rich_text: [{ text: { content: resolution.slice(0, 2000) } }] },
        tags: { multi_select: tags.map(name => ({ name })) },
        source: { select: { name: "client_feedback" } },
        reliability: { select: { name: "unverified" } },
      },
    }),
  });
  if (!knRes.ok) { const e = await knRes.json(); console.error(`Knowledge error ${knRes.status}: ${JSON.stringify(e)}`); process.exit(1); }
  console.log(`Knowledge added: category=${knCategory}, tags=${tags.join(",")}`);
}
