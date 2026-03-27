import { Resvg } from "@cf-wasm/resvg/workerd";
import type { ContentItem, SlideData } from "./content-data";

// --- Color Scheme ---
const NAVY = "#1A237E";
const TURQUOISE = "#00BCD4";
const ORANGE = "#FF6F00";
const GRAY = "#757575";
const LIGHT_GRAY = "#FAFAFA";
const MINT = "#E8F5E9";
const WHITE = "#FFFFFF";
const BG_LIGHT = "#E0F7FA";

const WIDTH = 1080;
const HEIGHT = 1350;

// --- Font Cache ---
let fontRegularData: Uint8Array | null = null;
let fontBoldData: Uint8Array | null = null;

// Zen Maru Gothic Black (最も太いウェイト)
const FONT_BOLD_URL =
  "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Black.ttf";
const FONT_MEDIUM_URL =
  "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Bold.ttf";

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status} ${url}`);
  return res.arrayBuffer();
}

async function ensureFonts(): Promise<void> {
  if (fontRegularData && fontBoldData) return;

  const [bold, medium] = await Promise.all([
    fetchFont(FONT_BOLD_URL),
    fetchFont(FONT_MEDIUM_URL),
  ]);
  fontBoldData = new Uint8Array(bold);
  fontRegularData = new Uint8Array(medium);
}

// --- SVG Helper ---
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Wrap text into lines that fit within a given width (approximate)
// For English (contains spaces): wraps at word boundaries
// For Japanese (no spaces): wraps at character count
function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (text.length <= maxCharsPerLine) return [text];
  // If text contains spaces, wrap at word boundaries
  if (text.includes(" ")) {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (test.length > maxCharsPerLine && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
  // Japanese: wrap at character count
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) {
      lines.push(remaining);
      break;
    }
    lines.push(remaining.slice(0, maxCharsPerLine));
    remaining = remaining.slice(maxCharsPerLine);
  }
  return lines;
}

// --- SVG → PNG Render Pipeline ---
async function renderSvgToPng(svgString: string): Promise<Uint8Array> {
  await ensureFonts();

  const resvg = await Resvg.async(svgString, {
    fitTo: { mode: "width" as const, value: WIDTH },
    font: {
      fontBuffers: [fontRegularData!, fontBoldData!],
      loadSystemFonts: false,
    },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}

// =====================================================
// SVG Template: Cover
// =====================================================
function buildCoverSvg(title: string, subtitle: string): string {
  const titleLines = title.split("\n");
  const titleY = 470;
  const titleElements = titleLines
    .map(
      (line, i) =>
        `<text x="540" y="${titleY + i * 130}" text-anchor="middle" font-size="104" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");
  const afterTitle = titleY + titleLines.length * 130;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="35%" stop-color="#00695C"/>
      <stop offset="70%" stop-color="#00897B"/>
      <stop offset="100%" stop-color="${TURQUOISE}"/>
    </linearGradient>
  </defs>
  <!-- Tropical gradient -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)"/>
  <!-- Organic shapes for Bali vibe -->
  <ellipse cx="950" cy="120" rx="300" ry="180" fill="rgba(255,255,255,0.04)" transform="rotate(-15 950 120)"/>
  <ellipse cx="100" cy="1200" rx="350" ry="200" fill="rgba(255,255,255,0.04)" transform="rotate(20 100 1200)"/>
  <circle cx="900" cy="350" r="60" fill="rgba(255,255,255,0.06)"/>
  <circle cx="180" cy="900" r="45" fill="rgba(255,255,255,0.06)"/>
  <!-- Decorative dots (plumeria) -->
  <circle cx="160" cy="200" r="10" fill="rgba(255,255,255,0.2)"/>
  <circle cx="200" cy="240" r="6" fill="rgba(255,255,255,0.15)"/>
  <circle cx="130" cy="260" r="7" fill="rgba(255,255,255,0.12)"/>
  <circle cx="920" cy="1000" r="10" fill="rgba(255,255,255,0.2)"/>
  <circle cx="880" cy="1040" r="6" fill="rgba(255,255,255,0.15)"/>
  <circle cx="950" cy="1060" r="7" fill="rgba(255,255,255,0.12)"/>
  <!-- Wave pattern at bottom -->
  <path d="M0 1200 Q270 1150 540 1200 Q810 1250 1080 1200 L1080 1350 L0 1350Z" fill="rgba(255,255,255,0.06)"/>
  <path d="M0 1240 Q270 1190 540 1240 Q810 1290 1080 1240 L1080 1350 L0 1350Z" fill="rgba(255,255,255,0.04)"/>
  <!-- Badge -->
  <rect x="350" y="300" width="360" height="70" rx="35" fill="${ORANGE}"/>
  <text x="530" y="346" text-anchor="middle" font-size="36" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">保存必須</text>
  <!-- Title (large) -->
  ${titleElements}
  <!-- Subtitle -->
  <text x="540" y="${afterTitle + 80}" text-anchor="middle" font-size="48" font-weight="700" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(subtitle)}</text>
  <!-- Swipe pill -->
  <rect x="310" y="${afterTitle + 140}" width="460" height="66" rx="33" fill="rgba(255,255,255,0.18)"/>
  <text x="540" y="${afterTitle + 182}" text-anchor="middle" font-size="34" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">→ スワイプで全部見る</text>
  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,0,0,0.2)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: CTA
