import satori from "satori";
import { Resvg, initWasm, type InitInput } from "@resvg/resvg-wasm";
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
let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;
let wasmInitialized = false;

const FONT_REGULAR_URL =
  "https://fonts.gstatic.com/s/notosansjp/v53/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFJEk757Y0rw_qMHVdbR2L8Y9QTJ1LwkRmR5GprQAe-TY.0.woff2";
const FONT_BOLD_URL =
  "https://fonts.gstatic.com/s/notosansjp/v53/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEk757Y0rw_qMHVdbR2L8Y9QTJ1LwkRmR5GprQAe-TY.0.woff2";

// Google Fonts CSS API to get actual font file URLs
const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap";

async function fetchFontFromCSS(weight: "400" | "700"): Promise<ArrayBuffer> {
  // Fetch CSS to get actual font URL
  const cssRes = await fetch(FONT_CSS_URL, {
    headers: {
      // Need to send a browser-like user-agent to get woff2 URLs
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  const css = await cssRes.text();

  // Extract the URL for the requested weight that covers Japanese characters
  // The CSS contains multiple @font-face blocks for different unicode ranges
  const regex = new RegExp(
    `@font-face\\s*\\{[^}]*font-weight:\\s*${weight}[^}]*src:\\s*url\\(([^)]+)\\)[^}]*unicode-range:[^}]*U\\+4E00`,
    "s",
  );
  const match = css.match(regex);
  if (match?.[1]) {
    const res = await fetch(match[1]);
    return res.arrayBuffer();
  }

  // Fallback: use hardcoded URLs
  const fallbackUrl = weight === "700" ? FONT_BOLD_URL : FONT_REGULAR_URL;
  const res = await fetch(fallbackUrl);
  return res.arrayBuffer();
}

async function ensureFonts(): Promise<void> {
  if (fontRegular && fontBold) return;

  const [regular, bold] = await Promise.all([
    fetchFontFromCSS("400"),
    fetchFontFromCSS("700"),
  ]);
  fontRegular = regular;
  fontBold = bold;
}

async function ensureWasm(): Promise<void> {
  if (wasmInitialized) return;
  // For Cloudflare Workers, fetch the wasm binary from the package
  // The wrangler bundler will handle the .wasm import via compatibility flags
  try {
    // @ts-expect-error: .wasm module import handled by wrangler bundler
    const wasmModule = await import("@resvg/resvg-wasm/index_bg.wasm");
    await initWasm(wasmModule.default as InitInput);
  } catch {
    // Fallback: fetch from CDN if direct import fails
    const wasmUrl = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
    const wasmResponse = await fetch(wasmUrl);
    await initWasm(wasmResponse as unknown as InitInput);
  }
  wasmInitialized = true;
}

function getFonts(): Array<{
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
}> {
  return [
    { name: "Noto Sans JP", data: fontRegular!, weight: 400, style: "normal" as const },
    { name: "Noto Sans JP", data: fontBold!, weight: 700, style: "normal" as const },
  ];
}

// --- Helper: Satori JSX-like object creation ---
type SatoriNode =
  | string
  | number
  | {
      type: string;
      props: {
        style?: Record<string, unknown>;
        children?: SatoriNode | SatoriNode[];
        [key: string]: unknown;
      };
    };

function h(
  type: string,
  style: Record<string, unknown>,
  ...children: SatoriNode[]
): SatoriNode {
  return {
    type,
    props: {
      style,
      children: children.length === 1 ? children[0] : children,
    },
  };
}

// --- Render Pipeline ---
async function renderToImage(element: SatoriNode): Promise<Uint8Array> {
  await ensureFonts();
  await ensureWasm();

  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts: getFonts(),
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width" as const, value: WIDTH },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}

// =====================================================
// Template: Cover (shared)
// =====================================================
function buildCover(title: string, subtitle: string): SatoriNode {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      backgroundColor: WHITE,
      fontFamily: "Noto Sans JP",
      position: "relative",
    },
    // Gradient background at bottom
    h("div", {
      display: "flex",
      position: "absolute",
      bottom: "0",
      left: "0",
      right: "0",
      height: "400px",
      background: `linear-gradient(to top, ${BG_LIGHT}, ${WHITE})`,
    }),
    // Main content
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: "80px",
        zIndex: 1,
      },
      // "保存必須" badge
      h(
        "div",
        {
          display: "flex",
          backgroundColor: ORANGE,
          color: WHITE,
          fontSize: "28px",
          fontWeight: 700,
          padding: "12px 32px",
          borderRadius: "30px",
          marginBottom: "60px",
        },
        "保存必須",
      ),
      // Title
      h(
        "div",
        {
          display: "flex",
          fontSize: "72px",
          fontWeight: 700,
          color: NAVY,
          textAlign: "center",
          lineHeight: 1.3,
          marginBottom: "30px",
          flexDirection: "column",
          alignItems: "center",
        },
        ...title.split("\n").map((line) =>
          h("div", { display: "flex" }, line),
        ),
      ),
      // Subtitle
      h(
        "div",
        {
          display: "flex",
          fontSize: "36px",
          color: GRAY,
          marginBottom: "80px",
        },
        subtitle,
      ),
      // Swipe prompt
      h(
        "div",
        {
          display: "flex",
          fontSize: "32px",
          color: TURQUOISE,
          fontWeight: 700,
        },
        "→ スワイプで全部見る",
      ),
    ),
    // Barilingual logo
    h(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: "40px",
        right: "50px",
        fontSize: "24px",
        color: GRAY,
      },
      "Barilingual",
    ),
  );
}

