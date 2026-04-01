import { searchPhotosForSpots } from "./photo-search";
import { searchPexelsVideos } from "./pexels-video";
import { generateCaption } from "./caption-generator";
import { fetchKnowledge, incrementUseCount, type KnowledgeEntry } from "./knowledge";
import { fetchKnowledgeFromNotion, incrementNotionUseCount, type NotionKnowledgeEntry } from "./notion-client";
import type { BaliCoverData } from "./templates/bali-cover";
import type { BaliSpotData } from "./templates/bali-spot";
import type { BaliSummaryData } from "./templates/bali-summary";

export interface GenerateOptions {
  db: D1Database;
  notionApiKey: string;
  notionDbId: string;
  unsplashKey: string;
  serperKey: string;
  pexelsKey: string;
}

export interface GeneratedContent {
  format_type: "carousel" | "reel";
  template_name: string;
  category: string;
  area: string;
  title: string;
  caption: string;
  content_json: string;
}

interface CategoryWeightRow {
  category: string;
  weight: number;
}

interface FormatWeightRow {
  format_type: string;
  weight: number;
}

interface ContentTemplateRow {
  name: string;
  format_type: string;
  weight: number;
}

type KnowledgeSource = "notion" | "d1";

interface UnifiedEntry {
  title: string;
  content: string;
  notionId?: string;
  d1Id?: number;
}

export const CATEGORY_KNOWLEDGE_MAP: Record<string, { categories: string[]; tags: string[] }> = {
  cafe: { categories: ["locale"], tags: ["bali_cafe"] },
  spot: { categories: ["locale"], tags: ["bali_area"] },
  food: { categories: ["locale"], tags: ["bali_food", "bali_cafe"] },
  beach: { categories: ["locale"], tags: ["bali_area"] },
  lifestyle: { categories: ["locale", "case"], tags: ["bali_cost", "bali_lifestyle"] },
  cost: { categories: ["locale"], tags: ["bali_cost"] },
  visa: { categories: ["regulation"], tags: ["bali_visa"] },
  culture: { categories: ["locale"], tags: ["bali_culture"] },
};

const CATEGORY_TITLES: Record<string, { catchCopy: string; mainTitle: string; countLabel: string }> = {
  cafe: { catchCopy: "で行きたい！", mainTitle: "おしゃれカフェ", countLabel: "5選" },
  spot: { catchCopy: "の絶景！", mainTitle: "観光スポット", countLabel: "5選" },
  food: { catchCopy: "で食べたい！", mainTitle: "ローカルグルメ", countLabel: "5選" },
  beach: { catchCopy: "のおすすめ！", mainTitle: "ビーチ", countLabel: "5選" },
  lifestyle: { catchCopy: "の暮らし！", mainTitle: "移住のリアル", countLabel: "5選" },
  cost: { catchCopy: "の物価！", mainTitle: "コスト事情", countLabel: "まとめ" },
  visa: { catchCopy: "に行くなら！", mainTitle: "ビザ情報", countLabel: "まとめ" },
  culture: { catchCopy: "を知ろう！", mainTitle: "文化・お祭り", countLabel: "5選" },
};

const AREAS = ["チャングー", "ウブド", "スミニャック", "サヌール", "ヌサドゥア", "クタ", "ジンバラン", "ウルワツ"];

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1080&h=1350&fit=crop";

export function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0 || items.length === 0) {
    throw new Error("weightedRandom: invalid items");
  }
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) return item;
  }
  return items[0]!;
}

export async function selectFormatType(db: D1Database): Promise<"carousel" | "reel"> {
  const res = await db
    .prepare("SELECT format_type, weight FROM format_weights")
    .all<FormatWeightRow>();
  const rows = res.results.filter((r) => (r.format_type === "carousel" || r.format_type === "reel") && r.weight > 0);
  if (rows.length === 0) return "carousel";
  const pick = weightedRandom(rows);
  return pick.format_type === "reel" ? "reel" : "carousel";
}

export async function selectTemplate(db: D1Database, formatType: "carousel" | "reel"): Promise<string> {
  const res = await db
    .prepare(
      "SELECT name, format_type, weight FROM content_templates WHERE format_type = ? AND COALESCE(enabled, 1) = 1 AND weight > 0",
    )
    .bind(formatType)
    .all<ContentTemplateRow>();
  const rows = res.results;
  if (rows.length === 0) {
    return formatType === "reel" ? "hook_facts" : "spot_list";
  }
  return weightedRandom(rows).name;
}

export async function selectCategory(db: D1Database): Promise<string> {
  const res = await db
    .prepare("SELECT category, weight FROM category_weights ORDER BY weight DESC")
    .all<CategoryWeightRow>();
  const categories = res.results;
  if (categories.length === 0) return "cafe";
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight <= 0) return categories[0]!.category;
  let random = Math.random() * totalWeight;
  for (const cat of categories) {
    random -= cat.weight;
    if (random <= 0) return cat.category;
  }
  return categories[0]!.category;
}

