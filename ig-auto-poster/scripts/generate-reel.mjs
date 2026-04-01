import sharp from "sharp";
import { registerFont } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes("--dry-run");
const WORKER_URL = process.env.WORKER_URL || "https://ig-auto-poster.archbridge24.workers.dev";
const WIDTH = 1080;
const HEIGHT = 1920;
const FONT_FAMILY = "Zen Maru Gothic";
const TMP_DIR = path.join("/tmp", "ig-reels");

function setupFonts() {
  const fontDir = path.join(__dirname, "fonts");
  const boldPath = path.join(fontDir, "ZenMaruGothic-Black.ttf");
  const mediumPath = path.join(fontDir, "ZenMaruGothic-Bold.ttf");
  if (fs.existsSync(boldPath)) registerFont(boldPath, { family: FONT_FAMILY, weight: "900" });
  if (fs.existsSync(mediumPath)) registerFont(mediumPath, { family: FONT_FAMILY, weight: "700" });
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function textToSvg(lines, options = {}) {
  const {
    fontSize = 48,
    fontWeight = "900",
    color = "white",
    x = WIDTH / 2,
    y0 = HEIGHT / 2,
    lineHeight = 1.4,
    shadow = true,
  } = options;

  const lineElements = lines.map((line, i) => {
    const yPos = y0 + i * fontSize * lineHeight;
    const shadowFilter = shadow ? `filter="url(#shadow)"` : "";
    return `<text x="${x}" y="${yPos}" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" text-anchor="middle" ${shadowFilter}>${escapeXml(line)}</text>`;
  });

  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.7)"/></filter></defs>
    ${lineElements.join("\n")}
  </svg>`);
}

/** フック: トロピカルグラデ + 中央太字 */
async function generateHookSlide(hookText) {
  const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  </svg>`);

  const lines = wrapText(hookText, 12);
  const midY = HEIGHT / 2 - ((lines.length - 1) * 64 * 1.2) / 2;
  const textSvg = textToSvg(lines, { fontSize: 64, fontWeight: "900", y0: midY, lineHeight: 1.25 });

  return sharp(bgSvg).composite([{ input: textSvg, top: 0, left: 0 }]).jpeg({ quality: 90 }).toBuffer();
}

/** ファクト: 暗めオーバーレイ + テキスト */
async function generateFactSlide(text, imageUrl) {
  const bg = await prepareBackground(imageUrl || null, 0.55);
  const lines = wrapText(text, 14);
  const midY = HEIGHT / 2 - ((lines.length - 1) * 48 * 1.25) / 2;
  const textSvg = textToSvg(lines, { fontSize: 48, fontWeight: "900", y0: midY, lineHeight: 1.25 });
  return sharp(bg).composite([{ input: textSvg, top: 0, left: 0 }]).jpeg({ quality: 90 }).toBuffer();
}

/** CTA: LINE緑ボタン */
async function generateCtaSlide() {
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

function writeConcatList(slidePaths, durationPerSlide, listPath) {
  const lines = [];
  for (const p of slidePaths) {
    const abs = path.resolve(p);
    lines.push(`file '${abs.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${durationPerSlide}`);
  }
  const last = path.resolve(slidePaths[slidePaths.length - 1]);
  lines.push(`file '${last.replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(listPath, lines.join("\n"));
}

function createVideo(slidePaths, outputPath, durationPerSlide, totalDuration) {
  const listPath = path.join(TMP_DIR, `concat-${Date.now()}.txt`);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  writeConcatList(slidePaths, durationPerSlide, listPath);

  const bgmPath = pickBgmPath();
  const vf = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:-1:-1,fps=30`;

  const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p"];

  if (bgmPath) {
    args.push("-i", bgmPath, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "128k", "-shortest");
  } else {
    args.push("-t", String(totalDuration));
  }
  args.push(outputPath);

  if (DRY_RUN) {
    console.log("[generate-reel] dry-run ffmpeg:", "ffmpeg", args.join(" "));
    return;
  }
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
      const slidePaths = [];

      const hookBuf = await generateHookSlide(content.hookText || content.title || "バリ島、知ってた？");
      const hookPath = path.join(TMP_DIR, `${item.id}-hook.jpg`);
      fs.writeFileSync(hookPath, hookBuf);
      slidePaths.push(hookPath);

      const facts = Array.isArray(content.facts) ? content.facts : [];
      for (let i = 0; i < facts.length; i++) {
        const imgUrl = content.factImageUrls?.[i] || content.imageUrls?.[i] || null;
        const factBuf = await generateFactSlide(facts[i], imgUrl);
        const factPath = path.join(TMP_DIR, `${item.id}-fact-${i}.jpg`);
        fs.writeFileSync(factPath, factBuf);
        slidePaths.push(factPath);
      }

      const ctaBuf = await generateCtaSlide();
      const ctaPath = path.join(TMP_DIR, `${item.id}-cta.jpg`);
      fs.writeFileSync(ctaPath, ctaBuf);
      slidePaths.push(ctaPath);

      const n = slidePaths.length;
      const rawPer = Math.floor((content.duration || 20) / n);
      const durationPerSlide = Math.min(5, Math.max(3, rawPer));
      const totalDuration = n * durationPerSlide;
      const videoPath = path.join(TMP_DIR, `${item.id}.mp4`);

      createVideo(slidePaths, videoPath, durationPerSlide, totalDuration);

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
