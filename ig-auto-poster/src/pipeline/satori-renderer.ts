import { readFileSync } from "fs";
import { resolve } from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { SatoriNode } from "../satori-types";

const FONT_DIR = resolve(__dirname, "../../assets/fonts");

const fontBold = readFileSync(resolve(FONT_DIR, "ZenMaruGothic-Bold.ttf"));
const fontBlack = readFileSync(resolve(FONT_DIR, "ZenMaruGothic-Black.ttf"));

const WIDTH = 1080;
const HEIGHT = 1350;

export async function renderSatoriNode(node: SatoriNode): Promise<Buffer> {
  const svg = await satori(node as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Zen Maru Gothic", data: fontBold, weight: 700, style: "normal" },
      { name: "Zen Maru Gothic", data: fontBlack, weight: 900, style: "normal" },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    font: { loadSystemFonts: false },
  });

  return Buffer.from(resvg.render().asPng());
}

export async function renderV2Slides(nodes: SatoriNode[]): Promise<Buffer[]> {
  return Promise.all(nodes.map(renderSatoriNode));
}
