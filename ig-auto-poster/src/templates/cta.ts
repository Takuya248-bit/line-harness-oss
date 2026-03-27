import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar, tropicalBackground } from "./base";

export function buildCtaNode(_leadMagnet: string): SatoriNode {
  return tropicalBackground(
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flex: 1,
        padding: 70,
        gap: 40,
      },
    },
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          backgroundColor: COLORS.white,
          borderRadius: 30,
          padding: 50,
          gap: 30,
        },
      },
        h("span", {
          style: { fontSize: 72, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY },
        }, "好きな英単語を"),
        h("span", {
          style: { fontSize: 72, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY },
        }, "コメントしてね!"),
        h("div", {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            paddingTop: 24,
            paddingBottom: 24,
            borderRadius: 50,
            backgroundColor: COLORS.orange,
          },
        },
          h("span", {
            style: { fontSize: 46, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
          }, "コメントでプレゼントGET"),
        ),
      ),
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          backgroundColor: "rgba(255,255,255,0.95)",
          borderRadius: 30,
          padding: 50,
          gap: 20,
          borderTop: `8px solid ${COLORS.orange}`,
        },
      },
        h("span", {
          style: { fontSize: 44, fontWeight: 700, color: COLORS.gray, fontFamily: FONT_FAMILY },
        }, "無料プレゼント"),
        h("span", {
          style: { fontSize: 64, fontWeight: 700, color: COLORS.orange, fontFamily: FONT_FAMILY },
        }, "レベル別"),
        h("span", {
          style: { fontSize: 60, fontWeight: 700, color: COLORS.orange, fontFamily: FONT_FAMILY },
        }, "英語学習ロードマップ"),
      ),
      h("span", {
        style: { fontSize: 34, color: COLORS.white, fontFamily: FONT_FAMILY },
      }, "@balilingirl をフォロー"),
    ),
    bottomBar(),
  );
}
