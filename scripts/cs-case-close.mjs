#!/usr/bin/env node
/**
 * cs-case-close.mjs <notion-page-id> <resolution-text>
 * 例: node scripts/cs-case-close.mjs abc123 "料金は月額9,800円と案内しました"
 */
import process from "node:process";
import { notionFetch, getPage, updatePage, createPage } from "./lib/notion-helpers.mjs";

const knowledgeDbId = process.env.NOTION_DB_KNOWLEDGE_ID;
const csDbId = process.env.NOTION_DB_CS_ID;
const contentDbId = process.env.NOTION_DB_CONTENT_ID;
if (!process.env.NOTION_TOKEN) { console.error("Set NOTION_TOKEN"); process.exit(1); }

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
const page = await getPage(pageId);

const faqCandidate = page.properties?.faq_candidate?.checkbox ?? false;
const csCategory = page.properties?.category?.select?.name ?? "other";
const caseTitle = page.properties?.title_field?.title?.[0]?.plain_text ?? "CSケース";

// 2. ステータスを resolved に更新
await updatePage(pageId, {
  status: { select: { name: "resolved" } },
  resolved_at: { date: { start: new Date().toISOString() } },
  resolution: { rich_text: [{ text: { content: resolution.slice(0, 2000) } }] },
});
console.log(`Closed: ${pageId}`);

// 3. 同カテゴリのresolved件数チェック → Content Pipeline DBへSEO記事ネタ自動投入
if (csDbId && contentDbId) {
  // 同カテゴリのresolved件数を取得
  const csQueryRes = await notionFetch(`/v1/databases/${csDbId}/query`, "POST", {
    filter: {
      and: [
        { property: "status", select: { equals: "resolved" } },
        { property: "category", select: { equals: csCategory } },
      ],
    },
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    page_size: 10,
  });

  if (csQueryRes.ok) {
    const csQueryBody = await csQueryRes.json();
    const resolvedCases = csQueryBody.results ?? [];
    const resolvedCount = resolvedCases.length;

    if (resolvedCount >= 3) {
      // Content Pipeline DBに同カテゴリのseo_articleネタがあるかチェック
      const seoTitle = `${csCategory}に関するよくある質問まとめ`;
      const contentCheckRes = await notionFetch(`/v1/databases/${contentDbId}/query`, "POST", {
        filter: {
          and: [
            { property: "channel", multi_select: { contains: "seo_article" } },
            { property: "title_field", title: { contains: csCategory } },
          ],
        },
        page_size: 5,
      });

      let alreadyExists = false;
      if (contentCheckRes.ok) {
        const contentCheckBody = await contentCheckRes.json();
        alreadyExists = (contentCheckBody.results ?? []).length > 0;
      }

      if (!alreadyExists) {
        const knCategory = CATEGORY_MAP[csCategory] ?? "method";
        const recentTitles = resolvedCases
          .slice(0, 5)
          .map(p => p.properties?.title_field?.title?.[0]?.plain_text ?? "")
          .filter(Boolean);
        const angle = recentTitles.join("\n");
        const priority = resolvedCount >= 5 ? "high" : "medium";

        const contentPage = await createPage(contentDbId, {
          title_field: { title: [{ text: { content: seoTitle } }] },
          status: { select: { name: "idea" } },
          channel: { multi_select: [{ name: "seo_article" }] },
          category: { select: { name: knCategory } },
          ...(angle && { angle: { rich_text: [{ text: { content: angle.slice(0, 2000) } }] } }),
          priority: { select: { name: priority } },
        });
        console.log(`このカテゴリの問い合わせが${resolvedCount}件目です。SEO記事ネタとして登録しました。`);
      }
    }
  }
}

// 4. faq_candidate=true ならナレッジDBに投入
if (faqCandidate) {
  if (!knowledgeDbId) { console.error("Set NOTION_DB_KNOWLEDGE_ID for knowledge insertion"); process.exit(1); }
  const knCategory = CATEGORY_MAP[csCategory] ?? "method";
  const tags = ["CS", "FAQ", csCategory].filter(Boolean);

  await createPage(knowledgeDbId, {
    title_field: { title: [{ text: { content: caseTitle } }] },
    category: { select: { name: knCategory } },
    subcategory: { rich_text: [{ text: { content: "cs_faq" } }] },
    content: { rich_text: [{ text: { content: resolution.slice(0, 2000) } }] },
    tags: { multi_select: tags.map(name => ({ name })) },
    source: { select: { name: "client_feedback" } },
    reliability: { select: { name: "unverified" } },
  });
  console.log(`Knowledge added: category=${knCategory}, tags=${tags.join(",")}`);
}
