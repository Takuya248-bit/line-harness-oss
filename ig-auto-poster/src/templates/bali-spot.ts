import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, photoBackground, numberBadge, wrapText } from "./base";

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
  // 説明文は2行（60文字）に収める
  const shortDesc = data.description.slice(0, 60) + (data.description.length > 60 ? "…" : "");

  const descLines = wrapText(shortDesc, {
    fontSize: 22,
    fontWeight: 700,
    color: "rgba(255,255,255,0.95)",
    fontFamily: FONT_FAMILY,
    lineHeight: 1.6,
  }, 26);

  // エリアとhighlight
  const metaText = [data.area, data.highlight].filter(Boolean).join("  ·  ");

  return photoBackground(data.imageUrl,
    // ヘッダー: 番号バッジ + ロゴ
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

    // 写真エリア（上部80%）
    h("div", { style: { display: "flex", flex: 1 } }),

    // 下部テキストエリア（グラデーション背景）
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "48px 40px 40px 40px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.75) 30%, rgba(0,0,0,0.85) 100%)",
        gap: 12,
      },
    },
      // 店名（大きく中央）
      h("span", {
        style: {
          fontSize: 48,
          fontWeight: 900,
          color: "white",
          fontFamily: FONT_FAMILY,
          textAlign: "center",
          textShadow: "0 2px 12px rgba(0,0,0,0.5)",
        },
      }, data.spotName),

      // 説明文（2行以内）
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          marginTop: 4,
        },
      }, ...descLines),

      // エリア · highlight（小さく）
      ...(metaText
        ? [
            h("span", {
              style: {
                fontSize: 18,
                fontWeight: 700,
                color: "rgba(255,255,255,0.7)",
                fontFamily: FONT_FAMILY,
                textAlign: "center",
                marginTop: 8,
              },
            }, metaText),
          ]
        : []),
    ),
  );
}
