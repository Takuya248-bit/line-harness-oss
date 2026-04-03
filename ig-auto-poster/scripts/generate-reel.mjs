import sharp from "sharp";
import { registerFont } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { generateAllVoices } from "./generate-voice.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes("--dry-run");
const WORKER_URL = process.env.WORKER_URL || "https://ig-auto-poster.archbridge24.workers.dev";
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const FONT_FAMILY = "Zen Maru Gothic";
const TMP_DIR = path.join("/tmp", "ig-reels");

const DUR_HOOK = 2;
const DUR_FACT = 1.5;
const DUR_CTA = 3;
/** ASS \fad fade-in (ms) */
const ASS_FADE_IN_MS = 300;

function setupFonts() {
  const fontDir = path.join(__dirname, "fonts");
  const boldPath = path.join(fontDir, "ZenMaruGothic-Black.ttf");
  const mediumPath = path.join(fontDir, "ZenMaruGothic-Bold.ttf");
  if (fs.existsSync(boldPath)) registerFont(boldPath, { family: FONT_FAMILY, weight: "900" });
  if (fs.existsSync(mediumPath)) registerFont(mediumPath, { family: FONT_FAMILY, weight: "700" });
}

function fontFilePath() {
  const boldPath = path.join(__dirname, "fonts", "ZenMaruGothic-Black.ttf");
  if (fs.existsSync(boldPath)) return boldPath;
  const mediumPath = path.join(__dirname, "fonts", "ZenMaruGothic-Bold.ttf");
  return mediumPath;
}

function wrapText(text, maxChars = 14) {
  const t = String(text);
  if (t.length <= maxChars) return [t];
  const lines = [];
  for (let i = 0; i < t.length; i += maxChars) {
    lines.push(t.slice(i, i + maxChars));
  }
  return lines;
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; IGAutoBot/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function downloadVideoFile(url, destPath) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; IGAutoBot/1.0)" },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return true;
}

async function prepareBackground(imageUrl, overlayOpacity = 0.5) {
  let imgBuf = imageUrl ? await downloadImage(imageUrl) : null;
  if (!imgBuf) {
    return sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 77, b: 64, alpha: 1 } },
    })
      .jpeg()
      .toBuffer();
  }

  const overlay = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="rgba(0,0,0,${overlayOpacity})"/></svg>`,
  );

  return sharp(imgBuf)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Fact slide: 背景のみ（本文はASS字幕で重畳） */
async function generateFactBackgroundJpeg(imageUrl) {
  const bg = await prepareBackground(imageUrl || null, 0.55);
  return bg;
}

/** CTA: still frame without on-screen hook/fact text (overlay added in ffmpeg if needed) */
async function generateCtaBaseSlide() {
  const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <text x="${WIDTH / 2}" y="${HEIGHT / 2 - 120}" font-family="${FONT_FAMILY}" font-size="48" font-weight="900" fill="white" text-anchor="middle">気になったら</text>
    <text x="${WIDTH / 2}" y="${HEIGHT / 2 - 50}" font-family="${FONT_FAMILY}" font-size="48" font-weight="900" fill="white" text-anchor="middle">プロフィールのリンクから</text>
    <rect x="${WIDTH / 2 - 280}" y="${HEIGHT / 2 + 40}" width="560" height="88" rx="44" fill="#06C755"/>
    <text x="${WIDTH / 2}" y="${HEIGHT / 2 + 98}" font-family="${FONT_FAMILY}" font-size="36" font-weight="900" fill="white" text-anchor="middle">LINEで費用表を受け取る</text>
    <text x="${WIDTH / 2}" y="${HEIGHT / 2 + 220}" font-family="${FONT_FAMILY}" font-size="30" font-weight="700" fill="rgba(255,255,255,0.75)" text-anchor="middle">Barilingual</text>
  </svg>`);
  return sharp(bgSvg).jpeg({ quality: 90 }).toBuffer();
}

function pickBgmPath() {
  const bgmDir = path.join(__dirname, "bgm");
  if (!fs.existsSync(bgmDir)) return null;
  const files = fs.readdirSync(bgmDir).filter((f) => f.endsWith(".mp3") || f.endsWith(".m4a"));
  if (files.length === 0) return null;
  return path.join(bgmDir, files[Math.floor(Math.random() * files.length)]);
}

function framesForDuration(sec) {
  return Math.max(2, Math.round(sec * FPS));
}

