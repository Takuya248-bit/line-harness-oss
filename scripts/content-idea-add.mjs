#!/usr/bin/env node
/**
 * コンテンツパイプラインDBにネタを追加する
 * Usage: node scripts/content-idea-add.mjs <title> <channel> [category] [angle] [priority] [knowledge_ref] [--force]
 * channel: seo_article, x_barilingual, x_lcustom, instagram (カンマ区切りで複数可)
 * 例: node scripts/content-idea-add.mjs "バリ留学の費用比較2026" "seo_article,x_barilingual" education "実体験ベースの費用内訳" high
 */
import process from "node:process";
import { notionFetch, createPage } from "./lib/notion-helpers.mjs";

const dbId = process.env.NOTION_DB_CONTENT_ID;
if (!process.env.NOTION_TOKEN || !dbId) { console.error("Set NOTION_TOKEN and NOTION_DB_CONTENT_ID"); process.exit(1); }

const args = process.argv.slice(2).filter(a => a !== "--force");
const force = process.argv.includes("--force");
const [title, channels, category, angle, priority, knowledgeRef] = args;
if (!title || !channels) { console.error("Usage: content-idea-add.mjs <title> <channel> [category] [angle] [priority] [knowledge_ref] [--force]"); process.exit(1); }

// タイトルから3文字以上の単語を抽出
const keywords = title.split(/[\s\u3000]+/).filter(w => w.length >= 3);

// OR条件で既存ネタを検索
const filterConditions = keywords.map(kw => ({
  property: "title_field",
  title: { contains: kw },
}));

if (filterConditions.length > 0) {
  const filter = filterConditions.length === 1
    ? filterConditions[0]
    : { or: filterConditions };

  const queryRes = await notionFetch(`/v1/databases/${dbId}/query`, "POST", { filter, page_size: 5 });

  if (queryRes.ok) {
    const queryBody = await queryRes.json();
    const hits = queryBody.results || [];
    if (hits.length > 0) {
      console.warn("重複候補が見つかりました:");
      for (const page of hits) {
        const titleProp = page.properties?.title_field?.title?.[0]?.plain_text ?? "(no title)";
        const statusVal = page.properties?.status?.select?.name ?? "unknown";
        console.warn(`  - ${titleProp} [${statusVal}]`);
      }
      if (!force) {
        console.error("重複候補があります。--forceで強制投入");
        process.exit(1);
      }
      console.warn("--forceが指定されたため投入を続行します。");
    }
  }
}

const body = await createPage(dbId, {
  title_field: { title: [{ text: { content: title } }] },
  status: { select: { name: "idea" } },
  channel: { multi_select: channels.split(",").filter(Boolean).map(name => ({ name: name.trim() })) },
  ...(category && { category: { select: { name: category } } }),
  ...(angle && { angle: { rich_text: [{ text: { content: angle } }] } }),
  ...(priority && { priority: { select: { name: priority } } }),
  ...(knowledgeRef && { knowledge_ref: { rich_text: [{ text: { content: knowledgeRef } }] } }),
});
console.log(`OK: ${body.url}`);
