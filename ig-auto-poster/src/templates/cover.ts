import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, HEIGHT, FONT_FAMILY } from "./styles";
import { h, bottomBar, tropicalBackground } from "./base";

export function buildCoverNode(title: string, subtitle: string): SatoriNode {
  const titleLines = title.split("\n");

  return tropicalBackground(
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: 60,
      },
    },
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 12,
          paddingBottom: 12,
          borderRadius: 35,
          backgroundColor: COLORS.orange,
          marginBottom: 40,
        },
      },
        h("span", {
          style: { fontSize: 36, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
        }, "保存必須"),
      ),
      ...titleLines.map((line) =>
        h("span", {
          style: {
            fontSize: 104,
            fontWeight: 700,
            color: COLORS.white,
            fontFamily: FONT_FAMILY,
            textAlign: "center",
            lineHeight: 1.3,
          },
        }, line),
      ),
      h("span", {
        style: {
          fontSize: 48,
          fontWeight: 700,
          color: "rgba(255,255,255,0.9)",
          fontFamily: FONT_FAMILY,
          marginTop: 40,
        },
      }, subtitle),
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 60,
          paddingRight: 60,
          paddingTop: 16,
          paddingBottom: 16,
          borderRadius: 33,
          backgroundColor: "rgba(255,255,255,0.18)",
          marginTop: 40,
        },
      },
        h("span", {
          style: { fontSize: 34, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
        }, "→ スワイプで全部見る"),
      ),
    ),
    bottomBar(),
  );
}
