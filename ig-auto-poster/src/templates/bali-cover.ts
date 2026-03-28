import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, photoBackground, baliLogo, numberBadge, wrapText } from "./base";

export interface BaliCoverData {
  imageUrl: string;
  catchCopy: string;    // e.g. "チャングーで行きたい！"
  mainTitle: string;    // e.g. "おしゃれカフェ"
  countLabel: string;   // e.g. "5選"
}

export function buildBaliCoverNode(data: BaliCoverData): SatoriNode {
  const catchLines = wrapText(data.catchCopy, {
    fontSize: 42,
    fontWeight: 700,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 2px 8px rgba(0,0,0,0.7)",
    textAlign: "center",
  }, 18);

  const titleLines = wrapText(data.mainTitle, {
    fontSize: 72,
    fontWeight: 900,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 3px 12px rgba(0,0,0,0.8)",
    textAlign: "center",
  }, 10);

  return photoBackground(data.imageUrl,
    baliLogo(),
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        gap: 16,
      },
    },
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          border: "3px solid rgba(255,255,255,0.8)",
          borderRadius: 12,
          padding: "40px 60px",
          gap: 12,
        },
      },
        h("div", {
          style: { display: "flex", flexDirection: "column", alignItems: "center" },
        }, ...catchLines),
        h("div", {
          style: { display: "flex", flexDirection: "column", alignItems: "center" },
        }, ...titleLines),
        numberBadge(data.countLabel),
      ),
    ),
  );
}
