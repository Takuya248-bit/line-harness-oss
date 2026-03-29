import { createXAiSource, sourceExists } from '@line-crm/db';

// ---------------------------------------------------------------------------
// Hacker News API（認証不要、無料）
// ---------------------------------------------------------------------------

interface HNItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  type: string;
}

const AI_KEYWORDS = [
  'ai', 'llm', 'gpt', 'claude', 'anthropic', 'openai', 'gemini',
  'copilot', 'cursor', 'agent', 'mcp', 'transformer', 'diffusion',
  'stable diffusion', 'midjourney', 'chatbot', 'rag', 'fine-tun',
  'machine learning', 'deep learning', 'neural', 'langchain',
];

function isAiRelated(title: string): boolean {
  const lower = title.toLowerCase();
  return AI_KEYWORDS.some((kw) => lower.includes(kw));
}

async function collectFromHackerNews(db: D1Database): Promise<number> {
  let collected = 0;

  const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!topRes.ok) return 0;
  const topIds = (await topRes.json()) as number[];

  const checkIds = topIds.slice(0, 60);

  for (const id of checkIds) {
    try {
      if (await sourceExists(db, 'hackernews', String(id))) continue;

      const itemRes = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
      );
      if (!itemRes.ok) continue;
      const item = (await itemRes.json()) as HNItem;

      if (!item || item.type !== 'story' || !item.url) continue;
      if (!isAiRelated(item.title)) continue;
      if (item.score < 50) continue;

      await createXAiSource(db, {
        sourceType: 'hackernews',
        externalId: String(item.id),
        title: item.title,
        url: item.url,
        score: item.score,
      });
      collected++;
    } catch {
      continue;
    }
  }

  return collected;
}

// ---------------------------------------------------------------------------
// RSS フィード収集
// ---------------------------------------------------------------------------

interface RssFeedConfig {
  sourceType: string;
  url: string;
}

const RSS_FEEDS: RssFeedConfig[] = [
  { sourceType: 'rss_anthropic', url: 'https://www.anthropic.com/rss' },
  { sourceType: 'rss_openai', url: 'https://openai.com/blog/rss.xml' },
];

async function collectFromRss(db: D1Database): Promise<number> {
  let collected = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url);
      if (!res.ok) continue;
      const xml = await res.text();

      const items = parseRssItems(xml);

      for (const item of items.slice(0, 10)) {
        const externalId = item.guid || item.link;
        if (!externalId) continue;
        if (await sourceExists(db, feed.sourceType, externalId)) continue;

        await createXAiSource(db, {
          sourceType: feed.sourceType,
          externalId,
          title: item.title,
          url: item.link,
          score: 100,
        });
        collected++;
      }
    } catch {
      continue;
    }
  }

  return collected;
}

interface RssItem {
  title: string;
  link: string;
  guid: string | null;
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const guid = extractTag(block, 'guid');

    if (title && link) {
      items.push({ title, link, guid });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// メインエントリ
// ---------------------------------------------------------------------------

export async function collectAiSources(db: D1Database): Promise<{
  hackernews: number;
  rss: number;
}> {
  const [hackernews, rss] = await Promise.allSettled([
    collectFromHackerNews(db),
    collectFromRss(db),
  ]);

  return {
    hackernews: hackernews.status === 'fulfilled' ? hackernews.value : 0,
    rss: rss.status === 'fulfilled' ? rss.value : 0,
  };
}
