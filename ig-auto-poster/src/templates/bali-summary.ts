import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, tropicalBackground, photoBackground, baliLogo, wrapText } from "./base";

export interface BaliSummaryData {
  title: string;
  spots: { number: number; name: string; oneLiner: string }[];
  imageUrl?: string;  // 追加: 写真背景A/Bテスト用
}

export function buildBaliSummaryNode(data: BaliSummaryData): SatoriNode {
  const spotRows = data.spots.map((spot) =>
    h("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 0",
        borderBottom: "1px solid rgba(255,255,255,0.2)",
      },
    },
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#E67E22",
          flexShrink: 0,
        },
      },
        h("span", {
          style: { fontSize: 24, fontWeight: 900, color: "white", fontFamily: FONT_FAMILY },
        }, String(spot.number)),
      ),
      h("div", {
        style: { display: "flex", flexDirection: "column", gap: 4 },
      },
        h("span", {
          style: { fontSize: 32, fontWeight: 900, color: "white", fontFamily: FONT_FAMILY },
        }, spot.name),
        h("span", {
          style: { fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.8)", fontFamily: FONT_FAMILY },
        }, spot.oneLiner),
      ),
    ),
  );

  const innerContent = h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      padding: "20px 48px",
      flex: 1,
    },
  },
    h("span", {
      style: {
        fontSize: 40,
        fontWeight: 900,
        color: "white",
        fontFamily: FONT_FAMILY,
        textAlign: "center",
        marginBottom: 24,
      },
    }, "まとめ"),
    ...spotRows,
  );

  if (data.imageUrl) {
    return photoBackground(data.imageUrl, baliLogo(), innerContent);
  }

  return tropicalBackground(baliLogo(), innerContent);
}