// =====================================================
function buildCTASvg(_leadMagnet: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="35%" stop-color="#00695C"/>
      <stop offset="70%" stop-color="#00897B"/>
      <stop offset="100%" stop-color="${TURQUOISE}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#ctaGrad)"/>
  <!-- Organic shapes -->
  <ellipse cx="950" cy="150" rx="280" ry="160" fill="rgba(255,255,255,0.04)" transform="rotate(-15 950 150)"/>
  <ellipse cx="100" cy="1100" rx="300" ry="180" fill="rgba(255,255,255,0.04)" transform="rotate(20 100 1100)"/>
  <circle cx="880" cy="350" r="50" fill="rgba(255,255,255,0.06)"/>
  <circle cx="200" cy="900" r="40" fill="rgba(255,255,255,0.06)"/>
  <!-- Decorative dots -->
  <circle cx="160" cy="220" r="10" fill="rgba(255,255,255,0.2)"/>
  <circle cx="200" cy="260" r="6" fill="rgba(255,255,255,0.15)"/>
  <circle cx="920" cy="1000" r="10" fill="rgba(255,255,255,0.2)"/>
  <circle cx="880" cy="1040" r="6" fill="rgba(255,255,255,0.15)"/>
  <!-- Wave pattern -->
  <path d="M0 1180 Q270 1130 540 1180 Q810 1230 1080 1180 L1080 1350 L0 1350Z" fill="rgba(255,255,255,0.06)"/>
  <path d="M0 1220 Q270 1170 540 1220 Q810 1270 1080 1220 L1080 1350 L0 1350Z" fill="rgba(255,255,255,0.04)"/>

  <!-- メインCTA: コメント誘導 -->
  <rect x="70" y="140" width="940" height="520" rx="30" fill="${WHITE}"/>
  <text x="540" y="290" text-anchor="middle" font-size="72" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">好きな英単語を</text>
  <text x="540" y="400" text-anchor="middle" font-size="72" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">コメントしてね!</text>
  <!-- オレンジボタン風 -->
  <rect x="140" y="470" width="800" height="100" rx="50" fill="${ORANGE}"/>
  <text x="540" y="536" text-anchor="middle" font-size="46" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">コメントでプレゼントGET</text>

  <!-- プレゼント内容カード -->
  <rect x="70" y="730" width="940" height="380" rx="30" fill="rgba(255,255,255,0.95)"/>
  <rect x="70" y="730" width="940" height="8" rx="4" fill="${ORANGE}"/>
  <text x="540" y="830" text-anchor="middle" font-size="44" font-weight="700" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">無料プレゼント</text>
  <text x="540" y="940" text-anchor="middle" font-size="64" font-weight="700" fill="${ORANGE}" font-family="'Zen Maru Gothic', sans-serif">レベル別</text>
  <text x="540" y="1030" text-anchor="middle" font-size="60" font-weight="700" fill="${ORANGE}" font-family="'Zen Maru Gothic', sans-serif">英語学習ロードマップ</text>

  <!-- アカウント誘導 -->
  <text x="540" y="1185" text-anchor="middle" font-size="34" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">@balilingirl をフォロー</text>

  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,0,0,0.2)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: List Slide
