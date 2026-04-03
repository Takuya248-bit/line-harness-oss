import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { GeneratedText, NightbatchConfig, Pattern, ReviewResult } from "./types.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rubricPath = path.join(__dirname, "rubric.yaml");
const adoptedPath = path.join(__dirname, "adopted_examples.json");

export interface RubricMaxScores {
  hook_strength: number;
  target_fit: number;
  authenticity: number;
  cta_clarity: number;
}

interface AdoptedExample {
  caption: string;
  score: number;
  patternId: string;
  savedAt: string;
}

interface OllamaScoresPayload {
  hook_strength?: number;
  target_fit?: number;
  authenticity?: number;
  cta_clarity?: number;
  reason?: string;
}

export function loadRubricMaxScores(): RubricMaxScores {
  const raw = readFileSync(rubricPath, "utf8");
  const defaults: RubricMaxScores = {
    hook_strength: 30,
    target_fit: 25,
    authenticity: 25,
    cta_clarity: 20,
  };
  const out = { ...defaults };
  for (const line of raw.split("\n")) {
    const trimmed = line.replace(/#.*$/, "").trim();
    if (!trimmed) continue;
    const m = /^([a-z_]+):\s*(\d+)\s*$/.exec(trimmed);
    if (!m) continue;
    const key = m[1] as keyof RubricMaxScores;
    if (key in out) out[key] = Number(m[2]);
  }
  return out;
}

function loadAdoptedExamplesFresh(): AdoptedExample[] {
  delete require.cache[require.resolve(adoptedPath)];
  const data = require(adoptedPath) as unknown;
  if (!Array.isArray(data)) return [];
  return data as AdoptedExample[];
}

const RAG_MIN_EXAMPLES = 30;
const RAG_TOP_N = 5;
const ADOPTED_MAX = 200;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function sortTopExamples(examples: AdoptedExample[]): AdoptedExample[] {
  return [...examples].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.savedAt.localeCompare(a.savedAt);
  });
}

function buildPrompt(
  text: GeneratedText,
  pattern: Pattern,
  maxScores: RubricMaxScores,
  mode: "rubric" | "rag",
  ragExamples: AdoptedExample[]
): string {
  const patternLines = [
    `patternId: ${pattern.patternId}`,
    `format: ${pattern.format}`,
    `visualStyle: ${pattern.visualStyle}`,
    `target: ${pattern.target}`,
  ].join("\n");

  const contentLines = [
    "caption:",
    text.caption,
    "",
    "script:",
    text.script,
    "",
    "hashtags:",
    text.hashtags,
    "",
    "imagePrompt:",
    text.imagePrompt,
    "",
    "videoPrompt:",
    text.videoPrompt,
  ].join("\n");

  const jsonShape = [
    "Return ONLY a single JSON object with these keys (integers for scores):",
    `"hook_strength": 0-${maxScores.hook_strength}`,
    `"target_fit": 0-${maxScores.target_fit}`,
    `"authenticity": 0-${maxScores.authenticity}`,
    `"cta_clarity": 0-${maxScores.cta_clarity}`,
    `"reason": short one-line string in Japanese explaining the scoring`,
  ].join("\n");

  if (mode === "rubric") {
    return [
      "You evaluate Instagram draft copy for a Barilingual-style education/travel account.",
      "Score strictly against the rubric maxima below. Be conservative; high scores require clear evidence.",
      "",
      patternLines,
      "",
      contentLines,
      "",
      jsonShape,
    ].join("\n");
  }

  const top = ragExamples.slice(0, RAG_TOP_N);
  const examplesBlock = top
    .map(
      (ex, i) =>
        `Example ${i + 1} (score ${ex.score}, pattern ${ex.patternId}):\n${ex.caption}`
    )
    .join("\n\n---\n\n");

  return [
    "You evaluate Instagram draft copy for a Barilingual-style education/travel account.",
    "High-scoring real examples from this project are shown; match their tone, clarity, and audience fit when scoring.",
    "Score strictly against the rubric maxima below.",
    "",
    "Successful examples (reference only):",
    examplesBlock,
    "",
    patternLines,
    "",
    contentLines,
    "",
    jsonShape,
  ].join("\n");
}

function parseOllamaJsonResponse(responseText: string): OllamaScoresPayload | null {
  const trimmed = responseText.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as OllamaScoresPayload;
  } catch {
    return null;
  }
}

export async function autoReview(
  text: GeneratedText,
  pattern: Pattern,
  config: NightbatchConfig
): Promise<ReviewResult> {
  const maxScores = loadRubricMaxScores();
  const adopted = loadAdoptedExamplesFresh();
  const mode: "rubric" | "rag" = adopted.length >= RAG_MIN_EXAMPLES ? "rag" : "rubric";
  const ragPool = mode === "rag" ? sortTopExamples(adopted) : [];
  const prompt = buildPrompt(text, pattern, maxScores, mode, ragPool);

  const url = new URL("/api/generate", config.ollamaBaseUrl).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt,
      stream: false,
      format: "json",
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ollama generate failed: ${res.status} ${errText}`);
  }

  const body = (await res.json()) as { response?: string };
  const parsed = parseOllamaJsonResponse(body.response ?? "");
  if (!parsed) {
    return {
      score: 0,
      breakdown: {
        hook_strength: 0,
        target_fit: 0,
        authenticity: 0,
        cta_clarity: 0,
      },
      reason: "モデル応答のJSON解析に失敗しました",
      mode,
    };
  }

  const hook = clamp(Math.round(Number(parsed.hook_strength) || 0), 0, maxScores.hook_strength);
  const fit = clamp(Math.round(Number(parsed.target_fit) || 0), 0, maxScores.target_fit);
  const auth = clamp(Math.round(Number(parsed.authenticity) || 0), 0, maxScores.authenticity);
  const cta = clamp(Math.round(Number(parsed.cta_clarity) || 0), 0, maxScores.cta_clarity);
  const score = hook + fit + auth + cta;
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim().length > 0
      ? parsed.reason.trim()
      : "採点完了";

  return {
    score,
    breakdown: {
      hook_strength: hook,
      target_fit: fit,
      authenticity: auth,
      cta_clarity: cta,
    },
    reason,
    mode,
  };
}

export function saveAdoptedExample(caption: string, score: number, patternId: string): void {
  const examples = loadAdoptedExamplesFresh();
  examples.push({
    caption,
    score,
    patternId,
    savedAt: new Date().toISOString(),
  });
  const trimmed = examples.slice(-ADOPTED_MAX);
  writeFileSync(adoptedPath, JSON.stringify(trimmed, null, 2) + "\n", "utf8");
}
