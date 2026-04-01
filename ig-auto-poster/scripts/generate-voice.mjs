import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function edgeTtsBin() {
  const fromEnv = process.env.EDGE_TTS_BIN?.trim();
  if (fromEnv) return fromEnv;
  return "edge-tts";
}

/**
 * テキストから音声ファイルを生成
 * @param text 読み上げテキスト
 * @param outputPath 出力MP3パス
 * @param voice 音声（デフォルト: ja-JP-NanamiNeural）
 * @param rate 速度（デフォルト: +10%）リール用に少し速め
 */
export function generateVoice(
  text,
  outputPath,
  voice = "ja-JP-NanamiNeural",
  rate = "+10%",
) {
  const t = String(text ?? "").trim();
  if (!t) {
    throw new Error("generateVoice: empty text");
  }
  const bin = edgeTtsBin();
  const args = ["--voice", voice, `--rate=${rate}`, "--text", t, "--write-media", outputPath];
  execFileSync(bin, args, { stdio: "inherit", timeout: 60000, env: process.env });
}

/**
 * リールの全スライド用音声を一括生成
 * @param slides [{text, outputPath}]
 * @returns 生成された音声ファイルパスの配列（失敗時は null）
 */
export function generateAllVoices(slides) {
  const results = [];
  for (const slide of slides) {
    const raw = slide?.text;
    const out = slide?.outputPath;
    if (!out || !String(raw ?? "").trim()) {
      results.push(null);
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      generateVoice(raw, out, slide.voice, slide.rate);
      results.push(out);
    } catch (e) {
      console.error(`Voice generation failed for: ${String(raw).slice(0, 80)}`, e?.message ?? e);
      results.push(null);
    }
  }
  return results;
}
