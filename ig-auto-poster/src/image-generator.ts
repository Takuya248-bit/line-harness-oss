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

// Google Fonts CSS API
const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap";

// Hardcoded fallback URLs for Noto Sans JP (CJK range)
const FONT_REGULAR_URL =
  "https://fonts.gstatic.com/s/notosansjp/v53/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFJEk757Y0rw_qMHVdbR2L8Y9QTJ1LwkRmR5GprQAe-TY.0.woff2";
const FONT_BOLD_URL =
  "https://fonts.gstatic.com/s/notosansjp/v53/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEk757Y0rw_qMHVdbR2L8Y9QTJ1LwkRmR5GprQAe-TY.0.woff2";

async function fetchFontFromCSS(weight: "400" | "700"): Promise<ArrayBuffer> {
  const cssRes = await fetch(FONT_CSS_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  const css = await cssRes.text();

  // Extract URL for requested weight covering Japanese characters (U+4E00 range)
  const regex = new RegExp(
    `@font-face\\s*\\{[^}]*font-weight:\\s*${weight}[^}]*src:\\s*url\\(([^)]+)\\)[^}]*unicode-range:[^}]*U\\+4E00`,
    "s",
  );
  const match = css.match(regex);
  if (match?.[1]) {
    const res = await fetch(match[1]);
    return res.arrayBuffer();
  }

  // Fallback
  const fallbackUrl = weight === "700" ? FONT_BOLD_URL : FONT_REGULAR_URL;
  const res = await fetch(fallbackUrl);
  return res.arrayBuffer();
}

async function ensureFonts(): Promise<void> {
  if (fontRegularData && fontBoldData) return;

  const [regular, bold] = await Promise.all([
    fetchFontFromCSS("400"),
    fetchFontFromCSS("700"),
  ]);
  fontRegularData = new Uint8Array(regular);
  fontBoldData = new Uint8Array(bold);
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
  const titleY = 540 - (titleLines.length - 1) * 45;
  const titleElements = titleLines
    .map(
      (line, i) =>
        `<text x="540" y="${titleY + i * 90}" text-anchor="middle" font-size="72" font-weight="700" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="1" x2="0" y2="0.7">
      <stop offset="0%" stop-color="${BG_LIGHT}"/>
      <stop offset="100%" stop-color="${WHITE}"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${WHITE}"/>
  <rect y="950" width="${WIDTH}" height="400" fill="url(#bgGrad)"/>
  <!-- Badge -->
  <rect x="420" y="360" width="240" height="52" rx="26" fill="${ORANGE}"/>
  <text x="540" y="394" text-anchor="middle" font-size="28" font-weight="700" fill="${WHITE}" font-family="'Noto Sans JP', sans-serif">保存必須</text>
  <!-- Title -->
  ${titleElements}
  <!-- Subtitle -->
  <text x="540" y="${titleY + titleLines.length * 90 + 50}" text-anchor="middle" font-size="36" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(subtitle)}</text>
  <!-- Swipe prompt -->
  <text x="540" y="${titleY + titleLines.length * 90 + 150}" text-anchor="middle" font-size="32" font-weight="700" fill="${TURQUOISE}" font-family="'Noto Sans JP', sans-serif">→ スワイプで全部見る</text>
  <!-- Logo -->
  <text x="1030" y="1310" text-anchor="end" font-size="24" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">Barilingual</text>
</svg>`;
}

// =====================================================
// SVG Template: CTA
// =====================================================
function buildCTASvg(leadMagnet: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00897B"/>
      <stop offset="50%" stop-color="${TURQUOISE}"/>
      <stop offset="100%" stop-color="#4DD0E1"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#ctaGrad)"/>
  <!-- Heading -->
  <text x="540" y="380" text-anchor="middle" font-size="56" font-weight="700" fill="${WHITE}" font-family="'Noto Sans JP', sans-serif">もっと学びたい方へ</text>
  <!-- White box -->
  <rect x="90" y="460" width="900" height="280" rx="30" fill="${WHITE}"/>
  <text x="540" y="575" text-anchor="middle" font-size="42" font-weight="700" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">LINE登録で</text>
  <text x="540" y="635" text-anchor="middle" font-size="42" font-weight="700" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(leadMagnet)}</text>
  <!-- Arrow prompt -->
  <text x="540" y="840" text-anchor="middle" font-size="32" fill="${WHITE}" font-family="'Noto Sans JP', sans-serif">プロフィールのリンクから →</text>
  <!-- Handle -->
  <text x="540" y="910" text-anchor="middle" font-size="28" fill="rgba(255,255,255,0.8)" font-family="'Noto Sans JP', sans-serif">@barilingual</text>
</svg>`;
}

// =====================================================
// SVG Template: List Slide
// =====================================================
function buildListSlideSvg(slide: SlideData, total: number): string {
  const pageLabel = `${slide.slideNumber - 1}/${total}`;
  const phraseEn = escapeXml(slide.phraseEn ?? "");
  const phraseJp = escapeXml(slide.phraseJp ?? "");
  const exampleEn = escapeXml(slide.exampleEn ?? "");
  const exampleJp = escapeXml(slide.exampleJp ?? "");

  // Wrap long English phrases
  const phraseLines = wrapText(slide.phraseEn ?? "", 22);
  const phraseElements = phraseLines
    .map(
      (line, i) =>
        `<text x="80" y="${280 + i * 76}" font-size="64" font-weight="700" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");
  const phraseBottom = 280 + phraseLines.length * 76;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${WHITE}"/>
  <!-- Page badge -->
  <circle cx="120" cy="120" r="40" fill="${TURQUOISE}"/>
  <text x="120" y="132" text-anchor="middle" font-size="28" font-weight="700" fill="${WHITE}" font-family="'Noto Sans JP', sans-serif">${escapeXml(pageLabel)}</text>
  <!-- English phrase -->
  ${phraseElements}
  <!-- Japanese -->
  <text x="80" y="${phraseBottom + 50}" font-size="38" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">${phraseJp}</text>
  <!-- Divider -->
  <line x1="80" y1="${phraseBottom + 110}" x2="1000" y2="${phraseBottom + 110}" stroke="#E0E0E0" stroke-width="2"/>
  <!-- Example label -->
  <text x="80" y="${phraseBottom + 170}" font-size="28" font-weight="700" fill="${TURQUOISE}" font-family="'Noto Sans JP', sans-serif">Example</text>
  <!-- Example EN -->
  <text x="80" y="${phraseBottom + 225}" font-size="36" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${exampleEn}</text>
  <!-- Example JP -->
  <text x="80" y="${phraseBottom + 280}" font-size="30" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">${exampleJp}</text>
  <!-- Logo -->
  <text x="1030" y="1310" text-anchor="end" font-size="24" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">Barilingual</text>
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
        `<text x="80" y="${330 + i * 65}" font-size="48" font-weight="700" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");
  const qBottom = 330 + questionLines.length * 65;

  const optionElements = options
    .map(
      (opt, i) =>
        `<rect x="80" y="${qBottom + 40 + i * 100}" width="920" height="80" rx="16" fill="${LIGHT_GRAY}"/>
    <text x="120" y="${qBottom + 92 + i * 100}" font-size="36" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(opt.label)}. ${escapeXml(opt.text)}</text>`,
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${WHITE}"/>
  <!-- Orange header -->
  <rect width="${WIDTH}" height="200" fill="${ORANGE}"/>
  <text x="540" y="130" text-anchor="middle" font-size="96" font-weight="700" fill="${WHITE}" font-family="'Noto Sans JP', sans-serif">Q.</text>
  <!-- Question -->
  ${questionElements}
  <!-- Options -->
  ${optionElements}
  <!-- Swipe prompt -->
  <text x="540" y="1200" text-anchor="middle" font-size="30" font-weight="700" fill="${TURQUOISE}" font-family="'Noto Sans JP', sans-serif">→ スワイプで答え合わせ</text>
  <!-- Logo -->
  <text x="1030" y="1310" text-anchor="end" font-size="24" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">Barilingual</text>
</svg>`;
}