function extractOneLiner(content: string): string {
  const firstSentence = content.split(/[。！\n]/)[0] ?? "";
  return firstSentence.length <= 15 ? firstSentence : firstSentence.slice(0, 15);
}

function extractFactSentence(content: string): string {
  const t = content.trim();
  if (!t) return "";
  const first = t.split(/[。\n]/)[0]?.trim() ?? t;
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

function mapNotionToUnified(entries: NotionKnowledgeEntry[]): UnifiedEntry[] {
  return entries.map((e) => ({
    title: e.title,
    content: e.content,
    notionId: e.id,
  }));
}

function mapD1ToUnified(entries: KnowledgeEntry[]): UnifiedEntry[] {
  return entries.map((e) => ({
    title: e.title,
    content: e.content,
    d1Id: e.id,
  }));
}

async function fetchKnowledgeWithFallback(
  db: D1Database,
  notionApiKey: string,
  notionDbId: string,
  categories: string[],
  tags: string[],
  limit: number,
): Promise<{ rows: UnifiedEntry[]; source: KnowledgeSource }> {
  const hasNotion = notionApiKey.trim().length > 0 && notionDbId.trim().length > 0;
  if (hasNotion) {
    try {
      const notionEntries = await fetchKnowledgeFromNotion(
        notionApiKey,
        notionDbId,
        categories,
        tags,
        limit,
      );
      if (notionEntries.length > 0) {
        return { rows: mapNotionToUnified(notionEntries), source: "notion" };
      }
    } catch {
      /* D1 fallback */
    }
  }

  const d1Entries = await fetchKnowledge(db, categories, tags, limit);
  return { rows: mapD1ToUnified(d1Entries), source: "d1" };
}

async function filterUnusedEntries(
  db: D1Database,
  entries: UnifiedEntry[],
  need: number,
): Promise<UnifiedEntry[]> {
  const pastRows = await db
    .prepare("SELECT spots_json FROM posted_topics ORDER BY id DESC LIMIT 50")
    .all<{ spots_json: string }>();
  const pastSpotNames = new Set<string>();
  for (const row of pastRows.results) {
    try {
      const names = JSON.parse(row.spots_json) as string[];
      names.forEach((n) => pastSpotNames.add(n));
    } catch {
      /* ignore */
    }
  }

  const unused = entries.filter((e) => !pastSpotNames.has(e.title));
  const pool = unused.length >= need ? unused : entries;
  return pool.slice(0, need);
}

export interface SpotListBuilt {
  kind: "spot_list";
  coverData: BaliCoverData;
  spotsData: BaliSpotData[];
  summaryData: BaliSummaryData;
  attributions: string[];
  title: string;
  bodyLines: string[];
  hook: string;
  spotsForLog: string[];
}

export interface HookFactsBuilt {
  kind: "hook_facts";
  hookText: string;
  facts: string[];
  duration: number;
  videoClipUrls: string[];
  title: string;
  bodyLines: string[];
  hook: string;
  spotsForLog: string[];
}

export async function buildContentData(
  _templateName: string,
  formatType: "carousel" | "reel",
  category: string,
  area: string,
  entries: UnifiedEntry[],
  unsplashKey: string,
  serperKey: string,
  pexelsKey: string,
): Promise<SpotListBuilt | HookFactsBuilt> {
  // Phase 1: カルーセルは spot_list 相当、リールは hook_facts 相当（未実装テンプレは形式に合わせる）
  const effective: "spot_list" | "hook_facts" = formatType === "reel" ? "hook_facts" : "spot_list";

  if (effective === "hook_facts") {
    const selected = entries.slice(0, 3);
    const facts = selected
      .map((e) => {
        const line = extractFactSentence(e.content);
        return line ? `${e.title}：${line}` : e.title;
      })
      .filter(Boolean);
    const hookText = selected[0]?.title ?? "バリ島、知らないと損する話";
    const duration = 2 + 1.5 * facts.length + 3;
    let videoClipUrls: string[] = [];
    if (pexelsKey.trim()) {
      try {
        videoClipUrls = await searchPexelsVideos(pexelsKey, category, area, 4);
      } catch {
        videoClipUrls = [];
      }
    }
    const titles = CATEGORY_TITLES[category] ?? { catchCopy: "のおすすめ！", mainTitle: "スポット", countLabel: "まとめ" };
    const title = `${area}${titles.catchCopy}${titles.mainTitle}｜今知りたい3つ`;

    return {
      kind: "hook_facts",
      hookText,
      facts,
      duration,
      videoClipUrls,
      title,
      bodyLines: facts.map((f) => `・${f}`),
      hook: hookText,
      spotsForLog: selected.map((e) => e.title),
    };
  }

  // spot_list（未対応テンプレも Phase1 ではカルーセル同等）
  const selected = entries.slice(0, 5);
  const titles = CATEGORY_TITLES[category] ?? { catchCopy: "のおすすめ！", mainTitle: "スポット", countLabel: "5選" };

  const spots = selected.map((entry) => ({
    name: entry.title,
    area,
    description: entry.content.slice(0, 150),
    hours: "",
    oneLiner: extractOneLiner(entry.content),
  }));

  const photos = await searchPhotosForSpots(
    spots.map((s) => ({ name: s.name, area: s.area })),
    spots[0]?.name ?? area,
    category,
    serperKey,
    unsplashKey,
  );

  const coverData: BaliCoverData = {
    imageUrl: photos.cover?.imageUrl ?? FALLBACK_IMAGE,
    catchCopy: `${area}${titles.catchCopy}`,
    mainTitle: titles.mainTitle,
    countLabel: titles.countLabel,
  };

  const spotsData: BaliSpotData[] = spots.map((spot, i) => ({
    imageUrl: photos.spots[i]?.imageUrl ?? FALLBACK_IMAGE,
    spotNumber: i + 1,
    spotName: spot.name,
    description: spot.description,
    hours: spot.hours || undefined,
  }));

  const summaryData: BaliSummaryData = {
    title: `${area}${titles.catchCopy}${titles.mainTitle}`,
    spots: spots.map((s, i) => ({
      number: i + 1,
      name: s.name,
      oneLiner: s.oneLiner,
    })),
  };

  const attributions = [photos.cover?.attribution, ...photos.spots.map((p) => p?.attribution)].filter(
    (a): a is string => !!a,
  );
  const uniqueAttributions = [...new Set(attributions)];

  const title = `${area}${titles.catchCopy}${titles.mainTitle}${titles.countLabel}`;
  const bodyLines = spots.map((s, i) => `${i + 1}. ${s.name}｜${s.oneLiner}`);

  return {
    kind: "spot_list",
    coverData,
    spotsData,
    summaryData,
    attributions: uniqueAttributions,
    title,
    bodyLines,
    hook: "",
    spotsForLog: spots.map((s) => s.name),
  };
}

async function incrementUsed(
  db: D1Database,
  source: KnowledgeSource,
  notionApiKey: string,
  used: UnifiedEntry[],
): Promise<void> {
  if (source === "notion") {
    const ids = used.map((u) => u.notionId).filter((id): id is string => !!id);
    if (ids.length > 0) await incrementNotionUseCount(notionApiKey, ids);
    return;
  }
  const d1Ids = used.map((u) => u.d1Id).filter((id): id is number => id !== undefined);
  if (d1Ids.length > 0) await incrementUseCount(db, d1Ids);
}

export async function generateContentV3(opts: GenerateOptions): Promise<GeneratedContent> {
  const { db, notionApiKey, notionDbId, unsplashKey, serperKey, pexelsKey } = opts;

  const formatType = await selectFormatType(db);
  const templateName = await selectTemplate(db, formatType);
  const category = await selectCategory(db);

  const mapping = CATEGORY_KNOWLEDGE_MAP[category] ?? { categories: ["locale"], tags: [] };
  const fetchLimit = formatType === "reel" ? 8 : 10;

  const { rows, source } = await fetchKnowledgeWithFallback(
    db,
    notionApiKey,
    notionDbId,
    mapping.categories,
    mapping.tags,
    fetchLimit,
  );

  if (rows.length === 0) {
    throw new Error(`No knowledge entries found for category: ${category}`);
  }

  const need = formatType === "reel" ? 3 : 5;
  const entries = await filterUnusedEntries(db, rows, need);
  if (entries.length === 0) {
    throw new Error(`No knowledge entries available after dedup for category: ${category}`);
  }

  const area = AREAS[Math.floor(Math.random() * AREAS.length)]!;

  const built = await buildContentData(templateName, formatType, category, area, entries, unsplashKey, serperKey, pexelsKey);

  const usedSlice = entries.slice(0, built.kind === "hook_facts" ? 3 : 5);
  await incrementUsed(db, source, notionApiKey, usedSlice);

  const caption = generateCaption({
    category,
    templateName,
    title: built.title,
    hook: built.hook,
    bodyLines: built.bodyLines,
    area,
  });

  let content_json: string;
  if (built.kind === "spot_list") {
    content_json = JSON.stringify({
      template: "spot_list",
      coverData: built.coverData,
      spotsData: built.spotsData,
      summaryData: built.summaryData,
      attributions: built.attributions,
    });
    await db
      .prepare("INSERT INTO posted_topics (category, area, theme, spots_json) VALUES (?, ?, ?, ?)")
      .bind(category, area, CATEGORY_TITLES[category]?.mainTitle ?? "スポット", JSON.stringify(built.spotsForLog))
      .run();
  } else {
    content_json = JSON.stringify({
      template: "hook_facts",
      hookText: built.hookText,
      facts: built.facts,
      duration: built.duration,
      videoClipUrls: built.videoClipUrls,
    });
    await db
      .prepare("INSERT INTO posted_topics (category, area, theme, spots_json) VALUES (?, ?, ?, ?)")
      .bind(category, area, CATEGORY_TITLES[category]?.mainTitle ?? "リール", JSON.stringify(built.spotsForLog))
      .run();
  }

  return {
    format_type: formatType,
    template_name: templateName,
    category,
    area,
    title: built.title,
    caption,
    content_json,
  };
}
