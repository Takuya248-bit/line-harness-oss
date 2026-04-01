import sharp from "sharp";
import { registerFont, createCanvas } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKER_URL = process.env.WORKER_URL || "https://ig-auto-poster.archbridge24.workers.dev";
const WIDTH = 1080;
const HEIGHT = 1350;
const FONT_FAMILY = "Zen Maru Gothic";

// --- フォント登録 ---
function setupFonts() {
  const fontDir = path.join(__dirname, "fonts");
  const boldPath = path.join(fontDir, "ZenMaruGothic-Black.ttf");
  const mediumPath = path.join(fontDir, "ZenMaruGothic-Bold.ttf");
  if (fs.existsSync(boldPath)) registerFont(boldPath, { family: FONT_FAMILY, weight: "900" });
  if (fs.existsSync(mediumPath)) registerFont(mediumPath, { family: FONT_FAMILY, weight: "700" });
}

// --- 画像ダウンロード ---
async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; IGAutoBot/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// --- 写真を1080x1350にリサイズ+暗めオーバーレイ ---
async function prepareBackground(imageUrl, overlayOpacity = 0.35) {
  let imgBuf = await downloadImage(imageUrl);
  if (!imgBuf) {
    // フォールバック: 黒背景にグラデーション
    return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 20, g: 40, b: 40, alpha: 1 } } }).jpeg().toBuffer();
  }

  const overlay = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="rgba(0,0,0,${overlayOpacity})"/></svg>`
  );

  return sharp(imgBuf)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// --- テキストをSVGで描画（node-canvas で計測、Sharp compositeで合成） ---
function textToSvg(lines, options = {}) {
  const {
    fontSize = 40,
    fontWeight = "700",
    color = "white",
    align = "center",
    x = WIDTH / 2,
    y = 0,
    lineHeight = 1.5,
    maxWidth = WIDTH - 80,
    shadow = true,
  } = options;

  const lineElements = lines.map((line, i) => {
    const yPos = y + i * fontSize * lineHeight;
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    const shadowFilter = shadow ? `filter="url(#shadow)"` : "";
    return `<text x="${x}" y="${yPos}" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" text-anchor="${anchor}" ${shadowFilter}>${escapeXml(line)}</text>`;
  });

  const totalHeight = lines.length * fontSize * lineHeight + 20;
  return {
    svg: Buffer.from(`<svg width="${WIDTH}" height="${Math.ceil(totalHeight)}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.7)"/></filter></defs>
      ${lineElements.join("\n")}
    </svg>`),
    height: totalHeight,
  };
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- テキスト折り返し ---
function wrapText(text, maxChars = 18) {
  if (text.length <= maxChars) return [text];
  const lines = [];
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars));
  }
  return lines;
}

