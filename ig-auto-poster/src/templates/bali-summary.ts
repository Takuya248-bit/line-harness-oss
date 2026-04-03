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
        gap: 16,
        padding: "12px 0",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
      },
    },
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: "#E67E22",
          flexShrink: 0,
        },
      },
        h("span", {
          style: { fontSize: 20, fontWeight: 900, color: "white", fontFamily: FONT_FAMILY },
        }, String(spot.number)),
      ),
      h("div", {
        style: { display: "flex", flexDirection: "column", gap: 2 },
      },
        h("span", {
          style: { fontSize: 28, fontWeight: 900, color: "white", fontFamily: FONT_FAMILY },
        }, spot.name),
        h("span", {
          style: { fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.7)", fontFamily: FONT_FAMILY },
        }, spot.oneLiner),
      ),
    ),
  );

  const bgFn = data.imageUrl
    ? (...c: SatoriNode[]) => photoBackground(data.imageUrl!, ...c)
    : (...c: SatoriNode[]) => tropicalBackground(...c);

  return bgFn(
    // ヘッダー
    h("div", {
      style: { display: "flex", justifyContent: "center", paddingTop: 28 },
    },
      h("span", {
        style: { fontSize: 32, fontWeight: 700, color: "white", fontFamily: FONT_FAMILY, textShadow: "0 2px 8px rgba(0,0,0,0.7)" },
      }, "Barilingual"),
    ),

    // 上部スペーサー
    h("div", { style: { display: "flex", flexGrow: 1, flexShrink: 1, minHeight: 20 } }),

    // 中央カード
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        marginLeft: 32,
        marginRight: 32,
        backgroundColor: "rgba(0,0,0,0.65)",
        borderRadius: 20,
        padding: "28px 36px",
        border: "1px solid rgba(255,255,255,0.1)",
      },
    },
      h("span", {
        style: {
          fontSize: 40,
          fontWeight: 900,
          color: "white",
          fontFamily: FONT_FAMILY,
          textAlign: "center",
          marginBottom: 16,
        },
      }, data.title || "まとめ"),
      ...spotRows,
    ),

    // 下部スペーサー
    h("div", { style: { display: "flex", flexGrow: 1, flexShrink: 1, minHeight: 20 } }),
  );
}
