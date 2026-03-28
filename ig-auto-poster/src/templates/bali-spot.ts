import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, photoBackground, baliLogo, numberBadge, wrapText } from "./base";

export interface BaliSpotData {
  imageUrl: string;
  spotNumber: number;
  spotName: string;
  description: string;
  hours?: string;
}

export function buildBaliSpotNode(data: BaliSpotData): SatoriNode {
  const descLines = wrapText(data.description, {
    fontSize: 34,
    fontWeight: 700,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 2px 6px rgba(0,0,0,0.7)",
    lineHeight: 1.5,
  }, 22);

  const nameLines = wrapText(data.spotName, {
    fontSize: 56,
    fontWeight: 900,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 3px 10px rgba(0,0,0,0.8)",
    textAlign: "center",
  }, 14);

  return photoBackground(data.imageUrl,
    baliLogo(),
    h("div", {
      style: { display: "flex", paddingLeft: 40, paddingTop: 8 },
    }, numberBadge(String(data.spotNumber))),
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 16,
        gap: 4,
      },
    }, ...nameLines),
    h("div", { style: { display: "flex", flex: 1 } }),
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "32px 40px 40px 40px",
        background: "linear-gradient(transparent, rgba(0,0,0,0.7) 20%)",
      },
    },
      h("div", {
        style: { display: "flex", flexDirection: "column", gap: 2 },
      }, ...descLines),
      ...(data.hours ? [
        h("div", {
          style: {
            display: "flex",
            alignItems: "center",
            marginTop: 12,
            gap: 8,
          },
        },
          h("span", {
            style: { fontSize: 28, color: "white", fontFamily: FONT_FAMILY, fontWeight: 700 },
          }, `⏰ ${data.hours}`),
        ),
      ] : []),
    ),
  );
}
