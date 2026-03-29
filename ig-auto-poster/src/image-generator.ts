import satori, { init as initSatori } from "satori/standalone";
// @ts-expect-error wasm module import
import yogaWasm from "satori/yoga.wasm";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
// @ts-expect-error wasm module import
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import type { ContentItem } from "./content-data";
import type { SatoriNode } from "./satori-types";
import { WIDTH, HEIGHT, FONT_FAMILY, FONT_BOLD_URL, FONT_MEDIUM_URL } from "./templates/styles";
import { buildSlides, buildV2Slides, type BaliContentV2 } from "./templates/index";

let satoriInitialized = false;
let satoriInitPromise: Promise<void> | null = null;

function ensureSatori(): Promise<void> {
  if (satoriInitialized) return Promise.resolve();
  if (satoriInitPromise) return satoriInitPromise;
  satoriInitPromise = initSatori(yogaWasm).then(() => {
    satoriInitialized = true;
  });
  return satoriInitPromise;
}

let resvgInitialized = false;
let resvgInitPromise: Promise<void> | null = null;

function ensureResvg(): Promise<void> {
  if (resvgInitialized) return Promise.resolve();
  if (resvgInitPromise) return resvgInitPromise;
  resvgInitPromise = initWasm(resvgWasm as WebAssembly.Module).then(() => {
    resvgInitialized = true;
  });
  return resvgInitPromise;
}

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

async function renderNodeToSvg(node: SatoriNode): Promise<string> {
  await ensureSatori();
  await ensureFonts();

  return satori(node as any, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: FONT_FAMILY, data: fontBoldData!, weight: 900, style: "normal" },
      { name: FONT_FAMILY, data: fontMediumData!, weight: 700, style: "normal" },
    ],
  });
}

/** SVGをPNGバイナリに変換 */
async function svgToPng(svg: string): Promise<Uint8Array> {
  await ensureResvg();
  await ensureFonts();

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    font: {
      fontBuffers: [
        new Uint8Array(fontBoldData!),
        new Uint8Array(fontMediumData!),
      ],
      defaultFontFamily: FONT_FAMILY,
    },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  rendered.free();
  resvg.free();
  return png;
}

/** スライド画像をPNGバイナリ配列で返す */
export async function generateSlideImages(content: ContentItem): Promise<Uint8Array[]> {
  const nodes = buildSlides(content);
  const pngs: Uint8Array[] = [];
  for (const node of nodes) {
    const svg = await renderNodeToSvg(node);
    const png = await svgToPng(svg);
    pngs.push(png);
  }
  return pngs;
}

/** 1枚だけSVG→PNGに変換 */
export async function generateSingleSlidePng(content: ContentItem, slideIndex: number): Promise<Uint8Array> {
  const nodes = buildSlides(content);
  if (slideIndex >= nodes.length) throw new Error(`Slide index ${slideIndex} out of range (total: ${nodes.length})`);
  const svg = await renderNodeToSvg(nodes[slideIndex]);
  return svgToPng(svg);
}

/** スライド総数を返す */
export function getSlideCount(content: ContentItem): number {
  return buildSlides(content).length;
}

/** 1枚目（カバー）のSVG文字列を返す */
export async function generateFirstSlideSvg(content: ContentItem): Promise<string> {
  const nodes = buildSlides(content);
  if (nodes.length === 0) throw new Error("No slides for content: " + content.id);
  return renderNodeToSvg(nodes[0]);
}

/** 全スライドのSVG文字列を返す */
export async function generateAllSlideSvgs(content: ContentItem): Promise<string[]> {
  const nodes = buildSlides(content);
  const svgs: string[] = [];
  for (const node of nodes) {
    svgs.push(await renderNodeToSvg(node));
  }
  return svgs;
}

/** V2: バリ情報カルーセルの全スライドをPNG配列で返す */
export async function generateV2SlideImages(content: BaliContentV2): Promise<Uint8Array[]> {
  const nodes = buildV2Slides(content);
  const pngs: Uint8Array[] = [];
  for (const node of nodes) {
    const svg = await renderNodeToSvg(node);
    const png = await svgToPng(svg);
    pngs.push(png);
  }
  return pngs;
}

/** V2: 1枚だけPNG変換（プレビュー用） */
export async function generateV2SinglePng(content: BaliContentV2, slideIndex: number): Promise<Uint8Array> {
  const nodes = buildV2Slides(content);
  if (slideIndex >= nodes.length) throw new Error(`V2 slide index ${slideIndex} out of range (total: ${nodes.length})`);
  const svg = await renderNodeToSvg(nodes[slideIndex]);
  return svgToPng(svg);
}

/** V2: スライド総数 */
export function getV2SlideCount(content: BaliContentV2): number {
  return buildV2Slides(content).length;
}