// =====================================================
function buildListSlideSvg(slide: SlideData, total: number): string {
  const pageLabel = `${slide.slideNumber - 1}/${total}`;
  const phraseJp = escapeXml(slide.phraseJp ?? "");
  const exampleEn = escapeXml(slide.exampleEn ?? "");
  const exampleJp = escapeXml(slide.exampleJp ?? "");

  // Wrap long English phrases
  const phraseLines = wrapText(slide.phraseEn ?? "", 18);
  const phraseElements = phraseLines
    .map(
      (line, i) =>
        `<text x="120" y="${310 + i * 100}" font-size="80" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");
  const phraseBottom = 310 + phraseLines.length * 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="listGrad" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#E0F2F1"/>
      <stop offset="50%" stop-color="#B2DFDB"/>
      <stop offset="100%" stop-color="#E0F7FA"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#listGrad)"/>
  <!-- Organic shapes -->
  <ellipse cx="950" cy="100" rx="250" ry="150" fill="rgba(0,188,212,0.06)" transform="rotate(-10 950 100)"/>
  <ellipse cx="80" cy="1200" rx="280" ry="160" fill="rgba(0,188,212,0.06)" transform="rotate(15 80 1200)"/>
  <circle cx="920" cy="800" r="40" fill="rgba(0,150,136,0.05)"/>
  <!-- White card -->
  <rect x="40" y="170" width="1000" height="${phraseBottom + 420 - 170}" rx="30" fill="${WHITE}" opacity="0.92"/>
  <!-- Page badge -->
  <circle cx="120" cy="100" r="50" fill="${TURQUOISE}"/>
  <text x="120" y="116" text-anchor="middle" font-size="36" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(pageLabel)}</text>
  <!-- English phrase -->
  ${phraseElements}
  <!-- Japanese -->
  <text x="120" y="${phraseBottom + 60}" font-size="46" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${phraseJp}</text>
  <!-- Divider -->
  <line x1="120" y1="${phraseBottom + 120}" x2="960" y2="${phraseBottom + 120}" stroke="${TURQUOISE}" stroke-width="3" opacity="0.4"/>
  <!-- Example label -->
  <rect x="120" y="${phraseBottom + 150}" width="180" height="50" rx="25" fill="${TURQUOISE}" opacity="0.15"/>
  <text x="210" y="${phraseBottom + 184}" text-anchor="middle" font-size="32" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">Example</text>
  <!-- Example EN -->
  <text x="120" y="${phraseBottom + 260}" font-size="46" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${exampleEn}</text>
  <!-- Example JP -->
  <text x="120" y="${phraseBottom + 330}" font-size="40" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${exampleJp}</text>
  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,77,64,0.85)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: Quiz Question
// =====================================================
function buildQuizQuestionSvg(slide: SlideData): string {
  const options = [
    { label: "A", text: slide.optionA ?? "" },
    { label: "B", text: slide.optionB ?? "" },
    { label: "C", text: slide.optionC ?? "" },
  ];

  const questionLines = wrapText(slide.questionJp ?? "", 14);
  const questionElements = questionLines
    .map(
      (line, i) =>
        `<text x="100" y="${370 + i * 80}" font-size="60" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");
  const qBottom = 370 + questionLines.length * 80;

  const optionElements = options
    .map(
      (opt, i) =>
        `<rect x="70" y="${qBottom + 50 + i * 130}" width="940" height="106" rx="24" fill="${WHITE}" stroke="#E0E0E0" stroke-width="2"/>
    <circle cx="140" cy="${qBottom + 103 + i * 130}" r="28" fill="${TURQUOISE}" opacity="0.15"/>
    <text x="140" y="${qBottom + 114 + i * 130}" text-anchor="middle" font-size="34" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(opt.label)}</text>
    <text x="190" y="${qBottom + 114 + i * 130}" font-size="46" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(opt.text)}</text>`,
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="qqGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFF8E1"/>
      <stop offset="100%" stop-color="#FFF3E0"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#qqGrad)"/>
  <!-- Organic shapes -->
  <ellipse cx="950" cy="900" rx="200" ry="120" fill="rgba(255,111,0,0.04)" transform="rotate(-20 950 900)"/>
  <ellipse cx="80" cy="1100" rx="220" ry="130" fill="rgba(0,188,212,0.04)" transform="rotate(10 80 1100)"/>
  <circle cx="920" cy="300" r="35" fill="rgba(255,111,0,0.06)"/>
  <!-- Orange header -->
  <rect width="${WIDTH}" height="240" rx="0" fill="${ORANGE}"/>
  <path d="M0 220 Q270 260 540 220 Q810 180 1080 220 L1080 240 L0 240Z" fill="${ORANGE}"/>
  <text x="540" y="155" text-anchor="middle" font-size="120" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">Q.</text>
  <!-- Question -->
  ${questionElements}
  <!-- Options -->
  ${optionElements}
  <!-- Swipe prompt -->
  <rect x="250" y="1140" width="580" height="66" rx="33" fill="rgba(0,188,212,0.12)"/>
  <text x="540" y="1184" text-anchor="middle" font-size="38" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">スワイプで答え合わせ</text>
  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,77,64,0.85)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: Quiz Answer
// =====================================================
function buildQuizAnswerSvg(slide: SlideData): string {
  const explanationLines = wrapText(slide.explanation ?? "", 22);
  const expBoxY = 650;
  const expBoxH = 100 + explanationLines.length * 56;
  const explanationElements = explanationLines
    .map(
      (line, i) =>
        `<text x="130" y="${expBoxY + 65 + i * 56}" font-size="42" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="qaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E0F7FA"/>
      <stop offset="100%" stop-color="#E0F2F1"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#qaGrad)"/>
  <!-- Organic shapes -->
  <ellipse cx="950" cy="850" rx="220" ry="130" fill="rgba(0,188,212,0.05)" transform="rotate(-15 950 850)"/>
  <ellipse cx="80" cy="1100" rx="250" ry="140" fill="rgba(0,150,136,0.04)" transform="rotate(12 80 1100)"/>
  <circle cx="900" cy="350" r="30" fill="rgba(0,188,212,0.06)"/>
  <!-- Turquoise header -->
  <rect width="${WIDTH}" height="240" fill="${TURQUOISE}"/>
  <path d="M0 220 Q270 260 540 220 Q810 180 1080 220 L1080 240 L0 240Z" fill="${TURQUOISE}"/>
  <text x="540" y="155" text-anchor="middle" font-size="120" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">A.</text>
  <!-- Correct label -->
  <rect x="80" y="300" width="380" height="66" rx="33" fill="${ORANGE}"/>
  <text x="270" y="344" text-anchor="middle" font-size="42" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">正解は ${escapeXml(slide.correctOption ?? "")}</text>
  <!-- Answer EN -->
  <text x="80" y="460" font-size="70" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.answerEn ?? "")}</text>
  <!-- Answer JP -->
  <text x="80" y="545" font-size="46" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.answerJp ?? "")}</text>
  <!-- Divider -->
  <line x1="80" y1="600" x2="1000" y2="600" stroke="${TURQUOISE}" stroke-width="3" opacity="0.4"/>
  <!-- Explanation box with Bali decoration -->
  <rect x="80" y="${expBoxY}" width="920" height="${expBoxH}" rx="20" fill="${WHITE}" opacity="0.92"/>
  <rect x="80" y="${expBoxY}" width="6" height="${expBoxH}" rx="3" fill="${TURQUOISE}"/>
  <!-- Decorative dots on box -->
  <circle cx="980" cy="${expBoxY + 20}" r="8" fill="rgba(0,188,212,0.15)"/>
  <circle cx="960" cy="${expBoxY + 45}" r="5" fill="rgba(0,188,212,0.1)"/>
  ${explanationElements}
  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,77,64,0.85)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: Before/After
// =====================================================
function buildBeforeAfterSvg(slide: SlideData): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="baBeforeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFF0F0"/>
      <stop offset="100%" stop-color="#FFE0E0"/>
    </linearGradient>
    <linearGradient id="baAfterGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E0F2F1"/>
      <stop offset="100%" stop-color="#B2DFDB"/>
    </linearGradient>
  </defs>
  <!-- Before (top half) -->
  <rect width="${WIDTH}" height="600" fill="url(#baBeforeGrad)"/>
  <!-- Organic shapes before -->
  <ellipse cx="950" cy="100" rx="200" ry="120" fill="rgba(229,57,53,0.04)" transform="rotate(-10 950 100)"/>
  <circle cx="920" cy="380" r="30" fill="rgba(229,57,53,0.05)"/>
  <!-- Before label -->
  <rect x="80" y="70" width="220" height="56" rx="28" fill="#FFCDD2"/>
  <text x="190" y="106" text-anchor="middle" font-size="34" font-weight="700" fill="#C62828" font-family="'Zen Maru Gothic', sans-serif">日本人英語</text>
  <!-- Before EN -->
  <text x="80" y="230" font-size="62" fill="#616161" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.beforeEn ?? "")}</text>
  <!-- Before JP -->
  <text x="80" y="320" font-size="42" fill="#9E9E9E" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.beforeJp ?? "")}</text>
  <!-- X mark -->
  <circle cx="130" cy="420" r="38" fill="#FFCDD2"/>
  <text x="130" y="436" text-anchor="middle" font-size="48" font-weight="700" fill="#E53935" font-family="'Zen Maru Gothic', sans-serif">X</text>

  <!-- After (bottom half) -->
  <rect y="600" width="${WIDTH}" height="668" fill="url(#baAfterGrad)"/>
  <!-- Organic shapes after -->
  <ellipse cx="100" cy="1100" rx="220" ry="130" fill="rgba(0,150,136,0.05)" transform="rotate(15 100 1100)"/>
  <circle cx="180" cy="800" r="25" fill="rgba(0,188,212,0.06)"/>
  <!-- After label -->
  <rect x="80" y="670" width="250" height="56" rx="28" fill="#B2DFDB"/>
  <text x="205" y="706" text-anchor="middle" font-size="34" font-weight="700" fill="#00695C" font-family="'Zen Maru Gothic', sans-serif">ネイティブ英語</text>
  <!-- After EN -->
  <text x="80" y="840" font-size="62" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.afterEn ?? "")}</text>
  <!-- After JP -->
  <text x="80" y="930" font-size="42" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.afterJp ?? "")}</text>
  <!-- O mark -->
  <circle cx="130" cy="1020" r="38" fill="#B2DFDB"/>
  <text x="130" y="1036" text-anchor="middle" font-size="48" font-weight="700" fill="#2E7D32" font-family="'Zen Maru Gothic', sans-serif">O</text>

  <!-- VS circle -->
  <circle cx="540" cy="600" r="50" fill="${ORANGE}"/>
  <text x="540" y="616" text-anchor="middle" font-size="36" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">VS</text>

  <!-- Tip box with Bali decoration -->
  <rect x="70" y="1100" width="940" height="100" rx="20" fill="${WHITE}" opacity="0.92"/>
  <rect x="70" y="1100" width="6" height="100" rx="3" fill="${TURQUOISE}"/>
  <circle cx="990" cy="1118" r="8" fill="rgba(0,188,212,0.15)"/>
  <circle cx="970" cy="1143" r="5" fill="rgba(0,188,212,0.1)"/>
  <text x="100" y="1162" font-size="36" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.tip ?? "")}</text>

  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,77,64,0.85)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: Situation
// =====================================================
function buildSituationSvg(slide: SlideData): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="sitGrad" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#E0F7FA"/>
      <stop offset="40%" stop-color="#E0F2F1"/>
      <stop offset="100%" stop-color="#FFF8E1"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sitGrad)"/>
  <!-- Organic shapes -->
  <ellipse cx="950" cy="150" rx="250" ry="150" fill="rgba(0,188,212,0.05)" transform="rotate(-12 950 150)"/>
  <ellipse cx="80" cy="1100" rx="280" ry="160" fill="rgba(255,111,0,0.04)" transform="rotate(15 80 1100)"/>
  <circle cx="900" cy="600" r="35" fill="rgba(0,150,136,0.05)"/>
  <circle cx="160" cy="450" r="25" fill="rgba(0,188,212,0.06)"/>
  <!-- Scene title -->
  <rect x="50" y="50" width="980" height="100" rx="20" fill="rgba(0,77,64,0.08)"/>
  <text x="100" y="118" font-size="62" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.sceneTitle ?? "")}</text>

  <!-- Left bubble (You) -->
  <rect x="60" y="200" width="880" height="300" rx="28" fill="${WHITE}" opacity="0.92"/>
  <rect x="60" y="200" width="880" height="300" rx="28" fill="none" stroke="#B3E5FC" stroke-width="2"/>
  <rect x="90" y="225" width="80" height="40" rx="20" fill="#039BE5"/>
  <text x="130" y="253" text-anchor="middle" font-size="28" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">You</text>
  <text x="110" y="330" font-size="50" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.phraseEn1 ?? "")}</text>
  <text x="110" y="410" font-size="38" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.phraseJp1 ?? "")}</text>

  <!-- Right bubble (Staff) -->
  <rect x="140" y="540" width="880" height="300" rx="28" fill="${WHITE}" opacity="0.92"/>
  <rect x="140" y="540" width="880" height="300" rx="28" fill="none" stroke="#FFE0B2" stroke-width="2"/>
  <rect x="170" y="565" width="90" height="40" rx="20" fill="${ORANGE}"/>
  <text x="215" y="593" text-anchor="middle" font-size="28" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">Staff</text>
  <text x="190" y="670" font-size="50" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.responseEn ?? "")}</text>
  <text x="190" y="750" font-size="38" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.responseJp ?? "")}</text>

  <!-- Point box with Bali decoration -->
  <rect x="60" y="900" width="960" height="140" rx="24" fill="${WHITE}" opacity="0.92"/>
  <rect x="60" y="900" width="6" height="140" rx="3" fill="${TURQUOISE}"/>
  <circle cx="1000" cy="918" r="8" fill="rgba(0,188,212,0.15)"/>
  <circle cx="980" cy="943" r="5" fill="rgba(0,188,212,0.1)"/>
  <text x="100" y="950" font-size="34" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">Point</text>
  <text x="100" y="1005" font-size="38" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.point ?? "")}</text>

  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,77,64,0.85)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: Story (Bali experience → English phrase)
// =====================================================
function buildStorySvg(slide: SlideData): string {
  const storyTitle = escapeXml(slide.storyTitle ?? "");
  const phraseJp = escapeXml(slide.phraseJp ?? "");
  const bodyLines = wrapText(slide.storyBody ?? "", 18);
  const bodyElements = bodyLines
    .map(
      (line, i) =>
        `<text x="540" y="${380 + i * 58}" text-anchor="middle" font-size="44" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  // Wrap English phrase to max 2 lines
  const enLines = wrapText(slide.phraseEn ?? "", 32);
  const enSize = enLines.length > 1 ? 50 : 58;
  const enElements = enLines
    .map(
      (line, i) =>
        `<text x="540" y="${790 + i * 68}" text-anchor="middle" font-size="${enSize}" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");
  const enBottom = 790 + enLines.length * 68;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="storyGrad" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#FFF8E1"/>
      <stop offset="50%" stop-color="#FFE0B2"/>
      <stop offset="100%" stop-color="#FFCC80"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#storyGrad)"/>
  <!-- Organic shapes -->
  <ellipse cx="950" cy="120" rx="280" ry="160" fill="rgba(255,111,0,0.06)" transform="rotate(-15 950 120)"/>
  <ellipse cx="80" cy="1150" rx="300" ry="180" fill="rgba(255,111,0,0.05)" transform="rotate(20 80 1150)"/>
  <circle cx="900" cy="500" r="50" fill="rgba(255,111,0,0.04)"/>
  <!-- Scene badge -->
  <rect x="120" y="60" width="840" height="90" rx="45" fill="${ORANGE}"/>
  <text x="540" y="120" text-anchor="middle" font-size="52" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">${storyTitle}</text>
  <!-- Episode card (fixed height) -->
  <rect x="60" y="210" width="960" height="340" rx="28" fill="${WHITE}" opacity="0.92"/>
  <rect x="60" y="210" width="960" height="8" rx="4" fill="${ORANGE}"/>
  <text x="540" y="290" text-anchor="middle" font-size="34" font-weight="700" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">バリ島でのエピソード</text>
  ${bodyElements}
  <!-- Phrase card (fixed position) -->
  <rect x="60" y="610" width="960" height="500" rx="28" fill="${WHITE}" opacity="0.95"/>
  <rect x="60" y="610" width="6" height="500" rx="3" fill="${TURQUOISE}"/>
  <circle cx="1000" cy="630" r="8" fill="rgba(0,188,212,0.15)"/>
  <circle cx="980" cy="655" r="5" fill="rgba(0,188,212,0.1)"/>
  <rect x="120" y="640" width="320" height="56" rx="28" fill="${TURQUOISE}" opacity="0.15"/>
  <text x="280" y="678" text-anchor="middle" font-size="36" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">こう言えばOK!</text>
  ${enElements}
  <text x="540" y="${enBottom + 50}" text-anchor="middle" font-size="44" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${phraseJp}</text>
  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,77,64,0.85)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: Student Mistake (common English errors)
// =====================================================
function buildStudentMistakeSvg(slide: SlideData): string {
  const mistakeEn = escapeXml(slide.mistakeEn ?? "");
  const correctEn = escapeXml(slide.correctEn ?? "");
  const explLines = wrapText(slide.mistakeExplanation ?? "", 20);
  // Center text vertically in the 260px card (y=940 to y=1200)
  // Card center = 1070, Point label at 990, remaining space 1010-1190
  // Center of remaining = 1100
  const explStartY = 1100 - (explLines.length * 52) / 2 + 20;
  const explElements = explLines
    .map(
      (line, i) =>
        `<text x="540" y="${explStartY + i * 52}" text-anchor="middle" font-size="40" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="smGrad" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#E0F7FA"/>
      <stop offset="50%" stop-color="#B2EBF2"/>
      <stop offset="100%" stop-color="#E0F2F1"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#smGrad)"/>
  <!-- Organic shapes -->
  <ellipse cx="950" cy="130" rx="260" ry="150" fill="rgba(0,188,212,0.06)" transform="rotate(-12 950 130)"/>
  <ellipse cx="80" cy="1100" rx="280" ry="160" fill="rgba(0,150,136,0.05)" transform="rotate(18 80 1100)"/>
  <circle cx="920" cy="500" r="40" fill="rgba(0,188,212,0.04)"/>
  <!-- Header -->
  <rect x="120" y="50" width="840" height="90" rx="45" fill="${TURQUOISE}"/>
  <text x="540" y="110" text-anchor="middle" font-size="46" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">もっと自然な英語に!</text>
  <!-- Chat bubble: こう言いがち -->
  <rect x="80" y="200" width="700" height="120" rx="24" fill="${WHITE}" opacity="0.92"/>
  <rect x="80" y="200" width="700" height="6" rx="3" fill="${GRAY}"/>
  <text x="110" y="250" font-size="28" font-weight="700" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">こう言いがち...</text>
  <text x="110" y="300" font-size="48" fill="#9E9E9E" font-family="'Zen Maru Gothic', sans-serif">${mistakeEn}</text>
  <!-- Arrow -->
  <text x="540" y="390" text-anchor="middle" font-size="44" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">v</text>
  <!-- Main card: ネイティブ表現 -->
  <rect x="60" y="420" width="960" height="460" rx="28" fill="${WHITE}" opacity="0.95"/>
  <rect x="60" y="420" width="960" height="10" rx="5" fill="${TURQUOISE}"/>
  <rect x="100" y="455" width="380" height="56" rx="28" fill="rgba(0,188,212,0.12)"/>
  <text x="290" y="493" text-anchor="middle" font-size="34" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">ネイティブはこう言う!</text>
  <text x="540" y="620" text-anchor="middle" font-size="66" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${correctEn}</text>
  <!-- Usage example in card -->
  <line x1="120" y1="680" x2="960" y2="680" stroke="${TURQUOISE}" stroke-width="2" opacity="0.3"/>
  <text x="540" y="740" text-anchor="middle" font-size="38" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">自然で丁寧な表現です</text>
  <text x="540" y="810" text-anchor="middle" font-size="34" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">日常会話でそのまま使えます</text>
  <!-- Explanation card -->
  <rect x="60" y="940" width="960" height="260" rx="24" fill="${WHITE}" opacity="0.92"/>
  <rect x="60" y="940" width="960" height="8" rx="4" fill="${ORANGE}"/>
  <text x="540" y="990" text-anchor="middle" font-size="30" font-weight="700" fill="${ORANGE}" font-family="'Zen Maru Gothic', sans-serif">Point</text>
  ${explElements}
  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,77,64,0.85)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: Bali Report (on-location English usage)
// =====================================================
function buildBaliReportSvg(slide: SlideData): string {
  const locationName = escapeXml(slide.locationName ?? "");
  const phraseEn = escapeXml(slide.phraseEn ?? "");
  const phraseJp = escapeXml(slide.phraseJp ?? "");
  const tipLines = wrapText(slide.usageTip ?? "", 18);
  const tipElements = tipLines
    .map(
      (line, i) =>
        `<text x="540" y="${960 + i * 54}" text-anchor="middle" font-size="42" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="brGrad" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#00897B"/>
      <stop offset="50%" stop-color="#4DB6AC"/>
      <stop offset="100%" stop-color="#80CBC4"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#brGrad)"/>
  <!-- Organic shapes -->
  <ellipse cx="950" cy="120" rx="300" ry="180" fill="rgba(255,255,255,0.06)" transform="rotate(-15 950 120)"/>
  <ellipse cx="100" cy="1200" rx="350" ry="200" fill="rgba(255,255,255,0.05)" transform="rotate(20 100 1200)"/>
  <circle cx="900" cy="450" r="55" fill="rgba(255,255,255,0.05)"/>
  <!-- Decorative dots -->
  <circle cx="160" cy="200" r="10" fill="rgba(255,255,255,0.2)"/>
  <circle cx="920" cy="1000" r="10" fill="rgba(255,255,255,0.2)"/>
  <!-- Wave pattern -->
  <path d="M0 1200 Q270 1150 540 1200 Q810 1250 1080 1200 L1080 1350 L0 1350Z" fill="rgba(255,255,255,0.06)"/>
  <!-- Location badge -->
  <rect x="120" y="60" width="840" height="100" rx="50" fill="${WHITE}"/>
  <text x="540" y="128" text-anchor="middle" font-size="56" font-weight="700" fill="#00695C" font-family="'Zen Maru Gothic', sans-serif">${locationName}</text>
  <!-- Phrase card (fixed height) -->
  <rect x="60" y="220" width="960" height="500" rx="28" fill="${WHITE}" opacity="0.95"/>
  <rect x="60" y="220" width="960" height="8" rx="4" fill="${ORANGE}"/>
  <circle cx="1000" cy="240" r="8" fill="rgba(0,188,212,0.15)"/>
  <rect x="120" y="260" width="360" height="56" rx="28" fill="rgba(0,188,212,0.12)"/>
  <text x="300" y="298" text-anchor="middle" font-size="34" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">実際に使った英語</text>
  <!-- English phrase -->
  <text x="540" y="450" text-anchor="middle" font-size="68" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${phraseEn}</text>
  <!-- Japanese translation -->
  <text x="540" y="560" text-anchor="middle" font-size="46" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${phraseJp}</text>
  <!-- Tip card (fixed position) -->
  <rect x="60" y="790" width="960" height="300" rx="28" fill="rgba(255,255,255,0.92)"/>
  <rect x="60" y="790" width="6" height="300" rx="3" fill="${ORANGE}"/>
  <rect x="120" y="830" width="320" height="50" rx="25" fill="${ORANGE}" opacity="0.15"/>
  <text x="280" y="864" text-anchor="middle" font-size="32" font-weight="700" fill="${ORANGE}" font-family="'Zen Maru Gothic', sans-serif">使い方ポイント</text>
  ${tipElements}
  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,77,64,0.85)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// Slide SVG Router
// =====================================================
function buildSlideSvg(
  slide: SlideData,
  contentType: string,
  total: number,
): string {
  switch (contentType) {
    case "list":
      return buildListSlideSvg(slide, total);
    case "quiz":
      return slide.questionJp
        ? buildQuizQuestionSvg(slide)
        : buildQuizAnswerSvg(slide);
    case "before_after":
      return buildBeforeAfterSvg(slide);
    case "situation":
      return buildSituationSvg(slide);
    case "story":
      return buildStorySvg(slide);
    case "student_mistake":
      return buildStudentMistakeSvg(slide);
    case "bali_report":
      return buildBaliReportSvg(slide);
    default:
      return buildListSlideSvg(slide, total);
  }
}

// =====================================================
// Main Export
// =====================================================

/**
 * Generate all slide images for a carousel post.
 * Returns an array of PNG Uint8Arrays.
 * Uses SVG template strings + @cf-wasm/resvg (no dynamic WASM compilation).
 */
export async function generateSlideImages(
  content: ContentItem,
): Promise<Uint8Array[]> {
  const images: Uint8Array[] = [];
  const contentSlides = content.slides.filter((s) => s.slideType === "content");

  // 1. Cover
  const coverSvg = buildCoverSvg(content.title, content.subtitle);
  images.push(await renderSvgToPng(coverSvg));

  // 2-6. Content pages
  for (const slide of contentSlides) {
    const svg = buildSlideSvg(slide, content.type, contentSlides.length);
    images.push(await renderSvgToPng(svg));
  }

  // 7. CTA
  const ctaSlide = content.slides.find((s) => s.slideType === "cta");
  const ctaSvg = buildCTASvg(
    ctaSlide?.leadMagnet ?? "無料フレーズ集をプレゼント",
  );
  images.push(await renderSvgToPng(ctaSvg));

  return images;
}