/** Random Ken Burns: 0 zoom in, 1 zoom out, 2 pan */
function kenBurnsZoompan(durationSec, pattern) {
  const d = framesForDuration(durationSec);
  if (pattern === 1) {
    const step = d > 1 ? 0.2 / (d - 1) : 0.2;
    return `zoompan=z='max(1.2-${step.toFixed(6)}*on,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
  }
  if (pattern === 2) {
    return `zoompan=z='1.15':x='if(eq(on,0),0,min(x+2,iw-(iw/zoom)))':y='ih/2-(ih/zoom/2)':d=${d}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
  }
  return `zoompan=z='min(zoom+0.004,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
}

function formatAssTime(sec) {
  const c = Math.max(0, Math.round(sec * 100));
  const cs = c % 100;
  const sTotal = (c - cs) / 100;
  const s = sTotal % 60;
  const mTotal = (sTotal - s) / 60;
  const m = mTotal % 60;
  const h = (mTotal - m) / 60;
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

/** Escape user text for ASS Dialogue body (literal braces and backslashes). */
function escapeAssText(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\N")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

function escapePathForVideoFilter(p) {
  return path.resolve(p).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/,/g, "\\,");
}

/**
 * Write one ASS file for a single segment (hook or one fact) and return its path.
 * @param {string} hookText
 * @param {string[]} facts
 * @param {number} durations — duration in seconds for this segment only
 * @param {string} workBase
 * @param {{ type: 'hook' } | { type: 'fact', index: number }} segment
 */
function generateAssFile(hookText, facts, durations, workBase, segment) {
  const durationSec = durations;
  const endStr = formatAssTime(durationSec);
  const fad = `\\fad(${ASS_FADE_IN_MS},0)`;

  const lines =
    segment.type === "hook"
      ? wrapText(hookText, 12)
      : wrapText(facts[segment.index] ?? "", 14);
  const body = lines.map(escapeAssText).join("\\N");
  const hookBlock = `Dialogue: 0,0:00:00.00,${endStr},Hook,,0,0,0,,{${fad}}${body}`;

  let numberBlock = "";
  if (segment.type === "fact") {
    const n = segment.index + 1;
    const badge = String(n).padStart(2, "0");
    numberBlock = `Dialogue: 1,0:00:00.00,${endStr},Number,,0,0,0,,{${fad}}${escapeAssText(badge)}\n`;
  }

  const ass = `[Script Info]
Title: IG Reel
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Zen Maru Gothic,56,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,3,3,2,2,60,60,80,1
Style: Fact,Zen Maru Gothic,42,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,3,2,2,2,60,60,120,1
Style: Number,Zen Maru Gothic,72,&H0000BCD4,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,7,30,0,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events =
    segment.type === "hook"
      ? `${hookBlock}\n`
      : `${numberBlock}Dialogue: 0,0:00:00.00,${endStr},Fact,,0,0,0,,{${fad}}${body}\n`;

  const outName = segment.type === "hook" ? "sub-hook.ass" : `sub-fact-${segment.index}.ass`;
  const outPath = path.join(workBase, outName);
  fs.writeFileSync(outPath, ass + events, "utf8");
  if (DRY_RUN) {
    console.log("[generate-reel] dry-run wrote ASS:", outPath);
  }
  return outPath;
}

function vfAssChain(assPath) {
  const assEsc = escapePathForVideoFilter(assPath);
  const fontsEsc = escapePathForVideoFilter(path.dirname(fontFilePath()));
  return `ass=${assEsc}:fontsdir=${fontsEsc}`;
}

function runFfmpeg(args) {
  if (DRY_RUN) {
    console.log("[generate-reel] dry-run ffmpeg:", "ffmpeg", args.join(" "));
    return;
  }
  execFileSync("ffmpeg", args, { stdio: "inherit" });
}

/**
 * Video-only (no audio) from image + Ken Burns + ASS subtitles
 */
function renderStillKenBurnsToVideo(imagePath, durationSec, assPath, opts) {
  const { outPath, kbPattern } = opts;
  const z = kenBurnsZoompan(durationSec, kbPattern);
  const vf = `${z},format=yuv420p,${vfAssChain(assPath)}`;
  runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-vf",
    vf,
    "-t",
    String(durationSec),
    "-r",
    String(FPS),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outPath,
  ]);
}

/**
 * Video-only from downloaded clip: trim, scale+crop, ASS subtitles
 */
function renderClipToVideo(clipPath, durationSec, assPath, outPath) {
  const vf = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},format=yuv420p,${vfAssChain(assPath)}`;
  runFfmpeg([
    "-y",
    "-stream_loop",
    "-1",
    "-i",
    clipPath,
    "-vf",
    vf,
    "-t",
    String(durationSec),
    "-r",
    String(FPS),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outPath,
  ]);
}

/** Still image with center crop scale (no Ken Burns) — for CTA embedded SVG already has text */
function renderStillStaticToVideo(imagePath, durationSec, outPath) {
  runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-vf",
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},format=yuv420p`,
    "-t",
    String(durationSec),
    "-r",
    String(FPS),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outPath,
  ]);
}

