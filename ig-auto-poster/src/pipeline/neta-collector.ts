import { groqJson } from "../groq";
import type { NetaEntry } from "./types";

interface RSSItem {
  title: string;
  link: string;
  description: string;
}

export async function fetchRSS(feedUrl: string): Promise<RSSItem[]> {
  const res = await fetch(feedUrl);
  if (!res.ok) return [];
  const text = await res.text();

  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const block = match[1] ?? "";
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
    const description = block.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)?.[1] ?? "";
    if (title) items.push({ title, link, description: description.slice(0, 300) });
  }
  return items.slice(0, 10);
}

interface AbstractedTheme {
  abstract: string;
  concrete: string;
  category: string;
  tags: string[];
}

export async function abstractAndConcretize(
  groqApiKey: string,
  items: { title: string; description: string }[],
  existingKnowledge: string[],
): Promise<AbstractedTheme[]> {
  const itemList = items
    .slice(0, 5)
    .map((i) => `- ${i.title}: ${i.description.slice(0, 100)}`)
    .join("\n");

  const existing = existingKnowledge.slice(0, 10).join(", ");

  const prompt = `以下の記事/投稿から、バリ島留学・英語学習に関連するコンテンツのネタを抽出してください。

記事:
${itemList}

既存ネタ（重複を避ける）: ${existing}

各記事について:
1. 核心テーマを1つ抽出（抽象化）
2. バリリンガル（バリ島の語学学校）の視点で独自ネタに変換（具体化）
3. カテゴリとタグを付与

JSON配列で返してください:
[{"abstract": "抽象テーマ", "concrete": "具体化したネタタイトル", "category": "cafe|spot|food|beach|lifestyle|cost|visa|culture", "tags": ["tag1"]}]

関連性が低い記事はスキップしてください。`;

  return groqJson<AbstractedTheme[]>(groqApiKey, [
    { role: "user", content: prompt },
  ], { temperature: 0.6, maxTokens: 1024 });
}

export async function collectAndStoreNeta(
  groqApiKey: string,
  notionApiKey: string,
  notionDbId: string,
  rssFeeds: string[],
): Promise<NetaEntry[]> {
  const allItems: { title: string; description: string }[] = [];
  for (const feed of rssFeeds) {
    const items = await fetchRSS(feed);
    allItems.push(...items.map((i) => ({ title: i.title, description: i.description })));
  }

  if (allItems.length === 0) return [];

  const themes = await abstractAndConcretize(groqApiKey, allItems, []);

  const entries: NetaEntry[] = themes.map((t, i) => ({
    id: `auto_${Date.now()}_${i}`,
    title: t.concrete,
    content: `${t.abstract} → ${t.concrete}`,
    category: t.category,
    tags: t.tags,
    reliability: "unverified" as const,
    source: "auto_research",
  }));

  for (const entry of entries) {
    try {
      await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionApiKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          parent: { database_id: notionDbId },
          properties: {
            Title: { title: [{ text: { content: entry.title } }] },
            Category: { select: { name: entry.category } },
            Tags: { multi_select: entry.tags.map((t) => ({ name: t })) },
            Source: { select: { name: "auto_research" } },
            Reliability: { select: { name: "unverified" } },
          },
          children: [
            {
              object: "block" as const,
              type: "paragraph" as const,
              paragraph: { rich_text: [{ text: { content: entry.content } }] },
            },
          ],
        }),
      });
    } catch {
      // Notion投入失敗は無視して続行
    }
  }

  return entries;
}