// =====================================================
// SVG Template: Quiz Answer
// =====================================================
function buildQuizAnswerSvg(slide: SlideData): string {
  const explanationLines = wrapText(slide.explanation ?? "", 28);
  const explanationElements = explanationLines
    .map(
      (line, i) =>
        `<text x="120" y="${930 + i * 45}" font-size="32" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${WHITE}"/>
  <!-- Turquoise header -->
  <rect width="${WIDTH}" height="200" fill="${TURQUOISE}"/>
  <text x="540" y="130" text-anchor="middle" font-size="96" font-weight="700" fill="${WHITE}" font-family="'Noto Sans JP', sans-serif">A.</text>
  <!-- Correct label -->
  <text x="80" y="310" font-size="36" font-weight="700" fill="${ORANGE}" font-family="'Noto Sans JP', sans-serif">正解は ${escapeXml(slide.correctOption ?? "")}</text>
  <!-- Answer EN -->
  <text x="80" y="400" font-size="56" font-weight="700" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.answerEn ?? "")}</text>
  <!-- Answer JP -->
  <text x="80" y="470" font-size="36" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.answerJp ?? "")}</text>
  <!-- Divider -->
  <line x1="80" y1="540" x2="1000" y2="540" stroke="#E0E0E0" stroke-width="2"/>
  <!-- Explanation box -->
  <rect x="80" y="580" width="920" height="${60 + explanationLines.length * 45}" rx="20" fill="${BG_LIGHT}"/>
  ${explanationElements}
  <!-- Logo -->
  <text x="1030" y="1310" text-anchor="end" font-size="24" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">Barilingual</text>
</svg>`;
}

// =====================================================
// SVG Template: Before/After
// =====================================================
function buildBeforeAfterSvg(slide: SlideData): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <!-- Before (top half) -->
  <rect width="${WIDTH}" height="675" fill="${LIGHT_GRAY}"/>
  <!-- Before label -->
  <rect x="80" y="80" width="150" height="40" rx="20" fill="#FFCDD2"/>
  <text x="155" y="108" text-anchor="middle" font-size="24" font-weight="700" fill="#C62828" font-family="'Noto Sans JP', sans-serif">日本人英語</text>
  <!-- Before EN -->
  <text x="80" y="210" font-size="48" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.beforeEn ?? "")}</text>
  <!-- Before JP -->
  <text x="80" y="280" font-size="30" fill="#9E9E9E" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.beforeJp ?? "")}</text>
  <!-- X mark -->
  <text x="80" y="350" font-size="40" fill="#E53935" font-family="'Noto Sans JP', sans-serif">X</text>

  <!-- After (bottom half) -->
  <rect y="675" width="${WIDTH}" height="675" fill="${MINT}"/>
  <!-- After label -->
  <rect x="80" y="755" width="170" height="40" rx="20" fill="#B2DFDB"/>
  <text x="165" y="783" text-anchor="middle" font-size="24" font-weight="700" fill="#00695C" font-family="'Noto Sans JP', sans-serif">ネイティブ英語</text>
  <!-- After EN -->
  <text x="80" y="885" font-size="48" font-weight="700" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.afterEn ?? "")}</text>
  <!-- After JP -->
  <text x="80" y="955" font-size="30" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.afterJp ?? "")}</text>
  <!-- O mark -->
  <text x="80" y="1025" font-size="40" fill="#2E7D32" font-family="'Noto Sans JP', sans-serif">O</text>

  <!-- VS circle -->
  <circle cx="540" cy="675" r="40" fill="${ORANGE}"/>
  <text x="540" y="687" text-anchor="middle" font-size="28" font-weight="700" fill="${WHITE}" font-family="'Noto Sans JP', sans-serif">VS</text>

  <!-- Tip box -->
  <rect x="80" y="1170" width="920" height="80" rx="16" fill="rgba(255,255,255,0.9)"/>
  <text x="110" y="1220" font-size="26" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.tip ?? "")}</text>

  <!-- Logo -->
  <text x="1030" y="1310" text-anchor="end" font-size="24" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">Barilingual</text>