// =====================================================
// Template: CTA (shared)
// =====================================================
function buildCTA(leadMagnet: string): SatoriNode {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      background: `linear-gradient(135deg, #00897B, ${TURQUOISE}, #4DD0E1)`,
      fontFamily: "Noto Sans JP",
      alignItems: "center",
      justifyContent: "center",
      padding: "80px",
    },
    // Heading
    h(
      "div",
      {
        display: "flex",
        fontSize: "56px",
        fontWeight: 700,
        color: WHITE,
        marginBottom: "60px",
      },
      "もっと学びたい方へ",
    ),
    // White box
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        backgroundColor: WHITE,
        borderRadius: "30px",
        padding: "60px 50px",
        alignItems: "center",
        marginBottom: "50px",
        width: "100%",
        maxWidth: "900px",
      },
      h(
        "div",
        {
          display: "flex",
          fontSize: "42px",
          fontWeight: 700,
          color: NAVY,
          textAlign: "center",
          lineHeight: 1.5,
          flexDirection: "column",
          alignItems: "center",
        },
        h("div", { display: "flex" }, "LINE登録で"),
        h("div", { display: "flex" }, leadMagnet),
      ),
    ),
    // Arrow prompt
    h(
      "div",
      {
        display: "flex",
        fontSize: "32px",
        color: WHITE,
        marginBottom: "40px",
      },
      "プロフィールのリンクから →",
    ),
    // Handle
    h(
      "div",
      {
        display: "flex",
        fontSize: "28px",
        color: "rgba(255,255,255,0.8)",
      },
      "@barilingual",
    ),
  );
}

// =====================================================
// Template: List Type (content pages)
// =====================================================
function buildListSlide(
  slide: SlideData,
  total: number,
): SatoriNode {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      backgroundColor: WHITE,
      fontFamily: "Noto Sans JP",
      padding: "80px",
      position: "relative",
    },
    // Page number badge
    h(
      "div",
      {
        display: "flex",
        backgroundColor: TURQUOISE,
        color: WHITE,
        width: "80px",
        height: "80px",
        borderRadius: "40px",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "32px",
        fontWeight: 700,
        marginBottom: "60px",
      },
      `${slide.slideNumber - 1}/${total}`,
    ),
    // English phrase
    h(
      "div",
      {
        display: "flex",
        fontSize: "64px",
        fontWeight: 700,
        color: NAVY,
        marginBottom: "20px",
        lineHeight: 1.3,
      },
      slide.phraseEn ?? "",
    ),
    // Japanese translation
    h(
      "div",
      {
        display: "flex",
        fontSize: "38px",
        color: GRAY,
        marginBottom: "60px",
      },
      slide.phraseJp ?? "",
    ),
    // Divider
    h("div", {
      display: "flex",
      width: "100%",
      height: "2px",
      backgroundColor: "#E0E0E0",
      marginBottom: "60px",
    }),
    // Example label
    h(
      "div",
      {
        display: "flex",
        fontSize: "28px",
        color: TURQUOISE,
        fontWeight: 700,
        marginBottom: "20px",
      },
      "Example",
    ),
    // Example English
    h(
      "div",
      {
        display: "flex",
        fontSize: "36px",
        color: NAVY,
        marginBottom: "16px",
        lineHeight: 1.4,
      },
      slide.exampleEn ?? "",
    ),
    // Example Japanese
    h(
      "div",
      {
        display: "flex",
        fontSize: "30px",
        color: GRAY,
        lineHeight: 1.4,
      },
      slide.exampleJp ?? "",
    ),
    // Barilingual
    h(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: "40px",
        right: "50px",
        fontSize: "24px",
        color: GRAY,
      },
      "Barilingual",
    ),
  );
}

