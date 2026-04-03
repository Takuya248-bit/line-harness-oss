import path from "node:path";
import { fileURLToPath } from "node:url";
import { d1Execute } from "../d1-rest.js";
import { autoReview, saveAdoptedExample } from "./auto-reviewer.js";
import { generateFeedImage, generateReelVideo } from "./comfyui-generator.js";
import { fetchTopics } from "./fetch-topics.js";
import { selectPatterns } from "./pattern-selector.js";
import { saveResult } from "./save-results.js";
import type {
  ContentType,
  GeneratedText,
  NightbatchConfig,
  Pattern,
  Topic,
} from "./types.js";
import { generateText } from "./text-generator.js";

const SCORE_THRESHOLD = 70;

function log(...args: unknown[]): void {
  console.log("[nightbatch]", ...args);
}

function logError(...args: unknown[]): void {
  console.error("[nightbatch]", ...args);
}

/**
 * 必須: CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID, NOTION_API_KEY, NOTION_DATABASE_ID
 * デフォルト: topicsPerRun=5, patternsPerTopic=3
 */
export function nightbatchConfigFromEnv(): NightbatchConfig {
  const req = (k: string): string => {
    const v = process.env[k]?.trim();
    if (!v) throw new Error(`Missing env: ${k}`);
    return v;
  };
  const opt = (k: string, def: string): string =>
    process.env[k]?.trim() || def;
  const optInt = (k: string, def: number): number => {
    const raw = process.env[k]?.trim();
    if (!raw) return def;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : def;
  };

  return {
    cfAccountId: req("CF_ACCOUNT_ID"),
    cfApiToken: req("CF_API_TOKEN"),
    d1DatabaseId: req("D1_DATABASE_ID"),
    notionApiKey: req("NOTION_API_KEY"),
    notionDatabaseId: req("NOTION_DATABASE_ID"),
    r2BucketName: opt("R2_BUCKET_NAME", ""),
    ollamaBaseUrl: opt("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
    ollamaModel: opt("OLLAMA_MODEL", "gemma3:12b"),
    comfyuiBaseUrl: opt("COMFYUI_BASE_URL", "http://127.0.0.1:8188"),
    topicsPerRun: optInt("NIGHTBATCH_TOPICS_PER_RUN", 5),
    patternsPerTopic: optInt("NIGHTBATCH_PATTERNS_PER_TOPIC", 3),
  };
}

interface WorkUnit {
  topic: Topic;
  pattern: Pattern;
  contentType: ContentType;
}

function buildWorkUnits(topics: Topic[], patternsPerTopic: number): WorkUnit[] {
  const units: WorkUnit[] = [];
  for (const topic of topics) {
    const patterns = selectPatterns(patternsPerTopic);
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      if (!pattern) continue;
      const contentType: ContentType = i % 2 === 0 ? "feed" : "reel";
      units.push({ topic, pattern, contentType });
    }
  }
  return units;
}

async function insertRejectedAuto(
  config: NightbatchConfig,
  topicId: string,
  pattern: Pattern,
  contentType: ContentType,
  text: GeneratedText,
  score: number,
  reason: string,
): Promise<void> {
  const contentJson = JSON.stringify({ score, reason });
  await d1Execute(
    config.cfAccountId,
    config.d1DatabaseId,
    config.cfApiToken,
    `INSERT INTO generated_content (
      template_type,
      topic_id,
      pattern_id,
      content_type,
      caption,
      script,
      hashtags,
      image_r2_key,
      video_r2_key,
      status,
      created_at,
      content_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'rejected_auto', datetime('now'), ?)`,
    [
      "nightbatch",
      topicId,
      pattern.patternId,
      contentType,
      text.caption,
      text.script,
      text.hashtags,
      contentJson,
    ],
  );
}

export async function runNightbatch(config: NightbatchConfig): Promise<void> {
  log("start pipeline");
  let topics: Topic[];
  try {
    topics = await fetchTopics(config);
  } catch (e) {
    logError("fetchTopics failed", e);
    return;
  }
  if (topics.length === 0) {
    log("no topics, exit");
    return;
  }

  const units = buildWorkUnits(topics, config.patternsPerTopic);
  log(`work units: ${units.length} (topics=${topics.length})`);

  type GenOk = { unit: WorkUnit; text: GeneratedText };
  const genResults = await Promise.all(
    units.map(async (unit): Promise<GenOk | null> => {
      try {
        const text = await generateText(
          unit.topic,
          unit.pattern,
          unit.contentType,
          config,
        );
        return { unit, text };
      } catch (e) {
        logError("text generation skip", unit.topic.id, unit.pattern.patternId, e);
        return null;
      }
    }),
  );

  const generated = genResults.filter((x): x is GenOk => x !== null);
  log(`text generated: ${generated.length}/${units.length}`);

  for (const { unit, text } of generated) {
    try {
      const review = await autoReview(text, unit.pattern, config);
      log(
        "review",
        unit.topic.id,
        unit.pattern.patternId,
        unit.contentType,
        "score=",
        review.score,
      );

      if (review.score < SCORE_THRESHOLD) {
        try {
          await insertRejectedAuto(
            config,
            unit.topic.id,
            unit.pattern,
            unit.contentType,
            text,
            review.score,
            review.reason,
          );
          log("rejected_auto inserted", unit.topic.id, review.score);
        } catch (e) {
          logError("insertRejectedAuto failed", unit.topic.id, e);
        }
        continue;
      }

      saveAdoptedExample(text.caption, review.score, unit.pattern.patternId);

      let imageBuffer: Buffer | null = null;
      let videoBuffer: Buffer | null = null;
      if (unit.contentType === "feed") {
        imageBuffer = await generateFeedImage(text.imagePrompt, config);
      } else {
        videoBuffer = await generateReelVideo(text.videoPrompt, config);
      }

      const id = await saveResult(
        unit.topic.id,
        unit.pattern,
        unit.contentType,
        text,
        imageBuffer,
        videoBuffer,
        config,
      );
      log("saved approved_auto", "d1_id=", id);
    } catch (e) {
      logError(
        "pipeline skip",
        unit.topic.id,
        unit.pattern.patternId,
        unit.contentType,
        e,
      );
    }
  }

  log("pipeline done");
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
  try {
    const config = nightbatchConfigFromEnv();
    await runNightbatch(config);
  } catch (e) {
    logError("fatal", e);
    process.exitCode = 1;
  }
}