/**
 * Mux video (no audio) + voice or silence into segment with stereo AAC
 */
function muxSegmentVideoAudio(videoSilentPath, voicePathOrNull, durationSec, outPath) {
  if (DRY_RUN) {
    console.log("[generate-reel] dry-run mux", videoSilentPath, voicePathOrNull, outPath);
    fs.copyFileSync(videoSilentPath, outPath);
    return;
  }
  if (voicePathOrNull && fs.existsSync(voicePathOrNull)) {
    runFfmpeg([
      "-y",
      "-i",
      videoSilentPath,
      "-i",
      voicePathOrNull,
      "-filter_complex",
      `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,apad=whole_dur=${durationSec}[a1]`,
      "-map",
      "0:v",
      "-map",
      "[a1]",
      "-t",
      String(durationSec),
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-ac",
      "2",
      outPath,
    ]);
  } else {
    runFfmpeg([
      "-y",
      "-i",
      videoSilentPath,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=44100:cl=stereo`,
      "-filter_complex",
      `[1:a]atrim=0:${durationSec},asetpts=PTS-STARTPTS[a1]`,
      "-map",
      "0:v",
      "-map",
      "[a1]",
      "-t",
      String(durationSec),
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outPath,
    ]);
  }
}

function mixFinalWithBgm(videoWithVoicePath, bgmPath, totalDuration, outPath) {
  if (!bgmPath || !fs.existsSync(bgmPath)) {
    if (DRY_RUN) {
      console.log("[generate-reel] dry-run skip BGM");
      return;
    }
    fs.copyFileSync(videoWithVoicePath, outPath);
    return;
  }
  const loopSamples = 44100 * 30;
  runFfmpeg([
    "-y",
    "-i",
    videoWithVoicePath,
    "-i",
    bgmPath,
    "-filter_complex",
    `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[voice];` +
      `[1:a]volume=0.25,aloop=loop=-1:size=${loopSamples},aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:${totalDuration},asetpts=PTS-STARTPTS[bgm];` +
      `[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    String(totalDuration),
    outPath,
  ]);
}

function concatSegments(segmentPaths, outPath) {
  if (DRY_RUN) {
    console.log("[generate-reel] dry-run concat", segmentPaths);
    if (segmentPaths[0]) fs.copyFileSync(segmentPaths[0], outPath);
    return;
  }
  const args = ["-y"];
  let fcIn = "";
  for (let i = 0; i < segmentPaths.length; i++) {
    args.push("-i", segmentPaths[i]);
    fcIn += `[${i}:v][${i}:a]`;
  }
  const fc = `${fcIn}concat=n=${segmentPaths.length}:v=1:a=1[v][a]`;
  args.push("-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", outPath);
  execFileSync("ffmpeg", args, { stdio: "inherit" });
}

function isReelItem(item) {
  if (item.format_type === "reel") return true;
  try {
    const json = JSON.parse(item.content_json);
    return json.duration != null;
  } catch {
    return false;
  }
}

async function main() {
  setupFonts();
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const res = await fetch(`${WORKER_URL}/api/pending-images`);
  const data = await res.json();
  const reelItems = (data.items || []).filter(isReelItem);

  if (reelItems.length === 0) {
    console.log("[generate-reel] No pending reels.");
    return;
  }

  for (const item of reelItems) {
    console.log(`[generate-reel] Processing #${item.id}`);
    try {
      const content = JSON.parse(item.content_json);
      const facts = Array.isArray(content.facts) ? content.facts : [];
      const videoUrls = Array.isArray(content.videoClipUrls) ? content.videoClipUrls : [];
      const hookText = content.hookText || content.title || "バリ島、知ってた？";

      const ts = Date.now();
      const workBase = path.join(TMP_DIR, `${item.id}-${ts}`);
      fs.mkdirSync(workBase, { recursive: true });

      const voiceTasks = [];
      voiceTasks.push({ text: hookText, outputPath: path.join(workBase, "voice-hook.mp3") });
      for (let i = 0; i < facts.length; i++) {
        voiceTasks.push({ text: facts[i], outputPath: path.join(workBase, `voice-fact-${i}.mp3`) });
      }

      const voicePaths = generateAllVoices(voiceTasks);

      const silentParts = [];
      const kbPatternHook = Math.floor(Math.random() * 3);
      const kbPatternsFacts = facts.map(() => Math.floor(Math.random() * 3));

      /** Hook */
      const hookUrl = videoUrls[0] ?? null;
      const hookSilent = path.join(workBase, "hook-silent.mp4");
      const hookAss = generateAssFile(hookText, facts, DUR_HOOK, workBase, { type: "hook" });
      if (hookUrl) {
        const hookClip = path.join(workBase, "hook-src.mp4");
        const ok = await downloadVideoFile(hookUrl, hookClip);
        if (ok) {
          renderClipToVideo(hookClip, DUR_HOOK, hookAss, hookSilent);
        } else {
          const hookStillPath = path.join(workBase, "hook-fallback.jpg");
          const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  </svg>`);
          const hookFbBuf = await sharp(bgSvg).jpeg({ quality: 92 }).toBuffer();
          fs.writeFileSync(hookStillPath, hookFbBuf);
          renderStillKenBurnsToVideo(hookStillPath, DUR_HOOK, hookAss, {
            outPath: hookSilent,
            kbPattern: kbPatternHook,
          });
        }
      } else {
        const hookStillPath = path.join(workBase, "hook-plain.jpg");
        const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  </svg>`);
        const plainHook = await sharp(bgSvg).jpeg({ quality: 92 }).toBuffer();
        fs.writeFileSync(hookStillPath, plainHook);
        renderStillKenBurnsToVideo(hookStillPath, DUR_HOOK, hookAss, {
          outPath: hookSilent,
          kbPattern: kbPatternHook,
        });
      }

      const hookSeg = path.join(workBase, "hook-seg.mp4");
      muxSegmentVideoAudio(hookSilent, voicePaths[0], DUR_HOOK, hookSeg);
      silentParts.push(hookSeg);

      /** Facts */
      for (let i = 0; i < facts.length; i++) {
        const vUrl = videoUrls[i + 1] ?? null;
        const imgUrl = content.factImageUrls?.[i] ?? content.imageUrls?.[i] ?? null;
        const silentV = path.join(workBase, `fact-${i}-silent.mp4`);
        const factAss = generateAssFile(hookText, facts, DUR_FACT, workBase, { type: "fact", index: i });
        if (vUrl) {
          const fp = path.join(workBase, `fact-${i}-src.mp4`);
          const ok = await downloadVideoFile(vUrl, fp);
          if (ok) {
            renderClipToVideo(fp, DUR_FACT, factAss, silentV);
          } else {
            const still = path.join(workBase, `fact-${i}.jpg`);
            const factBuf = await generateFactBackgroundJpeg(imgUrl);
            fs.writeFileSync(still, factBuf);
            renderStillKenBurnsToVideo(still, DUR_FACT, factAss, {
              outPath: silentV,
              kbPattern: kbPatternsFacts[i] ?? 0,
            });
          }
        } else {
          const still = path.join(workBase, `fact-${i}.jpg`);
          const factBuf = await generateFactBackgroundJpeg(imgUrl);
          fs.writeFileSync(still, factBuf);
          renderStillKenBurnsToVideo(still, DUR_FACT, factAss, {
            outPath: silentV,
            kbPattern: kbPatternsFacts[i] ?? 0,
          });
        }
        const factSeg = path.join(workBase, `fact-${i}-seg.mp4`);
        muxSegmentVideoAudio(silentV, voicePaths[i + 1], DUR_FACT, factSeg);
        silentParts.push(factSeg);
      }

      /** CTA */
      const ctaStill = path.join(workBase, "cta.jpg");
      const ctaBuf = await generateCtaBaseSlide();
      fs.writeFileSync(ctaStill, ctaBuf);
      const ctaSilent = path.join(workBase, "cta-silent.mp4");
      renderStillStaticToVideo(ctaStill, DUR_CTA, ctaSilent);
      const ctaSeg = path.join(workBase, "cta-seg.mp4");
      muxSegmentVideoAudio(ctaSilent, null, DUR_CTA, ctaSeg);
      silentParts.push(ctaSeg);

      const concatPath = path.join(workBase, "concat-voice.mp4");
      concatSegments(silentParts, concatPath);

      const totalDuration = DUR_HOOK + DUR_FACT * facts.length + DUR_CTA;
      const bgmPath = pickBgmPath();
      const videoPath = path.join(workBase, "final.mp4");
      mixFinalWithBgm(concatPath, bgmPath, totalDuration, videoPath);

      if (DRY_RUN) {
        console.log(`[generate-reel] dry-run skip upload #${item.id}`);
        continue;
      }

      const videoBuffer = fs.readFileSync(videoPath);
      const uploadRes = await fetch(`${WORKER_URL}/api/slides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: item.id,
          slides: [{ index: 0, imageBase64: videoBuffer.toString("base64") }],
          isVideo: true,
        }),
      });

      if (!uploadRes.ok) throw new Error(`Upload failed: ${await uploadRes.text()}`);
      console.log(`[generate-reel] Done #${item.id}`);
    } catch (err) {
      console.error(`[generate-reel] Error #${item.id}:`, err?.message || err);
    }
  }
}

main().catch(console.error);
