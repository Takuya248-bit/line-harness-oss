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
function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (text.length <= maxCharsPerLine) return [text];
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
  <ellipse cx="950" cy="180" rx="280" ry="160" fill="rgba(255,255,255,0.04)" transform="rotate(-15 950 180)"/>
  <ellipse cx="100" cy="1100" rx="300" ry="180" fill="rgba(255,255,255,0.04)" transform="rotate(20 100 1100)"/>
  <circle cx="880" cy="400" r="50" fill="rgba(255,255,255,0.06)"/>
  <circle cx="200" cy="850" r="40" fill="rgba(255,255,255,0.06)"/>
  <!-- Decorative dots -->
  <circle cx="160" cy="250" r="10" fill="rgba(255,255,255,0.2)"/>
  <circle cx="200" cy="290" r="6" fill="rgba(255,255,255,0.15)"/>
  <circle cx="920" cy="950" r="10" fill="rgba(255,255,255,0.2)"/>
  <circle cx="880" cy="990" r="6" fill="rgba(255,255,255,0.15)"/>
  <!-- Wave pattern -->
  <path d="M0 1180 Q270 1130 540 1180 Q810 1230 1080 1180 L1080 1350 L0 1350Z" fill="rgba(255,255,255,0.06)"/>
  <path d="M0 1220 Q270 1170 540 1220 Q810 1270 1080 1220 L1080 1350 L0 1350Z" fill="rgba(255,255,255,0.04)"/>
  <!-- Heading -->
  <text x="540" y="300" text-anchor="middle" font-size="56" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">もっと学びたい方へ</text>
  <!-- White box -->
  <rect x="90" y="380" width="900" height="340" rx="30" fill="${WHITE}"/>
  <text x="540" y="480" text-anchor="middle" font-size="44" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">LINE登録で</text>
  <text x="540" y="550" text-anchor="middle" font-size="40" font-weight="700" fill="${ORANGE}" font-family="'Zen Maru Gothic', sans-serif">レベル別英語学習ロードマップ</text>
  <text x="540" y="610" text-anchor="middle" font-size="40" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">を無料プレゼント!</text>
  <!-- Engagement CTA -->
  <rect x="180" y="790" width="720" height="80" rx="40" fill="${ORANGE}"/>
  <text x="540" y="843" text-anchor="middle" font-size="38" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">好きな英単語をコメントしてね!</text>
  <!-- Arrow prompt -->
  <text x="540" y="960" text-anchor="middle" font-size="34" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">プロフィールのリンクから</text>
  <!-- Handle -->
  <text x="540" y="1020" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.85)" font-family="'Zen Maru Gothic', sans-serif">@barilingual</text>
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
  const phraseLines = wrapText(slide.phraseEn ?? "", 22);
  const phraseElements = phraseLines
    .map(
      (line, i) =>
        `<text x="130" y="${340 + i * 76}" font-size="64" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");
  const phraseBottom = 340 + phraseLines.length * 76;

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
  <rect x="50" y="200" width="980" height="${phraseBottom + 340 - 200}" rx="30" fill="${WHITE}" opacity="0.92"/>
  <!-- Page badge -->
  <circle cx="120" cy="120" r="44" fill="${TURQUOISE}"/>
  <text x="120" y="134" text-anchor="middle" font-size="30" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(pageLabel)}</text>
  <!-- English phrase -->
  ${phraseElements}
  <!-- Japanese -->
  <text x="130" y="${phraseBottom + 50}" font-size="38" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${phraseJp}</text>
  <!-- Divider -->
  <line x1="130" y1="${phraseBottom + 110}" x2="950" y2="${phraseBottom + 110}" stroke="${TURQUOISE}" stroke-width="3" opacity="0.4"/>
  <!-- Example label -->
  <rect x="130" y="${phraseBottom + 140}" width="150" height="42" rx="21" fill="${TURQUOISE}" opacity="0.15"/>
  <text x="205" y="${phraseBottom + 170}" text-anchor="middle" font-size="28" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">Example</text>
  <!-- Example EN -->
  <text x="130" y="${phraseBottom + 230}" font-size="38" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${exampleEn}</text>
  <!-- Example JP -->
  <text x="130" y="${phraseBottom + 290}" font-size="32" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${exampleJp}</text>
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

  const questionLines = wrapText(slide.questionJp ?? "", 18);
  const questionElements = questionLines
    .map(
      (line, i) =>
        `<text x="100" y="${350 + i * 68}" font-size="50" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");
  const qBottom = 350 + questionLines.length * 68;

  const optionElements = options
    .map(
      (opt, i) =>
        `<rect x="80" y="${qBottom + 50 + i * 110}" width="920" height="88" rx="20" fill="${WHITE}" stroke="#E0E0E0" stroke-width="2"/>
    <circle cx="140" cy="${qBottom + 94 + i * 110}" r="22" fill="${TURQUOISE}" opacity="0.15"/>
    <text x="140" y="${qBottom + 102 + i * 110}" text-anchor="middle" font-size="28" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(opt.label)}</text>
    <text x="185" y="${qBottom + 104 + i * 110}" font-size="38" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(opt.text)}</text>`,
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
  <rect width="${WIDTH}" height="220" rx="0" fill="${ORANGE}"/>
  <path d="M0 200 Q270 240 540 200 Q810 160 1080 200 L1080 220 L0 220Z" fill="${ORANGE}"/>
  <text x="540" y="140" text-anchor="middle" font-size="100" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">Q.</text>
  <!-- Question -->
  ${questionElements}
  <!-- Options -->
  ${optionElements}
  <!-- Swipe prompt -->
  <rect x="280" y="1140" width="520" height="60" rx="30" fill="rgba(0,188,212,0.12)"/>
  <text x="540" y="1180" text-anchor="middle" font-size="32" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">スワイプで答え合わせ</text>
  <!-- Bottom bar -->
  <rect x="0" y="1268" width="${WIDTH}" height="82" fill="rgba(0,77,64,0.85)"/>
  <text x="540" y="1320" text-anchor="middle" font-size="30" fill="rgba(255,255,255,0.9)" font-family="'Zen Maru Gothic', sans-serif">Barilingual | バリ島で英語を学ぼう</text>
</svg>`;
}

// =====================================================
// SVG Template: Quiz Answer
// =====================================================
function buildQuizAnswerSvg(slide: SlideData): string {
  const explanationLines = wrapText(slide.explanation ?? "", 26);
  const expBoxY = 620;
  const expBoxH = 80 + explanationLines.length * 48;
  const explanationElements = explanationLines
    .map(
      (line, i) =>
        `<text x="130" y="${expBoxY + 55 + i * 48}" font-size="34" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(line)}</text>`,
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
  <rect width="${WIDTH}" height="220" fill="${TURQUOISE}"/>
  <path d="M0 200 Q270 240 540 200 Q810 160 1080 200 L1080 220 L0 220Z" fill="${TURQUOISE}"/>
  <text x="540" y="140" text-anchor="middle" font-size="100" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">A.</text>
  <!-- Correct label -->
  <rect x="80" y="270" width="320" height="56" rx="28" fill="${ORANGE}"/>
  <text x="240" y="308" text-anchor="middle" font-size="36" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">正解は ${escapeXml(slide.correctOption ?? "")}</text>
  <!-- Answer EN -->
  <text x="80" y="420" font-size="58" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.answerEn ?? "")}</text>
  <!-- Answer JP -->
  <text x="80" y="500" font-size="38" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.answerJp ?? "")}</text>
  <!-- Divider -->
  <line x1="80" y1="560" x2="1000" y2="560" stroke="${TURQUOISE}" stroke-width="3" opacity="0.4"/>
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
  <rect width="${WIDTH}" height="620" fill="url(#baBeforeGrad)"/>
  <!-- Organic shapes before -->
  <ellipse cx="950" cy="100" rx="200" ry="120" fill="rgba(229,57,53,0.04)" transform="rotate(-10 950 100)"/>
  <circle cx="920" cy="400" r="30" fill="rgba(229,57,53,0.05)"/>
  <!-- Before label -->
  <rect x="80" y="80" width="180" height="48" rx="24" fill="#FFCDD2"/>
  <text x="170" y="112" text-anchor="middle" font-size="28" font-weight="700" fill="#C62828" font-family="'Zen Maru Gothic', sans-serif">日本人英語</text>
  <!-- Before EN -->
  <text x="80" y="230" font-size="52" fill="#616161" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.beforeEn ?? "")}</text>
  <!-- Before JP -->
  <text x="80" y="310" font-size="34" fill="#9E9E9E" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.beforeJp ?? "")}</text>
  <!-- X mark -->
  <circle cx="120" cy="400" r="32" fill="#FFCDD2"/>
  <text x="120" y="414" text-anchor="middle" font-size="40" font-weight="700" fill="#E53935" font-family="'Zen Maru Gothic', sans-serif">X</text>

  <!-- After (bottom half) -->
  <rect y="620" width="${WIDTH}" height="648" fill="url(#baAfterGrad)"/>
  <!-- Organic shapes after -->
  <ellipse cx="100" cy="1100" rx="220" ry="130" fill="rgba(0,150,136,0.05)" transform="rotate(15 100 1100)"/>
  <circle cx="180" cy="800" r="25" fill="rgba(0,188,212,0.06)"/>
  <!-- After label -->
  <rect x="80" y="690" width="200" height="48" rx="24" fill="#B2DFDB"/>
  <text x="180" y="722" text-anchor="middle" font-size="28" font-weight="700" fill="#00695C" font-family="'Zen Maru Gothic', sans-serif">ネイティブ英語</text>
  <!-- After EN -->
  <text x="80" y="845" font-size="52" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.afterEn ?? "")}</text>
  <!-- After JP -->
  <text x="80" y="925" font-size="34" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.afterJp ?? "")}</text>
  <!-- O mark -->
  <circle cx="120" cy="1010" r="32" fill="#B2DFDB"/>
  <text x="120" y="1024" text-anchor="middle" font-size="40" font-weight="700" fill="#2E7D32" font-family="'Zen Maru Gothic', sans-serif">O</text>

  <!-- VS circle -->
  <circle cx="540" cy="620" r="44" fill="${ORANGE}"/>
  <text x="540" y="634" text-anchor="middle" font-size="30" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">VS</text>

  <!-- Tip box with Bali decoration -->
  <rect x="80" y="1100" width="920" height="86" rx="20" fill="${WHITE}" opacity="0.92"/>
  <rect x="80" y="1100" width="6" height="86" rx="3" fill="${TURQUOISE}"/>
  <circle cx="980" cy="1115" r="8" fill="rgba(0,188,212,0.15)"/>
  <circle cx="960" cy="1140" r="5" fill="rgba(0,188,212,0.1)"/>
  <text x="110" y="1152" font-size="30" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.tip ?? "")}</text>

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
  <!-- Decorative dots -->
  <circle cx="950" cy="400" r="8" fill="rgba(0,188,212,0.12)"/>
  <circle cx="930" cy="430" r="5" fill="rgba(0,188,212,0.08)"/>
  <!-- Scene title -->
  <rect x="60" y="60" width="${920}" height="80" rx="16" fill="rgba(0,77,64,0.08)"/>
  <text x="100" y="115" font-size="52" font-weight="700" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.sceneTitle ?? "")}</text>

  <!-- Left bubble (You) -->
  <rect x="80" y="200" width="820" height="250" rx="24" fill="${WHITE}" opacity="0.92"/>
  <rect x="80" y="200" width="820" height="250" rx="24" fill="none" stroke="#B3E5FC" stroke-width="2"/>
  <rect x="100" y="220" width="60" height="32" rx="16" fill="#039BE5"/>
  <text x="130" y="244" text-anchor="middle" font-size="22" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">You</text>
  <text x="120" y="310" font-size="40" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.phraseEn1 ?? "")}</text>
  <text x="120" y="370" font-size="30" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.phraseJp1 ?? "")}</text>

  <!-- Right bubble (Staff) -->
  <rect x="180" y="490" width="820" height="250" rx="24" fill="${WHITE}" opacity="0.92"/>
  <rect x="180" y="490" width="820" height="250" rx="24" fill="none" stroke="#FFE0B2" stroke-width="2"/>
  <rect x="200" y="510" width="70" height="32" rx="16" fill="${ORANGE}"/>
  <text x="235" y="534" text-anchor="middle" font-size="22" font-weight="700" fill="${WHITE}" font-family="'Zen Maru Gothic', sans-serif">Staff</text>
  <text x="220" y="600" font-size="40" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.responseEn ?? "")}</text>
  <text x="220" y="660" font-size="30" fill="${GRAY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.responseJp ?? "")}</text>

  <!-- Point box with Bali decoration -->
  <rect x="80" y="800" width="920" height="110" rx="20" fill="${WHITE}" opacity="0.92"/>
  <rect x="80" y="800" width="6" height="110" rx="3" fill="${TURQUOISE}"/>
  <circle cx="980" cy="815" r="8" fill="rgba(0,188,212,0.15)"/>
  <circle cx="960" cy="840" r="5" fill="rgba(0,188,212,0.1)"/>
  <text x="110" y="845" font-size="28" font-weight="700" fill="${TURQUOISE}" font-family="'Zen Maru Gothic', sans-serif">Point</text>
  <text x="110" y="885" font-size="30" fill="${NAVY}" font-family="'Zen Maru Gothic', sans-serif">${escapeXml(slide.point ?? "")}</text>

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
