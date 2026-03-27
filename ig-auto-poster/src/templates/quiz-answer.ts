import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildQuizAnswerNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: {
      display: "flex", flexDirection: "column", width: WIDTH, height: 1350,
      background: "linear-gradient(180deg, #E0F7FA 0%, #E0F2F1 100%)", fontFamily: FONT_FAMILY,
    },
  },
    h("div", {
      style: { display: "flex", alignItems: "center", justifyContent: "center", width: WIDTH, height: 240, backgroundColor: COLORS.turquoise },
    },
      h("span", { style: { fontSize: 120, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY } }, "A."),
    ),
    h("div", {
      style: { display: "flex", flexDirection: "column", flex: 1, padding: "40px 80px", gap: 20 },
    },
      h("div", {
        style: {
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 380, paddingTop: 14, paddingBottom: 14, borderRadius: 33, backgroundColor: COLORS.orange,
        },
      },
        h("span", { style: { fontSize: 42, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY } }, `正解は ${slide.correctOption ?? ""}`),
      ),
      h("span", {
        style: { fontSize: 70, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word", marginTop: 20 },
      }, slide.answerEn ?? ""),
      h("span", {
        style: { fontSize: 46, color: COLORS.gray, fontFamily: FONT_FAMILY },
      }, slide.answerJp ?? ""),
      h("div", {
        style: { width: "100%", height: 3, backgroundColor: COLORS.turquoise, opacity: 0.4, marginTop: 20, marginBottom: 20 },
      }),
      h("div", {
        style: {
          display: "flex", width: "100%", padding: 30, backgroundColor: COLORS.white,
          borderRadius: 20, opacity: 0.92, borderLeft: `6px solid ${COLORS.turquoise}`,
        },
      },
        h("span", {
          style: { fontSize: 42, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" },
        }, slide.explanation ?? ""),
      ),
    ),
    bottomBar(),
  );
}
