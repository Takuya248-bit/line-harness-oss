import { Resvg } from "@cf-wasm/resvg/workerd";
import satori from "satori";
import type { ContentItem } from "./content-data";
import type { SatoriNode } from "./satori-types";
import { WIDTH, HEIGHT, FONT_FAMILY, FONT_BOLD_URL, FONT_MEDIUM_URL } from "./templates/styles";
import { buildSlides } from "./templates/index";

let fontBoldData: ArrayBuffer | null = null;
let fontMediumData: ArrayBuffer | null = null;

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status} ${url}`);
  return res.arrayBuffer();
}

async function ensureFonts(): Promise<void> {
  if (fontBoldData && fontMediumData) return;
  const [bold, medium] = await Promise.all([
    fetchFont(FONT_BOLD_URL),
    fetchFont(FONT_MEDIUM_URL),
  ]);
  fontBoldData = bold;
  fontMediumData = medium;
}

async function renderNode(node: SatoriNode): Promise<Uint8Array> {
  await ensureFonts();

  const svg = await satori(node as any, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: FONT_FAMILY, data: fontBoldData!, weight: 900, style: "normal" },
      { name: FONT_FAMILY, data: fontMediumData!, weight: 700, style: "normal" },
    ],
  });

  const resvg = await Resvg.async(svg, {
    fitTo: { mode: "width" as const, value: WIDTH },
    font: {
      fontBuffers: [new Uint8Array(fontBoldData!), new Uint8Array(fontMediumData!)],
      loadSystemFonts: false,
    },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}

export async function generateSlideImages(content: ContentItem): Promise<Uint8Array[]> {
  const nodes = buildSlides(content);
  const images: Uint8Array[] = [];
  for (const node of nodes) {
    const png = await renderNode(node);
    images.push(png);
  }
  return images;
}