// =====================================================
// Template: Quiz Question
// =====================================================
function buildQuizQuestion(slide: SlideData): SatoriNode {
  const options = [
    { label: "A", text: slide.optionA ?? "" },
    { label: "B", text: slide.optionB ?? "" },
    { label: "C", text: slide.optionC ?? "" },
  ];

  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      backgroundColor: WHITE,
      fontFamily: "Noto Sans JP",
      position: "relative",
    },
    // Orange header bar
    h(
      "div",
      {
        display: "flex",
        backgroundColor: ORANGE,
        height: "200px",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
      },
      h(
        "div",
        {
          display: "flex",
          fontSize: "96px",
          fontWeight: 700,
          color: WHITE,
        },
        "Q.",
      ),
    ),
    // Question text
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        padding: "60px 80px",
        flex: 1,
      },
      h(
        "div",
        {
          display: "flex",
          fontSize: "48px",
          fontWeight: 700,
          color: NAVY,
          marginBottom: "60px",
          lineHeight: 1.4,
        },
        slide.questionJp ?? "",
      ),
      // Options
      ...options.map((opt) =>
        h(
          "div",
          {
            display: "flex",
            backgroundColor: LIGHT_GRAY,
            borderRadius: "16px",
            padding: "24px 36px",
            marginBottom: "20px",
            fontSize: "36px",
            color: NAVY,
          },
          `${opt.label}. ${opt.text}`,
        ),
      ),
    ),
    // Swipe prompt
    h(
      "div",
      {
        display: "flex",
        justifyContent: "center",
        marginBottom: "60px",
        fontSize: "30px",
        color: TURQUOISE,
        fontWeight: 700,
      },
      "→ スワイプで答え合わせ",
    ),
    // Barilingual
    h(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: "40px",
        right: "50px",
        fontSize: "24px",
        color: GRAY,
      },
      "Barilingual",
    ),
  );
}

// =====================================================
// Template: Quiz Answer
// =====================================================
function buildQuizAnswer(slide: SlideData): SatoriNode {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      backgroundColor: WHITE,
      fontFamily: "Noto Sans JP",
      position: "relative",
    },
    // Turquoise header bar
    h(
      "div",
      {
        display: "flex",
        backgroundColor: TURQUOISE,
        height: "200px",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
      },
      h(
        "div",
        {
          display: "flex",
          fontSize: "96px",
          fontWeight: 700,
          color: WHITE,
        },
        "A.",
      ),
    ),
    // Answer content
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        padding: "60px 80px",
        flex: 1,
      },
      // Correct answer label
      h(
        "div",
        {
          display: "flex",
          fontSize: "36px",
          fontWeight: 700,
          color: ORANGE,
          marginBottom: "24px",
        },
        `正解は ${slide.correctOption ?? ""}`,
      ),
      // English answer
      h(
        "div",
        {
          display: "flex",
          fontSize: "56px",
          fontWeight: 700,
          color: NAVY,
          marginBottom: "16px",
          lineHeight: 1.3,
        },
        slide.answerEn ?? "",
      ),
      // Japanese answer
      h(
        "div",
        {
          display: "flex",
          fontSize: "36px",
          color: GRAY,
          marginBottom: "50px",
        },
        slide.answerJp ?? "",
      ),
      // Divider
      h("div", {
        display: "flex",
        width: "100%",
        height: "2px",
        backgroundColor: "#E0E0E0",
        marginBottom: "50px",
      }),
      // Explanation box
      h(
        "div",
        {
          display: "flex",
          backgroundColor: BG_LIGHT,
          borderRadius: "20px",
          padding: "36px 40px",
          fontSize: "32px",
          color: NAVY,
          lineHeight: 1.5,
        },
        slide.explanation ?? "",
      ),
    ),
    // Barilingual
    h(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: "40px",
        right: "50px",
        fontSize: "24px",
        color: GRAY,
      },
      "Barilingual",
    ),
  );
}

