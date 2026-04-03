import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import type { Pattern, Format, VisualStyle, Target } from "./types.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORMATS: Format[] = ["education", "emotion", "numbers", "daily"];
const VISUAL_STYLES: VisualStyle[] = ["bright", "chic", "handwritten", "cinematic"];
const TARGETS: Target[] = ["study_abroad", "english_learner", "bali_traveler"];

export function getAllPatterns(): Pattern[] {
  return FORMATS.flatMap(format =>
    VISUAL_STYLES.flatMap(visualStyle =>
      TARGETS.map(target => ({
        patternId: `${format}_${visualStyle}_${target}`,
        format,
        visualStyle,
        target,
      }))
    )
  );
}

export function selectPatterns(count: number): Pattern[] {
  const weightsPath = path.join(__dirname, "weights.json");
  const weights: Record<string, number> = require(weightsPath);
  const allPatterns = getAllPatterns();
  const remaining = [...allPatterns];
  const selected: Pattern[] = [];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, p) => sum + (weights[p.patternId] ?? 1.0), 0);
    let rand = Math.random() * totalWeight;
    for (let j = 0; j < remaining.length; j++) {
      rand -= weights[remaining[j].patternId] ?? 1.0;
      if (rand <= 0) {
        selected.push(remaining[j]);
        remaining.splice(j, 1);
        break;
      }
    }
  }
  return selected;
}