// --- カバースライド生成 ---
async function generateCover(coverData) {
  const bg = await prepareBackground(coverData.imageUrl, 0.45);

  // 中央のテキストボックス（半透明黒背景+白枠）
  const boxWidth = 800;
  const boxHeight = 400;
  const boxX = (WIDTH - boxWidth) / 2;
  const boxY = (HEIGHT - boxHeight) / 2;

  const boxSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="12" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.8)" stroke-width="3"/>
  </svg>`);

  // Balilingualロゴ
  const logoSvg = Buffer.from(`<svg width="${WIDTH}" height="80" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.7)"/></filter></defs>
    <text x="${WIDTH / 2}" y="50" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="white" text-anchor="middle" filter="url(#s)">Barilingual</text>
  </svg>`);

  // キャッチコピー
  const catchLines = wrapText(coverData.catchCopy, 18);
  const catchSvg = textToSvg(catchLines, { fontSize: 42, fontWeight: "700", y: boxY + 60 });

  // メインタイトル
  const titleLines = wrapText(coverData.mainTitle, 10);
  const titleSvg = textToSvg(titleLines, { fontSize: 72, fontWeight: "900", y: boxY + 160 });

  // カウントバッジ
  const badgeSize = 80;
  const badgeX = (WIDTH - badgeSize) / 2;
  const badgeY = boxY + boxHeight - badgeSize - 30;
  const badgeSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${badgeX + badgeSize / 2}" cy="${badgeY + badgeSize / 2}" r="${badgeSize / 2}" fill="#E67E22"/>
    <text x="${badgeX + badgeSize / 2}" y="${badgeY + badgeSize / 2 + 12}" font-family="${FONT_FAMILY}" font-size="32" font-weight="900" fill="white" text-anchor="middle">${escapeXml(coverData.countLabel)}</text>
  </svg>`);

  return sharp(bg)
    .composite([
      { input: boxSvg, top: 0, left: 0 },
      { input: logoSvg, top: 20, left: 0 },
      { input: catchSvg.svg, top: 0, left: 0 },
      { input: titleSvg.svg, top: 0, left: 0 },
      { input: badgeSvg, top: 0, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// --- スポットスライド生成 ---
async function generateSpot(spotData) {
  const bg = await prepareBackground(spotData.imageUrl, 0.3);

  // Balilingualロゴ
  const logoSvg = Buffer.from(`<svg width="${WIDTH}" height="80" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.7)"/></filter></defs>
    <text x="${WIDTH / 2}" y="50" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="white" text-anchor="middle" filter="url(#s)">Barilingual</text>
  </svg>`);

  // 番号バッジ
  const badgeSvg = Buffer.from(`<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="40" fill="#E67E22"/>
    <text x="40" y="52" font-family="${FONT_FAMILY}" font-size="32" font-weight="900" fill="white" text-anchor="middle">${spotData.spotNumber}</text>
  </svg>`);

  // スポット名（pill背景付き）
  const nameLines = wrapText(spotData.spotName, 14);
  const nameSvg = textToSvg(nameLines, { fontSize: 48, fontWeight: "900", y: 180 });
  const nameBoxHeight = nameLines.length * 48 * 1.5 + 20;
  const nameBoxSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${WIDTH / 2 - 350}" y="155" width="700" height="${nameBoxHeight}" rx="12" fill="rgba(0,0,0,0.45)"/>
  </svg>`);

  // 下部グラデーション
  const gradHeight = 500;
  const gradSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(0,0,0,0)" stop-opacity="0"/>
      <stop offset="0.15" stop-color="rgba(0,0,0,0.9)" stop-opacity="0.9"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.95)" stop-opacity="0.95"/>
    </linearGradient></defs>
    <rect x="0" y="${HEIGHT - gradHeight}" width="${WIDTH}" height="${gradHeight}" fill="url(#g)"/>
  </svg>`);

  // 説明文
  const descLines = wrapText(spotData.description, 24);
  const descSvg = textToSvg(descLines, { fontSize: 30, fontWeight: "700", y: HEIGHT - gradHeight + 100, x: 40, align: "start" });

  const composites = [
    { input: logoSvg, top: 20, left: 0 },
    { input: badgeSvg, top: 90, left: 40 },
    { input: nameBoxSvg, top: 0, left: 0 },
    { input: nameSvg.svg, top: 0, left: 0 },
    { input: gradSvg, top: 0, left: 0 },
    { input: descSvg.svg, top: 0, left: 0 },
  ];

  if (spotData.hours) {
    const hoursSvg = textToSvg([`⏰ ${spotData.hours}`], { fontSize: 28, y: HEIGHT - 80, x: 40, align: "start" });
    composites.push({ input: hoursSvg.svg, top: 0, left: 0 });
  }

  return sharp(bg).composite(composites).jpeg({ quality: 90 }).toBuffer();
}

// --- まとめスライド（写真なし、トロピカルグラデーション） ---
async function generateSummary(summaryData) {
  // トロピカルグラデーション背景
  const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="35%" stop-color="#00695C"/>
      <stop offset="70%" stop-color="#00897B"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  </svg>`);

  const bg = await sharp(Buffer.from(bgSvg)).jpeg({ quality: 90 }).toBuffer();

  const logoSvg = Buffer.from(`<svg width="${WIDTH}" height="80" xmlns="http://www.w3.org/2000/svg">
    <text x="${WIDTH / 2}" y="50" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="white" text-anchor="middle">Barilingual</text>
  </svg>`);

  const titleSvg = textToSvg(["まとめ"], { fontSize: 40, fontWeight: "900", y: 120, shadow: false });

  const spotElements = summaryData.spots.map((spot, i) => {
    const y = 200 + i * 180;
    return Buffer.from(`<svg width="${WIDTH}" height="180" xmlns="http://www.w3.org/2000/svg">
      <circle cx="70" cy="50" r="28" fill="#E67E22"/>
      <text x="70" y="60" font-family="${FONT_FAMILY}" font-size="24" font-weight="900" fill="white" text-anchor="middle">${spot.number}</text>
      <text x="120" y="42" font-family="${FONT_FAMILY}" font-size="32" font-weight="900" fill="white">${escapeXml(spot.name)}</text>
      <text x="120" y="78" font-family="${FONT_FAMILY}" font-size="24" font-weight="700" fill="rgba(255,255,255,0.8)">${escapeXml(spot.oneLiner)}</text>
      <line x1="48" y1="110" x2="${WIDTH - 48}" y2="110" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    </svg>`);
  });

  const composites = [
    { input: logoSvg, top: 20, left: 0 },
    { input: titleSvg.svg, top: 0, left: 0 },
    ...spotElements.map((svg, i) => ({ input: svg, top: 200 + i * 160, left: 0 })),
  ];

  return sharp(bg).composite(composites).jpeg({ quality: 90 }).toBuffer();
}

// --- CTAスライド ---
async function generateCta() {
  const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="35%" stop-color="#00695C"/>
      <stop offset="70%" stop-color="#00897B"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  </svg>`);

  const bg = await sharp(Buffer.from(bgSvg)).jpeg({ quality: 90 }).toBuffer();

  const logoSvg = Buffer.from(`<svg width="${WIDTH}" height="80" xmlns="http://www.w3.org/2000/svg">
    <text x="${WIDTH / 2}" y="50" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="white" text-anchor="middle">Barilingual</text>
  </svg>`);

  const mainText = textToSvg(["無料で留学費用表を", "受け取れます"], { fontSize: 48, fontWeight: "900", y: 480, shadow: false });

  const buttonSvg = Buffer.from(`<svg width="${WIDTH}" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect x="${WIDTH / 2 - 220}" y="10" width="440" height="70" rx="35" fill="#06C755"/>
    <text x="${WIDTH / 2}" y="55" font-family="${FONT_FAMILY}" font-size="32" font-weight="900" fill="white" text-anchor="middle">LINEで受け取る</text>
  </svg>`);

  const subText = textToSvg(["プロフィールのリンクから", "どうぞ！"], { fontSize: 30, fontWeight: "700", color: "rgba(255,255,255,0.8)", y: 750, shadow: false });

  return sharp(bg)
    .composite([
      { input: logoSvg, top: 20, left: 0 },
      { input: mainText.svg, top: 0, left: 0 },
      { input: buttonSvg, top: 620, left: 0 },
      { input: subText.svg, top: 0, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// --- 全スライド生成 ---
async function generateAllSlides(contentJson) {
  const slides = [];

  // 1. カバー
  slides.push(await generateCover(contentJson.coverData));

  // 2-6. スポット
  for (const spot of contentJson.spotsData) {
    slides.push(await generateSpot(spot));
  }

  // 7. まとめ
  slides.push(await generateSummary(contentJson.summaryData));

  // 8. CTA
  slides.push(await generateCta());

  return slides;
}

// --- メイン ---
async function main() {
  setupFonts();

  console.log("[generate-images] Fetching pending content...");
  const res = await fetch(`${WORKER_URL}/api/pending-images`);
  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    console.log("[generate-images] No pending content.");
    return;
  }

  console.log(`[generate-images] ${data.items.length} items to process`);

  for (const item of data.items) {
    console.log(`[generate-images] Processing #${item.id}: ${item.category}`);

    try {
      const contentJson = JSON.parse(item.content_json);
      const jpegBuffers = await generateAllSlides(contentJson);

      // Base64エンコードしてWorker APIに送信
      const slides = jpegBuffers.map((buf, i) => ({
        index: i,
        imageBase64: buf.toString("base64"),
      }));

      // 大きすぎる場合は2枚ずつ分割送信
      const BATCH_SIZE = 2;
      for (let i = 0; i < slides.length; i += BATCH_SIZE) {
        const batch = slides.slice(i, i + BATCH_SIZE);
        const uploadRes = await fetch(`${WORKER_URL}/api/slides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentId: item.id, slides: batch }),
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.text();
          throw new Error(`Upload failed: ${err}`);
        }

        console.log(`[generate-images] Uploaded slides ${i + 1}-${Math.min(i + BATCH_SIZE, slides.length)} for #${item.id}`);
      }

      console.log(`[generate-images] Done #${item.id}`);
    } catch (err) {
      console.error(`[generate-images] Error #${item.id}:`, err.message);
    }
  }

  console.log("[generate-images] All done.");
}

main().catch(console.error);