// =====================================================
// Template: Before/After
// =====================================================
function buildBeforeAfter(slide: SlideData): SatoriNode {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      fontFamily: "Noto Sans JP",
      position: "relative",
    },
    // Before (top half)
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        backgroundColor: LIGHT_GRAY,
        flex: 1,
        padding: "60px 80px",
        justifyContent: "center",
        position: "relative",
      },
      // Label
      h(
        "div",
        {
          display: "flex",
          backgroundColor: "#FFCDD2",
          color: "#C62828",
          fontSize: "24px",
          fontWeight: 700,
          padding: "8px 20px",
          borderRadius: "20px",
          marginBottom: "30px",
          alignSelf: "flex-start",
        },
        "日本人英語",
      ),
      h(
        "div",
        {
          display: "flex",
          fontSize: "48px",
          color: GRAY,
          marginBottom: "16px",
          lineHeight: 1.3,
        },
        slide.beforeEn ?? "",
      ),
      h(
        "div",
        {
          display: "flex",
          fontSize: "30px",
          color: "#9E9E9E",
          marginBottom: "16px",
        },
        slide.beforeJp ?? "",
      ),
      h(
        "div",
        {
          display: "flex",
          fontSize: "40px",
          color: "#E53935",
        },
        "X",
      ),
    ),
    // VS circle
    h(
      "div",
      {
        display: "flex",
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        backgroundColor: ORANGE,
        color: WHITE,
        width: "80px",
        height: "80px",
        borderRadius: "40px",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "28px",
        fontWeight: 700,
        zIndex: 2,
      },
      "VS",
    ),
    // After (bottom half)
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        backgroundColor: MINT,
        flex: 1,
        padding: "60px 80px",
        justifyContent: "center",
        position: "relative",
      },
      // Label
      h(
        "div",
        {
          display: "flex",
          backgroundColor: "#B2DFDB",
          color: "#00695C",
          fontSize: "24px",
          fontWeight: 700,
          padding: "8px 20px",
          borderRadius: "20px",
          marginBottom: "30px",
          alignSelf: "flex-start",
        },
        "ネイティブ英語",
      ),
      h(
        "div",
        {
          display: "flex",
          fontSize: "48px",
          fontWeight: 700,
          color: NAVY,
          marginBottom: "16px",
          lineHeight: 1.3,
        },
        slide.afterEn ?? "",
      ),
      h(
        "div",
        {
          display: "flex",
          fontSize: "30px",
          color: GRAY,
          marginBottom: "16px",
        },
        slide.afterJp ?? "",
      ),
      h(
        "div",
        {
          display: "flex",
          fontSize: "40px",
          color: "#2E7D32",
        },
        "O",
      ),
    ),
    // Tip
    h(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: "80px",
        left: "80px",
        right: "80px",
        backgroundColor: "rgba(255,255,255,0.9)",
        borderRadius: "16px",
        padding: "20px 30px",
        fontSize: "26px",
        color: NAVY,
      },
      slide.tip ?? "",
    ),
    // Barilingual
    h(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: "20px",
        right: "50px",
        fontSize: "24px",
        color: GRAY,
      },
      "Barilingual",
    ),
  );
}

