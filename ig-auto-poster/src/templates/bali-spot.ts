import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, photoBackground, baliLogo, numberBadge, wrapText } from "./base";

export interface BaliSpotData {
  imageUrl: string;
  spotNumber: number;
  spotName: string;
  description: string;
  hours?: string;
  // A/Bテスト用フィールド
  area?: string;
  priceLevel?: string;
  highlight?: string;
  recommendedMenu?: string;
  infoStyle?: "simple" | "rich" | "practical";
}

export function buildBaliSpotNode(data: BaliSpotData): SatoriNode {
  const descLines = wrapText(data.description, {
    fontSize: 30,
    fontWeight: 700,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 2px 6px rgba(0,0,0,0.7)",
    lineHeight: 1.6,
  }, 24);

  const nameLines = wrapText(data.spotName, {
    fontSize: 56,
    fontWeight: 900,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 3px 10px rgba(0,0,0,0.8)",
    textAlign: "center",
  }, 14);

  const style = data.infoStyle ?? "simple";

  const extraNodes: SatoriNode[] = [];

  if (style === "rich") {
    if (data.priceLevel) {
      extraNodes.push(
        h("div", {
          style: {
            display: "flex",
            alignItems: "center",
            marginTop: 10,
            gap: 8,
          },
        },
          h("span", {
            style: {
              fontSize: 24,
              fontWeight: 700,
              color: "white",
              fontFamily: FONT_FAMILY,
              backgroundColor: "rgba(255,255,255,0.2)",
              borderRadius: 8,
              padding: "2px 12px",
            },
          }, data.priceLevel),
        ),
      );
    }
    if (data.highlight) {
      extraNodes.push(
        h("span", {
          style: {
            fontSize: 24,
            fontWeight: 700,
            color: "rgba(255,255,255,0.85)",
            fontFamily: FONT_FAMILY,
            marginTop: 6,
          },
        }, data.highlight),
      );
    }
  } else if (style === "practical") {
    if (data.hours) {
      extraNodes.push(
        h("div", {
          style: { display: "flex", alignItems: "center", marginTop: 12, gap: 8 },
        },
          h("span", {
            style: { fontSize: 28, color: "white", fontFamily: FONT_FAMILY, fontWeight: 700 },
          }, `⏰ ${data.hours}`),
        ),
      );
    }
    if (data.priceLevel) {
      extraNodes.push(
        h("div", {
          style: { display: "flex", alignItems: "center", marginTop: 8, gap: 8 },
        },
          h("span", {
            style: { fontSize: 28, color: "white", fontFamily: FONT_FAMILY, fontWeight: 700 },
          }, `💰 ${data.priceLevel}`),
        ),
      );
    }
    if (data.recommendedMenu) {
      extraNodes.push(
        h("div", {
          style: { display: "flex", alignItems: "center", marginTop: 8, gap: 8 },
        },
          h("span", {
            style: { fontSize: 28, color: "white", fontFamily: FONT_FAMILY, fontWeight: 700 },
          }, `🍽 ${data.recommendedMenu}`),
        ),
      );
    }
  } else {
    // simple: hours only (existing behavior)
    if (data.hours) {
      extraNodes.push(
        h("div", {
          style: { display: "flex", alignItems: "center", marginTop: 12, gap: 8 },
        },
          h("span", {
            style: { fontSize: 28, color: "white", fontFamily: FONT_FAMILY, fontWeight: 700 },
          }, `⏰ ${data.hours}`),
        ),
      );
    }
  }

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
    },
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          backgroundColor: "rgba(0,0,0,0.4)",
          borderRadius: 12,
          padding: "8px 24px",
        },
      }, ...nameLines),
    ),
    h("div", { style: { display: "flex", flex: 1 } }),
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "32px 40px 40px 40px",
        background: "linear-gradient(transparent, rgba(0,0,0,0.9) 15%)",
      },
    },
      h("div", {
        style: { display: "flex", flexDirection: "column", gap: 2 },
      }, ...descLines),
      ...extraNodes,
    ),
  );
}
