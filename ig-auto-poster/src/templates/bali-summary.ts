import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, tropicalBackground, photoBackground, baliLogo, wrapText } from "./base";

export interface BaliSummaryData {
  title: string;
  spots: { number: number; name: string; oneLiner: string }[];
  imageUrl?: string;
}

export function buildBaliSummaryNode(data: BaliSummaryData): SatoriNode {
  const spotRows = data.spots.map((spot) =>
    h("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "14px 0",
        borderBottom: "1px solid rgba(255,255,255,0.15)",
      },
    },
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: "#E67E22",
          flexShrink: 0,
        },
      },
        h("span", {
          style: { fontSize: 22, fontWeight: 900, color: "white", fontFamily: FONT_FAMILY },
        }, String(spot.number)),
      ),
      h("div", {
        style: { display: "flex", flexDirection: "column", gap: 2 },
      },
        h("span", {
          style: { fontSize: 30, fontWeight: 900, color: "white", fontFamily: FONT_FAMILY },
        }, spot.name),
        h("span", {
          style: { fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.75)", fontFamily: FONT_FAMILY },
        }, spot.oneLiner),
      ),
    ),
  );

  // 中央寄せの半透明カード
  const card = h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      margin: "0 36px",
      backgroundColor: "rgba(0,0,0,0.6)",
      borderRadius: 20,
      padding: "32px 40px",
      border: "1px solid rgba(255,255,255,0.12)",
    },
  },
    h("span", {
      style: {
        fontSize: 44,
        fontWeight: 900,
        color: "white",
        fontFamily: FONT_FAMILY,
        textAlign: "center",
        marginBottom: 20,
      },
    }, data.title || "まとめ"),
    ...spotRows,
  );

  const content = [
    baliLogo(),
    h("div", { style: { display: "flex", flex: 1 } }),
    card,
    h("div", { style: { display: "flex", flex: 1 } }),
  ];

  if (data.imageUrl) {
    return photoBackground(data.imageUrl, ...content);
  }
  return tropicalBackground(...content);
}