// =====================================================
// Template: Situation
// =====================================================
function buildSituation(slide: SlideData): SatoriNode {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      fontFamily: "Noto Sans JP",
      position: "relative",
      background: `linear-gradient(135deg, #E3F2FD, #FFF3E0, #E8F5E9)`,
    },
    // White overlay
    h("div", {
      display: "flex",
      position: "absolute",
      top: "0",
      left: "0",
      right: "0",
      bottom: "0",
      backgroundColor: "rgba(255,255,255,0.75)",
    }),
    // Content
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        padding: "80px",
        flex: 1,
        zIndex: 1,
      },
      // Scene title
      h(
        "div",
        {
          display: "flex",
          fontSize: "52px",
          fontWeight: 700,
          color: NAVY,
          marginBottom: "60px",
          lineHeight: 1.3,
        },
        slide.sceneTitle ?? "",
      ),
      // Conversation bubbles
      // Left bubble (You)
      h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          alignSelf: "flex-start",
          backgroundColor: "#E3F2FD",
          borderRadius: "20px 20px 20px 4px",
          padding: "30px 36px",
          marginBottom: "30px",
          maxWidth: "85%",
        },
        h(
          "div",
          {
            display: "flex",
            fontSize: "24px",
            color: "#1565C0",
            fontWeight: 700,
            marginBottom: "12px",
          },
          "You",
        ),
        h(
          "div",
          {
            display: "flex",
            fontSize: "36px",
            color: NAVY,
            marginBottom: "8px",
            lineHeight: 1.3,
          },
          slide.phraseEn1 ?? "",
        ),
        h(
          "div",
          {
            display: "flex",
            fontSize: "28px",
            color: GRAY,
          },
          slide.phraseJp1 ?? "",
        ),
      ),
      // Right bubble (Staff)
      h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          alignSelf: "flex-end",
          backgroundColor: "#FFF3E0",
          borderRadius: "20px 20px 4px 20px",
          padding: "30px 36px",
          marginBottom: "50px",
          maxWidth: "85%",
        },
        h(
          "div",
          {
            display: "flex",
            fontSize: "24px",
            color: "#E65100",
            fontWeight: 700,
            marginBottom: "12px",
          },
          "Staff",
        ),
        h(
          "div",
          {
            display: "flex",
            fontSize: "36px",
            color: NAVY,
            marginBottom: "8px",
            lineHeight: 1.3,
          },
          slide.responseEn ?? "",
        ),
        h(
          "div",
          {
            display: "flex",
            fontSize: "28px",
            color: GRAY,
          },
          slide.responseJp ?? "",
        ),
      ),
      // Point box
      h(
        "div",
        {
          display: "flex",
          backgroundColor: "rgba(255,255,255,0.9)",
          borderRadius: "16px",
          padding: "24px 30px",
          fontSize: "28px",
          color: NAVY,
          lineHeight: 1.4,
          borderLeft: `4px solid ${TURQUOISE}`,
        },
        `Point: ${slide.point ?? ""}`,
      ),
    ),
    // Barilingual
    h(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: "40px",
        right: "50px",
        fontSize: "24px",
        color: GRAY,
        zIndex: 1,
      },
      "Barilingual",
    ),
  );
}

// =====================================================
// Main Export
// =====================================================

function buildSlideElement(
  slide: SlideData,
  contentType: string,
  total: number,
): SatoriNode {
  switch (contentType) {
    case "list":
      return buildListSlide(slide, total);
    case "quiz":
      return slide.questionJp
        ? buildQuizQuestion(slide)
        : buildQuizAnswer(slide);
    case "before_after":
      return buildBeforeAfter(slide);
    case "situation":
      return buildSituation(slide);
    default:
      return buildListSlide(slide, total);
  }
}

/**
 * Generate all slide images for a carousel post.
 * Returns an array of PNG Uint8Arrays.
 */
export async function generateSlideImages(
  content: ContentItem,
): Promise<Uint8Array[]> {
  const images: Uint8Array[] = [];
  const contentSlides = content.slides.filter((s) => s.slideType === "content");

  // 1. Cover
  const coverElement = buildCover(content.title, content.subtitle);
  images.push(await renderToImage(coverElement));

  // 2-6. Content pages
  for (const slide of contentSlides) {
    const element = buildSlideElement(
      slide,
      content.type,
      contentSlides.length,
    );
    images.push(await renderToImage(element));
  }

  // 7. CTA
  const ctaSlide = content.slides.find((s) => s.slideType === "cta");
  const ctaElement = buildCTA(
    ctaSlide?.leadMagnet ?? "無料フレーズ集をプレゼント",
  );
  images.push(await renderToImage(ctaElement));

  return images;
}
