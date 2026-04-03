import { generateReelPlan } from "./content-planner";
import { searchPexelsVideos } from "../pexels-video";
import type { ABTestMeta, GeneratedPost, HookStyle, NetaEntry, ReelFormat } from "./types";

const ALL_FORMATS: readonly ReelFormat[] = [
  "ranking",
  "cost_appeal",
  "before_after",
  "routine",
  "relatable",
] as const;

const DEFAULT_COUNTS: Record<ReelFormat, number> = {
  ranking: 2,
  cost_appeal: 2,
  before_after: 1,
  routine: 1,
  relatable: 1,
};

const FORMAT_LABEL_JA: Record<ReelFormat, string> = {
  ranking: "ランキング",
  cost_appeal: "コスパ訴求",
  before_after: "ビフォーアフター",
  routine: "ルーティン",
  relatable: "共感あるある",
};

const SUCCESS_THRESHOLD = 0.05;

function isReelFormat(s: string): s is ReelFormat {
  return (ALL_FORMATS as readonly string[]).includes(s);
}

/** ISO週表記（例: 2026-W15）— スケジューラの testWeek と揃える */
function testWeekString(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function dominantCategory(entries: NetaEntry[]): string {
  if (entries.length === 0) return "lifestyle";
  const tallies = new Map<string, number>();
  for (const e of entries) {
    tallies.set(e.category, (tallies.get(e.category) ?? 0) + 1);
  }
  let best = entries[0]!.category;
  let max = 0;
  for (const [c, n] of tallies) {
    if (n > max) {
      max = n;
      best = c;
    }
  }
  return best;
}

async function loadSaveRatesByFormat(db: D1Database): Promise<Map<ReelFormat, number>> {
  const rows = await db
    .prepare(
      `SELECT reel_format, avg_save_rate
       FROM reel_format_performance
       WHERE reel_format IS NOT NULL`,
    )
    .all<{ reel_format: string; avg_save_rate: number | null }>();

  const map = new Map<ReelFormat, number>();
  for (const r of rows.results) {
    if (r.reel_format && isReelFormat(r.reel_format)) {
      const v = r.avg_save_rate;
      if (v != null && Number.isFinite(v) && v > 0) {
        map.set(r.reel_format, v);
      }
    }
  }
  return map;
}

/**
 * 初週・ビュー空: DEFAULT_COUNTS。
 * 実績あり: 各フォーマット最低1・合計7・各最大3。avg_save_rate で余り2本を配分。
 */
function computeWeeklyFormatCounts(saveRates: Map<ReelFormat, number>): Record<ReelFormat, number> {
  if (saveRates.size === 0) {
    return { ...DEFAULT_COUNTS };
  }

  const knownWeights = [...saveRates.values()].filter((w) => w > 0);
  const floorW = knownWeights.length > 0 ? Math.min(...knownWeights) * 0.5 : 0.01;

  const weightOf = (f: ReelFormat): number => saveRates.get(f) ?? floorW;

  const counts: Record<ReelFormat, number> = {
    ranking: 1,
    cost_appeal: 1,
    before_after: 1,
    routine: 1,
    relatable: 1,
  };
  let remaining = 7 - ALL_FORMATS.length;

  while (remaining > 0) {
    let pick: ReelFormat | null = null;
    let bestW = -Infinity;
    let pickIdx = ALL_FORMATS.length;
    for (let i = 0; i < ALL_FORMATS.length; i++) {
      const f = ALL_FORMATS[i]!;
      if (counts[f] >= 3) continue;
      const w = weightOf(f);
      if (w > bestW || (w === bestW && i < pickIdx)) {
        bestW = w;
        pick = f;
        pickIdx = i;
      }
    }
    if (!pick) break;
    counts[pick]++;
    remaining--;
  }

  return counts;
}

function hookStyleLabelJa(style: HookStyle): string {
  if (style === "question") return "疑問形";
  if (style === "assertion") return "断定形";
  if (style === "number_first") return "数字先行";
  return "POV";
}

function buildHypothesis(format: ReelFormat, hookStyle: HookStyle, threshold: number): string {
  const fmt = FORMAT_LABEL_JA[format];
  const hk = hookStyleLabelJa(hookStyle);
  const pct = (threshold * 100).toFixed(1);
  return `${fmt}型 × ${hk}フックは保存率${pct}%以上を達成する`;
}

function hookStyleForFormatSlot(countForFormat: number, index: number): HookStyle {
  if (countForFormat === 1) return "question";
  if (index === 0) return "question";
  if (index === 1) return "assertion";
  // 同一フォーマット3本目（上限3）は別フックで差別化（TODO: 週次レポートと突合して軸を固定したい）
  return "number_first";
}

function buildSlotsForWeeklyCounts(
  counts: Record<ReelFormat, number>,
): { format: ReelFormat; hookStyle: HookStyle }[] {
  const slots: { format: ReelFormat; hookStyle: HookStyle }[] = [];
  for (const format of ALL_FORMATS) {
    const n = counts[format];
    for (let i = 0; i < n; i++) {
      slots.push({ format, hookStyle: hookStyleForFormatSlot(n, i) });
    }
  }
  return slots;
}

function buildAbTestMeta(
  testWeek: string,
  format: ReelFormat,
  hookStyle: HookStyle,
): ABTestMeta {
  const hypothesis = buildHypothesis(format, hookStyle, SUCCESS_THRESHOLD);
  return {
    contentType: "reel",
    testWeek,
    testAxis: "hook",
    testVariant: hookStyle,
    isControl: hookStyle === "question",
    hypothesis,
    reelFormat: format,
    hookStyle,
    targetKpi: "save_rate",
    successThreshold: SUCCESS_THRESHOLD,
  } as ABTestMeta;
}

/**
 * 週7本のリール仮説付きプランを生成し、enqueuePost / enqueueWeeklyReels に渡せる形で返す。
 */
export async function planWeeklyReels(
  db: D1Database,
  groqApiKey: string,
  pexelsApiKey: string,
  neta: NetaEntry[],
): Promise<GeneratedPost[]> {
  if (neta.length === 0) {
    throw new Error("planWeeklyReels: neta must not be empty");
  }

  const category = dominantCategory(neta);
  const area = "Bali";
  const testWeek = testWeekString(new Date());

  const saveRates = await loadSaveRatesByFormat(db);
  const counts = computeWeeklyFormatCounts(saveRates);
  const slots = buildSlotsForWeeklyCounts(counts);

  const posts: GeneratedPost[] = [];

  for (const slot of slots) {
    const plan = await generateReelPlan(groqApiKey, slot.format, category, neta, slot.hookStyle);

    const clipCount = Math.min(10, Math.max(5, plan.facts.length + 1));
    const videoClipUrls = await searchPexelsVideos(pexelsApiKey, category, area, clipCount);

    const contentPayload = {
      hookText: plan.hookText,
      facts: plan.facts,
      narrationTexts: plan.narrationTexts,
      videoClipUrls,
      ctaText: plan.ctaText,
    };

    const caption = `${plan.hookText}\n\n${plan.ctaText}`.slice(0, 2200);
    const mediaUrls = videoClipUrls.length > 0 ? videoClipUrls : [];

    posts.push({
      contentType: "reel",
      mediaUrls,
      caption,
      contentJson: JSON.stringify(contentPayload),
      abTestMeta: buildAbTestMeta(testWeek, slot.format, slot.hookStyle),
    });
  }

  return posts;
}