</svg>`;
}

// =====================================================
// SVG Template: Situation
// =====================================================
function buildSituationSvg(slide: SlideData): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="sitGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#E3F2FD"/>
      <stop offset="50%" stop-color="#FFF3E0"/>
      <stop offset="100%" stop-color="#E8F5E9"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sitGrad)"/>
  <!-- White overlay -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="rgba(255,255,255,0.75)"/>
  <!-- Scene title -->
  <text x="80" y="130" font-size="52" font-weight="700" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.sceneTitle ?? "")}</text>

  <!-- Left bubble (You) -->
  <rect x="80" y="220" width="800" height="240" rx="20" fill="#E3F2FD"/>
  <text x="110" y="265" font-size="24" font-weight="700" fill="#1565C0" font-family="'Noto Sans JP', sans-serif">You</text>
  <text x="110" y="320" font-size="36" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.phraseEn1 ?? "")}</text>
  <text x="110" y="370" font-size="28" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.phraseJp1 ?? "")}</text>

  <!-- Right bubble (Staff) -->
  <rect x="200" y="500" width="800" height="240" rx="20" fill="#FFF3E0"/>
  <text x="230" y="545" font-size="24" font-weight="700" fill="#E65100" font-family="'Noto Sans JP', sans-serif">Staff</text>
  <text x="230" y="600" font-size="36" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.responseEn ?? "")}</text>
  <text x="230" y="650" font-size="28" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">${escapeXml(slide.responseJp ?? "")}</text>

  <!-- Point box -->
  <rect x="80" y="800" width="920" height="100" rx="16" fill="rgba(255,255,255,0.9)"/>
  <line x1="80" y1="800" x2="80" y2="900" stroke="${TURQUOISE}" stroke-width="4"/>
  <text x="110" y="862" font-size="28" fill="${NAVY}" font-family="'Noto Sans JP', sans-serif">Point: ${escapeXml(slide.point ?? "")}</text>

  <!-- Logo -->
  <text x="1030" y="1310" text-anchor="end" font-size="24" fill="${GRAY}" font-family="'Noto Sans JP', sans-serif">Barilingual</text>
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
