import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, tropicalBackground, photoBackground, baliLogo, wrapText } from "./base";

// カテゴリごとのCTAコピー
const CTA_COPY: Record<string, { headline: string; sub: string }> = {
  cafe: { headline: "バリ島カフェガイド", sub: "おしゃれカフェ30選をLINEで配信中" },
  spot: { headline: "バリ島観光ガイドブック", sub: "穴場スポット完全版をプレゼント" },
  food: { headline: "バリ島グルメガイド", sub: "ローカルフード完全ガイドをプレゼント" },
  beach: { headline: "バリ島ビーチガイド", sub: "秘境ビーチ20選をLINEで配信中" },
  lifestyle: { headline: "バリ島生活ガイドブック", sub: "移住・ノマド完全ガイドをプレゼント" },
  cost: { headline: "バリ島コスト早見表", sub: "生活費シミュレーターをプレゼント" },
  culture: { headline: "バリ島文化ガイド", sub: "知っておきたいマナーと文化をまとめました" },
};

const DEFAULT_CTA = { headline: "バリ島ガイドブック", sub: "無料でプレゼント中" };

export function buildBaliCtaNode(imageUrl?: string, category?: string): SatoriNode {
  const cta = CTA_COPY[category ?? ""] ?? DEFAULT_CTA;

  const innerContent = h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      gap: 32,
      padding: "0 48px",
    },
  },
    // アイコン
    h("span", {
      style: { fontSize: 64 },
    }, "🎁"),

    // ヘッドライン
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      },
    },
      h("span", {
        style: {
          fontSize: 46,
          fontWeight: 900,
          color: "white",
          fontFamily: FONT_FAMILY,
          textAlign: "center",
        },
      }, cta.headline),
      h("span", {
        style: {
          fontSize: 28,
          fontWeight: 700,
          color: "rgba(255,255,255,0.8)",
          fontFamily: FONT_FAMILY,
          textAlign: "center",
        },
      }, cta.sub),
    ),

    // LINEボタン
    h("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#06C755",
        borderRadius: 50,
        padding: "20px 64px",
        gap: 12,
      },
    },
      h("span", {
        style: {
          fontSize: 36,
          fontWeight: 900,
          color: "white",
          fontFamily: FONT_FAMILY,
        },
      }, "LINEで受け取る"),
    ),

    // 誘導テキスト
    h("span", {
      style: {
        fontSize: 26,
        fontWeight: 700,
        color: "rgba(255,255,255,0.7)",
        fontFamily: FONT_FAMILY,
        textAlign: "center",
      },
    }, "プロフィールのリンクからどうぞ!"),
  );

  if (imageUrl) {
    return photoBackground(imageUrl, baliLogo(), innerContent);
  }
  return tropicalBackground(baliLogo(), innerContent);
}
