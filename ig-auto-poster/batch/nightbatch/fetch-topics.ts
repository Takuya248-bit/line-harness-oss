import { d1Query } from "../d1-rest.js";
import type { NightbatchConfig, Topic } from "./types.js";

const NOTION_VERSION = "2022-06-28";

/** TITLE / Name など複数スキーマに寄せる */
const TITLE_KEYS = ["title", "Title", "Name", "名前"] as const;
/** content / Body など */
const BODY_KEYS = ["content", "Content", "Body", "本文"] as const;

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

function extractTitle(prop: unknown): string {
  if (!prop || typeof prop !== "object" || !("title" in prop)) return "";
  const title = (prop as { title: Array<{ plain_text: string }> }).title;
  if (!Array.isArray(title)) return "";
  return title.map((t) => t.plain_text ?? "").join("");
}

function extractRichText(prop: unknown): string {
  if (!prop || typeof prop !== "object" || !("rich_text" in prop)) return "";
  const rt = (prop as { rich_text: Array<{ plain_text: string }> }).rich_text;
  if (!Array.isArray(rt)) return "";
  return rt.map((t) => t.plain_text ?? "").join("");
}

function firstNonEmptyByKeys(
  properties: Record<string, unknown>,
  keys: readonly string[],
  extract: (prop: unknown) => string,
): string {
  for (const key of keys) {
    const v = extract(properties[key]);
    if (v.length > 0) return v;
  }
  return "";
}

async function fetchFromD1(config: NightbatchConfig, limit: number): Promise<Topic[]> {
  // TODO: knowledge_items / used_in_nightbatch が未マイグレーションの場合は D1 クエリが失敗する
  const rows = await d1Query<{ id: string | number; title: string; body: string }>(
    config.cfAccountId,
    config.d1DatabaseId,
    config.cfApiToken,
    `SELECT id, title, body FROM knowledge_items
     WHERE used_in_nightbatch IS NULL OR used_in_nightbatch = 0
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    body: r.body,
    source: "d1" as const,
  }));
}

async function fetchFromNotion(config: NightbatchConfig, limit: number): Promise<Topic[]> {
  const res = await fetch(`https://api.notion.com/v1/databases/${config.notionDatabaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.notionApiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sorts: [{ property: "use_count", direction: "ascending" }],
      page_size: limit,
    }),
  });
  if (!res.ok) throw new Error(`Notion API error: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as { results: NotionPage[] };
  return data.results
    .map((page) => {
      const title = firstNonEmptyByKeys(page.properties, TITLE_KEYS, extractTitle);
      const body = firstNonEmptyByKeys(page.properties, BODY_KEYS, extractRichText);
      return {
        id: page.id,
        title,
        body,
        source: "notion" as const,
      };
    })
    .filter((t) => t.title.length > 0);
}

/**
 * D1 と Notion からそれぞれ約半数ずつ未使用ネタを並列取得し、topicsPerRun 件に切り詰めて返す。
 */
export async function fetchTopics(config: NightbatchConfig): Promise<Topic[]> {
  const half = Math.ceil(config.topicsPerRun / 2);
  const [d1Topics, notionTopics] = await Promise.all([
    fetchFromD1(config, half),
    fetchFromNotion(config, half),
  ]);
  return [...d1Topics, ...notionTopics].slice(0, config.topicsPerRun);
}
