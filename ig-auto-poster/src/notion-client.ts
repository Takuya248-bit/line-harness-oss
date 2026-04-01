const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export interface NotionKnowledgeEntry {
  id: string;
  category: string;
  subcategory: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  reliability: string;
}

interface NotionFilter {
  and?: NotionFilter[];
  or?: NotionFilter[];
  property?: string;
  select?: { equals: string };
  multi_select?: { contains: string };
}

interface DatabaseQueryBody {
  filter?: NotionFilter;
  sorts: Array<{ property: string; direction: "ascending" | "descending" }>;
  page_size: number;
}

interface NotionPageResult {
  id: string;
  properties: Record<string, unknown>;
}

interface DatabaseQueryResponse {
  results: NotionPageResult[];
}

async function notionFetch<T>(
  path: string,
  apiKey: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${method} ${path} failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

function extractSelect(prop: unknown): string {
  if (!prop || typeof prop !== "object" || !("select" in prop)) return "";
  const sel = (prop as { select: { name: string } | null }).select;
  return sel?.name ?? "";
}

function extractMultiSelect(prop: unknown): string[] {
  if (!prop || typeof prop !== "object" || !("multi_select" in prop)) return [];
  const ms = (prop as { multi_select: Array<{ name: string }> | null }).multi_select;
  if (!ms?.length) return [];
  return ms.map((x) => x.name);
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

function extractNumber(prop: unknown): number {
  if (!prop || typeof prop !== "object" || !("number" in prop)) return 0;
  const n = (prop as { number: number | null }).number;
  return typeof n === "number" ? n : 0;
}

function extractSubcategory(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  if ("select" in prop) return extractSelect(prop);
  if ("rich_text" in prop) return extractRichText(prop);
  return "";
}

function mapPageToEntry(page: NotionPageResult): NotionKnowledgeEntry {
  const p = page.properties;
  return {
    id: page.id,
    category: extractSelect(p.category),
    subcategory: extractSubcategory(p.subcategory),
    title: extractTitle(p.title),
    content: extractRichText(p.content),
    tags: extractMultiSelect(p.tags),
    source: extractSelect(p.source) || extractRichText(p.source),
    reliability: extractSelect(p.reliability) || extractRichText(p.reliability),
  };
}

function buildFilter(categories: string[] | undefined, tags: string[] | undefined): NotionFilter | undefined {
  const catList = categories?.filter((c) => c.length > 0) ?? [];
  const tagList = tags?.filter((t) => t.length > 0) ?? [];

  const categoryOr: NotionFilter[] = catList.map((c) => ({
    property: "category",
    select: { equals: c },
  }));
  const tagsOr: NotionFilter[] = tagList.map((t) => ({
    property: "tags",
    multi_select: { contains: t },
  }));

  if (categoryOr.length > 0 && tagsOr.length > 0) {
    return {
      and: [{ or: categoryOr }, { or: tagsOr }],
    };
  }
  if (categoryOr.length > 0) return { or: categoryOr };
  if (tagsOr.length > 0) return { or: tagsOr };
  return undefined;
}

/**
 * Notion 知識DBからエントリをクエリする。
 * categories / tags はそれぞれ OR、両方指定時は AND。
 */
export async function fetchKnowledgeFromNotion(
  apiKey: string,
  dbId: string,
  categories: string[] | undefined,
  tags: string[] | undefined,
  limit: number,
): Promise<NotionKnowledgeEntry[]> {
  const filter = buildFilter(categories, tags);
  const body: DatabaseQueryBody = {
    sorts: [{ property: "use_count", direction: "ascending" }],
    page_size: limit,
  };
  if (filter) body.filter = filter;

  const data = await notionFetch<DatabaseQueryResponse>(
    `/databases/${dbId}/query`,
    apiKey,
    "POST",
    body,
  );

  return data.results.map(mapPageToEntry);
}

/**
 * 指定ページの use_count を 1 ずつ増やす。
 */
export async function incrementNotionUseCount(apiKey: string, pageIds: string[]): Promise<void> {
  for (const pageId of pageIds) {
    const page = await notionFetch<NotionPageResult>(`/pages/${pageId}`, apiKey, "GET");
    const current = extractNumber(page.properties.use_count);
    await notionFetch(`/pages/${pageId}`, apiKey, "PATCH", {
      properties: {
        use_count: { number: current + 1 },
      },
    });
  }
}
