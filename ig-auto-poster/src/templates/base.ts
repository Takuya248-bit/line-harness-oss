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

/**
 * テキスト折り返しヘルパー
 * 長いテキストをコンテナ幅に収まるよう複数行のSatoriノードに分割する。
 * 英語は単語区切り、日本語は文字区切りで折り返す。
 */
export function wrapText(
  text: string,
  style: Record<string, unknown>,
  maxCharsPerLine: number,
): SatoriNode[] {
  if (!text) return [];
  const lines = splitTextIntoLines(text, maxCharsPerLine);
  return lines.map((line) =>
    h("span", { style: { ...style, wordBreak: "break-word" as const } }, line),
  );
}

/** テキストを行に分割する。英語は単語境界、日本語は文字数で分割 */
function splitTextIntoLines(text: string, maxChars: number): string[] {
  // 短いテキストはそのまま
  if (text.length <= maxChars) return [text];

  const isMainlyEnglish = /^[\x20-\x7E]+$/.test(text.trim());
  if (isMainlyEnglish) {
    return splitEnglishByWord(text, maxChars);
  }
  return splitByChars(text, maxChars);
}

function splitEnglishByWord(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function splitByChars(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars));
  }
  return lines;
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

// V2: 写真背景（Satori img要素）
export function photoBackground(
  imageUrl: string,
  ...children: SatoriNode[]
): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: HEIGHT,
      fontFamily: FONT_FAMILY,
      position: "relative",
      overflow: "hidden",
    },
  },
    // 背景画像
    h("img", {
      src: imageUrl,
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        objectFit: "cover",
      },
    }),
    // コンテンツレイヤー
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height: HEIGHT,
        position: "relative",
        background: "rgba(0,0,0,0.3)",
      },
    }, ...children),
  );
}

// V2: Balilingualロゴ（上部）
export function baliLogo(): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      paddingTop: 32,
      paddingBottom: 8,
    },
  },
    h("span", {
      style: {
        fontSize: 36,
        fontWeight: 700,
        color: "white",
        fontFamily: FONT_FAMILY,
        textShadow: "0 2px 8px rgba(0,0,0,0.7)",
      },
    }, "Barilingual"),
  );
}

// V2: 番号バッジ（オレンジ丸）
export function numberBadge(label: string): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "#E67E22",
    },
  },
    h("span", {
      style: {
        fontSize: 32,
        fontWeight: 900,
        color: "white",
        fontFamily: FONT_FAMILY,
      },
    }, label),
  );
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
