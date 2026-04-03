import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, photoBackground, numberBadge, wrapText } from "./base";

export interface BaliSpotData {
  imageUrl: string;
  spotNumber: number;
  spotName: string;
  description: string;
  hours?: string;
  area?: string;
  priceLevel?: string;
  highlight?: string;
  recommendedMenu?: string;
  bestDish?: string;
  atmosphere?: string;
  reviewQuote?: string;
  infoStyle?: "simple" | "rich" | "practical";
}

function tableRow(label: string, value: string): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
    },
  },
    h("span", {
      style: {
        fontSize: 13,
        fontWeight: 900,
        color: "rgba(255,255,255,0.5)",
        fontFamily: FONT_FAMILY,
        minWidth: 56,
        flexShrink: 0,
      },
    }, label),
    h("span", {
      style: {
        fontSize: 17,
        fontWeight: 700,
        color: "white",
        fontFamily: FONT_FAMILY,
      },
    }, value),
  );
}

export function buildBaliSpotNode(data: BaliSpotData): SatoriNode {
  const rows: SatoriNode[] = [];

  if (data.bestDish || data.recommendedMenu) {
    rows.push(tableRow("料理", data.bestDish || data.recommendedMenu || ""));
  }
  if (data.atmosphere) {
    rows.push(tableRow("空間", data.atmosphere));
  }
  if (data.area) {
    rows.push(tableRow("場所", data.area));
  }
  if (data.hours) {
    rows.push(tableRow("営業", data.hours));
  }

  const descLines = wrapText(data.description.slice(0, 120), {
    fontSize: 16,
    fontWeight: 700,
    color: "rgba(255,255,255,0.85)",
    fontFamily: FONT_FAMILY,
    lineHeight: 1.6,
  }, 32);

  return photoBackground(data.imageUrl,
    h("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "28px 36px 0 36px",
      },
    },
      numberBadge(String(data.spotNumber)),
      h("span", {
        style: {
          fontSize: 28,
          fontWeight: 700,
          color: "white",
          fontFamily: FONT_FAMILY,
          textShadow: "0 2px 8px rgba(0,0,0,0.7)",
        },
      }, "Barilingual"),
    ),

    h("div", { style: { display: "flex", flex: 1 } }),

    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "36px 36px 32px 36px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.75) 20%, rgba(0,0,0,0.92) 100%)",
        gap: 6,
      },
    },
      h("span", {
        style: {
          fontSize: 40,
          fontWeight: 900,
          color: "white",
          fontFamily: FONT_FAMILY,
          textShadow: "0 2px 12px rgba(0,0,0,0.5)",
          marginBottom: 8,
        },
      }, data.spotName),

      ...rows,

      ...(descLines.length > 0
        ? [
            h("div", {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: 2,
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px solid rgba(255,255,255,0.15)",
              },
            }, ...descLines),
          ]
        : []),
    ),
  );
}
