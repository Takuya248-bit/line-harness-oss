import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { d1Query, d1Execute } from "../d1-rest.js";
import type { NightbatchConfig } from "./types.js";
import { getAllPatterns } from "./pattern-selector.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WEIGHTS_PATH = path.join(__dirname, "weights.json");
const ADOPTED_PATH = path.join(__dirname, "adopted_examples.json");

const MIN_SAMPLES = 3;
const WEIGHT_MIN = 0.1;
const WEIGHT_MAX = 3.0;

interface PatternAggRow {
  pattern_id: string;
  approved: number;
  rejected: number;
}

interface AdoptedRow {
  id: number;
  pattern_id: string;
  content_type: string | null;
  caption: string;
  script: string | null;
  hashtags: string | null;
  topic_id: string | null;
  created_at: string;
}

export interface AdoptedExample {
  id: number;
  patternId: string;
  contentType: string | null;
  caption: string;
  script: string | null;
  hashtags: string | null;
  topicId: string | null;
  createdAt: string;
}

function computeWeight(approvalRate: number): number {
  const raw = 0.5 + approvalRate * 2.5;
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, raw));
}

function loadWeights(): Record<string, number> {
  const raw = fs.readFileSync(WEIGHTS_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("weights.json must be an object");
  }
  return { ...parsed } as Record<string, number>;
}

function seedWeightsFromPatterns(): Record<string, number> {
  const w: Record<string, number> = {};
  for (const p of getAllPatterns()) {
    w[p.patternId] = 1.0;
  }
  return w;
}

function rowToExample(row: AdoptedRow): AdoptedExample {
  return {
    id: row.id,
    patternId: row.pattern_id,
    contentType: row.content_type,
    caption: row.caption,
    script: row.script,
    hashtags: row.hashtags,
    topicId: row.topic_id,
    createdAt: row.created_at,
  };
}

function loadAdoptedExamples(): AdoptedExample[] {
  try {
    const raw = fs.readFileSync(ADOPTED_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw.trim());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAdoptedExample);
  } catch {
    return [];
  }
}

function isAdoptedExample(x: unknown): x is AdoptedExample {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "number" && typeof o.patternId === "string" && typeof o.caption === "string";
}

/** Required env: CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID. Other NightbatchConfig fields are unused placeholders. */
export function nightbatchConfigFromEnv(): NightbatchConfig {
  const req = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing env: ${k}`);
    return v;
  };
  return {
    cfAccountId: req("CF_ACCOUNT_ID"),
    cfApiToken: req("CF_API_TOKEN"),
    d1DatabaseId: req("D1_DATABASE_ID"),
    r2BucketName: "",
    notionApiKey: "",
    notionDatabaseId: "",
    ollamaBaseUrl: "",
    ollamaModel: "",
    comfyuiBaseUrl: "",
    topicsPerRun: 0,
    patternsPerTopic: 0,
  };
}

export async function runWeeklyLearn(config: NightbatchConfig): Promise<void> {
  const { cfAccountId, cfApiToken, d1DatabaseId } = config;

  const aggSql = `
    SELECT
      pattern_id AS pattern_id,
      SUM(CASE WHEN status IN ('approved_auto', 'posted') THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status IN ('rejected_auto', 'rejected_human') THEN 1 ELSE 0 END) AS rejected
    FROM generated_content
    WHERE pattern_id IS NOT NULL
      AND created_at >= datetime('now', '-7 days')
      AND status IN ('approved_auto', 'posted', 'rejected_auto', 'rejected_human')
    GROUP BY pattern_id
  `;

  const aggRows = await d1Query<PatternAggRow>(cfAccountId, d1DatabaseId, cfApiToken, aggSql);

  let weights: Record<string, number>;
  try {
    weights = loadWeights();
  } catch {
    weights = seedWeightsFromPatterns();
  }

  for (const row of aggRows) {
    const approved = Number(row.approved) || 0;
    const rejected = Number(row.rejected) || 0;
    const total = approved + rejected;
    if (total < MIN_SAMPLES) continue;

    const approvalRate = approved / total;
    const newWeight = computeWeight(approvalRate);
    weights[row.pattern_id] = newWeight;

    await d1Execute(
      cfAccountId,
      d1DatabaseId,
      cfApiToken,
      `INSERT INTO pattern_weights (pattern_id, approved_count, rejected_count, weight, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(pattern_id) DO UPDATE SET
         approved_count = excluded.approved_count,
         rejected_count = excluded.rejected_count,
         weight = excluded.weight,
         updated_at = excluded.updated_at`,
      [row.pattern_id, approved, rejected, newWeight],
    );
  }

  fs.writeFileSync(WEIGHTS_PATH, JSON.stringify(weights, null, 2) + "\n", "utf8");

  const adoptedSql = `
    SELECT id, pattern_id, content_type, caption, script, hashtags, topic_id, created_at
    FROM generated_content
    WHERE status = 'approved_auto'
      AND pattern_id IS NOT NULL
    ORDER BY id DESC
    LIMIT 500
  `;
  const adoptedRows = await d1Query<AdoptedRow>(cfAccountId, d1DatabaseId, cfApiToken, adoptedSql);
  const fromDb = adoptedRows.map(rowToExample);

  const byId = new Map<number, AdoptedExample>();
  for (const e of loadAdoptedExamples()) byId.set(e.id, e);
  for (const e of fromDb) byId.set(e.id, e);

  const merged = [...byId.values()].sort((a, b) => a.id - b.id).slice(-200);
  fs.writeFileSync(ADOPTED_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(entry);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runWeeklyLearn(nightbatchConfigFromEnv()).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
