import type { ContentPlan, SlideContent } from "./types";

const WIDTH = 1080;
const HEIGHT = 1350;

export interface DesignVariant {
  name: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}

export const DEFAULT_DESIGNS: DesignVariant[] = [
  { name: "white_clean", bgColor: "#FFFFFF", textColor: "#1A1A2E", accentColor: "#E94560", fontFamily: "Noto Sans JP" },
  { name: "dark_modern", bgColor: "#1A1A2E", textColor: "#FFFFFF", accentColor: "#E94560", fontFamily: "Noto Sans JP" },
  { name: "cream_warm", bgColor: "#FFF8F0", textColor: "#2D2D2D", accentColor: "#FF6B35", fontFamily: "Noto Sans JP" },
  { name: "mint_fresh", bgColor: "#F0FFF4", textColor: "#1A1A2E", accentColor: "#38B2AC", fontFamily: "Noto Sans JP" },
];

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function createSvgSlide(slide: SlideContent, design: DesignVariant, index: number, total: number): string {
  const isCover = slide.slideType === "cover";
  const isCta = slide.slideType === "cta";
  const isSummary = slide.slideType === "summary";

  const icon = slide.icon ?? "";
  const headingSize = isCover ? 64 : 48;
  const bodySize = isCover ? 36 : 32;
  const headingY = isCover ? 500 : 200;
  const bodyY = isCover ? 620 : 350;

  const bodyLines = slide.body.split("\n").filter(Boolean);
  const bodyText = bodyLines
    .map((line, i) => `<tspan x="540" dy="${i === 0 ? 0 : bodySize * 1.6}">${escapeXml(line)}</tspan>`)
    .join("");

  const pageIndicator = !isCover && !isCta
    ? `<circle cx="${540 - (total - 2) * 10 + index * 20}" cy="1280" r="6" fill="${design.accentColor}"/>
       ${Array.from({ length: total }, (_, i) =>
         i === index ? "" : `<circle cx="${540 - (total - 2) * 10 + i * 20}" cy="1280" r="4" fill="${design.textColor}" opacity="0.3"/>`
       ).join("")}`
    : "";

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${design.bgColor}"/>
    ${isCover ? `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${design.accentColor}" opacity="0.08"/>` : ""}
    ${icon ? `<text x="540" y="${headingY - 80}" text-anchor="middle" font-size="72">${icon}</text>` : ""}
    <text x="540" y="${headingY}" text-anchor="middle" font-size="${headingSize}" font-weight="bold" fill="${isCover ? design.accentColor : design.textColor}" font-family="${design.fontFamily}">
      ${escapeXml(slide.heading)}
    </text>
    <text x="540" y="${bodyY}" text-anchor="middle" font-size="${bodySize}" fill="${design.textColor}" font-family="${design.fontFamily}" opacity="0.85">
      ${bodyText}
    </text>
    ${isCta ? `<rect x="240" y="900" width="600" height="80" rx="40" fill="${design.accentColor}"/>
      <text x="540" y="950" text-anchor="middle" font-size="28" fill="#FFFFFF" font-weight="bold" font-family="${design.fontFamily}">プロフィールのLINEから無料相談</text>` : ""}
    ${isSummary ? `<line x1="340" y1="${headingY + 30}" x2="740" y2="${headingY + 30}" stroke="${design.accentColor}" stroke-width="3"/>` : ""}
    ${pageIndicator}
  </svg>`;
}

export { createSvgSlide };

export async function generateCarouselImages(
  plan: ContentPlan,
  design: DesignVariant,
): Promise<Buffer[]> {
  const sharp = (await import("sharp")).default;
  const buffers: Buffer[] = [];
  for (let i = 0; i < plan.slides.length; i++) {
    const svg = createSvgSlide(plan.slides[i]!, design, i, plan.slides.length);
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    buffers.push(buf);
  }
  return buffers;
}

export function selectDesign(designName?: string): DesignVariant {
  if (designName) {
    const found = DEFAULT_DESIGNS.find((d) => d.name === designName);
    if (found) return found;
  }
  return DEFAULT_DESIGNS[Math.floor(Math.random() * DEFAULT_DESIGNS.length)]!;
}
