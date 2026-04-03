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

function infoRow(icon: string, text: string): SatoriNode {
  return h("div", {
    style: { display: "flex", alignItems: "center", gap: 10 },
  },
    h("span", {
      style: { fontSize: 26, fontFamily: FONT_FAMILY },
    }, icon),
    h("span", {
      style: {
        fontSize: 26,
        fontWeight: 700,
        color: "white",
        fontFamily: FONT_FAMILY,
      },
    }, text),
  );
}

export function buildBaliSpotNode(data: BaliSpotData): SatoriNode {
  const nameLines = wrapText(data.spotName, {
    fontSize: 52,
    fontWeight: 900,
    color: "white",
    fontFamily: FONT_FAMILY,
    textAlign: "center",
  }, 14);

  const descLines = wrapText(data.description, {
    fontSize: 24,
    fontWeight: 700,
    color: "rgba(255,255,255,0.9)",
    fontFamily: FONT_FAMILY,
    lineHeight: 1.4,
  }, 28);

  // 情報行を構築
  const infoRows: SatoriNode[] = [];

  if (data.area) {
    infoRows.push(infoRow("📍", data.area));
  }
  if (data.priceLevel) {
    infoRows.push(infoRow("💰", data.priceLevel));
  }
  if (data.hours) {
    infoRows.push(infoRow("⏰", data.hours));
  }
  if (data.highlight) {
    infoRows.push(infoRow("✨", data.highlight));
  }
  if (data.recommendedMenu) {
    infoRows.push(infoRow("🍽", data.recommendedMenu));
  }

  return photoBackground(data.imageUrl,
    // ヘッダー: ロゴ + 番号バッジ
    h("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "24px 32px 0 32px",
      },
    },
      numberBadge(String(data.spotNumber)),
      h("span", {
        style: {
          fontSize: 32,
          fontWeight: 700,
          color: "white",
          fontFamily: FONT_FAMILY,
          textShadow: "0 2px 8px rgba(0,0,0,0.7)",
        },
      }, "Barilingual"),
    ),

    // 上部スペーサー
    h("div", { style: { display: "flex", flex: 1 } }),

    // 中央: 情報カード
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        margin: "0 32px",
        backgroundColor: "rgba(0,0,0,0.65)",
        borderRadius: 20,
        padding: "32px 36px",
        gap: 16,
        border: "1px solid rgba(255,255,255,0.15)",
      },
    },
      // 店名
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          paddingBottom: 12,
          borderBottom: "1px solid rgba(255,255,255,0.2)",
        },
      }, ...nameLines),

      // 説明文
      h("div", {
        style: { display: "flex", flexDirection: "column", gap: 4 },
      }, ...descLines),

      // 詳細情報行
      ...(infoRows.length > 0
        ? [
            h("div", {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: 10,
                paddingTop: 8,
                borderTop: "1px solid rgba(255,255,255,0.15)",
              },
            }, ...infoRows),
          ]
        : []),
    ),

    // 下部スペーサー
    h("div", { style: { display: "flex", flex: 1 } }),
  );
}
