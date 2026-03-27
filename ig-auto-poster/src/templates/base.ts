import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, HEIGHT, FONT_FAMILY } from "./styles";

// Satoriノード作成ヘルパー
export function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: (SatoriNode | string)[]
): SatoriNode {
  return {
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 1 ? children[0] : children.length > 0 ? children : undefined,
    },
  };
}

// 共通: ボトムバー
export function bottomBar(): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: WIDTH,
      height: 82,
      backgroundColor: "rgba(0,77,64,0.85)",
    },
  },
    h("span", {
      style: { fontSize: 30, color: "rgba(255,255,255,0.9)", fontFamily: FONT_FAMILY },
    }, "Barilingual | バリ島で英語を学ぼう"),
  );
}

// 共通: トロピカルグラデーション背景
export function tropicalBackground(...children: SatoriNode[]): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: HEIGHT,
      background: "linear-gradient(135deg, #004D40 0%, #00695C 35%, #00897B 70%, #00BCD4 100%)",
      fontFamily: FONT_FAMILY,
    },
  }, ...children);
}

// 共通: ライト背景
export function lightBackground(...children: SatoriNode[]): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: HEIGHT,
      background: "linear-gradient(180deg, #E0F2F1 0%, #B2DFDB 50%, #E0F7FA 100%)",
      fontFamily: FONT_FAMILY,
    },
  }, ...children);
}

// 共通: ページバッジ
export function pageBadge(label: string): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: COLORS.turquoise,
    },
  },
    h("span", {
      style: { fontSize: 36, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
    }, label),
  );
}
