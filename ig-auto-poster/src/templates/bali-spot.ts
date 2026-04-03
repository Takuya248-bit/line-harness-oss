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
      alignItems: "flex-start",
      gap: 12,
      paddingBottom: 10,
      borderBottom: "1px solid rgba(255,255,255,0.12)",
    },
  },
    h("span", {
      style: {
        fontSize: 14,
        fontWeight: 900,
        color: "rgba(255,255,255,0.6)",
        fontFamily: FONT_FAMILY,
        minWidth: 70,
        flexShrink: 0,
      },
    }, label),
    h("span", {
      style: {
        fontSize: 18,
        fontWeight: 700,
        color: "white",
        fontFamily: FONT_FAMILY,
        lineHeight: 1.5,
      },
    }, value),
  );
}

export function buildBaliSpotNode(data: BaliSpotData): SatoriNode {
  const rows: SatoriNode[] = [];

  if (data.bestDish || data.recommendedMenu) {
    rows.push(tableRow("おすすめ", data.bestDish || data.recommendedMenu || ""));
  }
  if (data.atmosphere) {
    rows.push(tableRow("雰囲気", data.atmosphere));
  }
  if (data.reviewQuote) {
    rows.push(tableRow("口コミ", `「${data.reviewQuote}」`));
  }
  if (data.area) {
    rows.push(tableRow("エリア", data.area));
  }
  if (rows.length === 0 && data.description) {
    rows.push(tableRow("紹介", data.description.slice(0, 60)));
  }

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
        padding: "40px 36px 36px 36px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 25%, rgba(0,0,0,0.9) 100%)",
        gap: 8,
      },
    },
      h("span", {
        style: {
          fontSize: 44,
          fontWeight: 900,
          color: "white",
          fontFamily: FONT_FAMILY,
          textShadow: "0 2px 12px rgba(0,0,0,0.5)",
          marginBottom: 12,
        },
      }, data.spotName),

      ...rows,

      ...(data.highlight
        ? [
            h("span", {
              style: {
                fontSize: 15,
                fontWeight: 700,
                color: "rgba(255,255,255,0.5)",
                fontFamily: FONT_FAMILY,
                marginTop: 4,
              },
            }, data.highlight),
          ]
        : []),
    ),
  );
}
