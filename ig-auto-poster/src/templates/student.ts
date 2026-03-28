import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildStudentNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: {
      display: "flex", flexDirection: "column", width: WIDTH, height: 1350,
      background: "linear-gradient(180deg, #FFF8E1 0%, #FFECB3 50%, #FFF3E0 100%)", fontFamily: FONT_FAMILY,
    },
  },
    h("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 60px" } },
      h("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 30, paddingRight: 30, paddingTop: 10, paddingBottom: 10, borderRadius: 25, backgroundColor: "rgba(255,111,0,0.15)" },
      },
        h("span", { style: { fontSize: 36, fontWeight: 700, color: COLORS.orange, fontFamily: FONT_FAMILY } }, `あるある #${slide.mistakeNumber ?? ""}`),
      ),
    ),
    h("div", {
      style: { display: "flex", flexDirection: "column", flex: 1, margin: "0 40px", padding: 40, backgroundColor: COLORS.white, borderRadius: 30, opacity: 0.92, gap: 24 },
    },
      h("div", {
        style: { display: "flex", flexDirection: "column", width: "100%", padding: 24, borderRadius: 20, backgroundColor: "#FFF0F0", gap: 8 },
      },
        h("span", { style: { fontSize: 28, fontWeight: 700, color: "#C62828", fontFamily: FONT_FAMILY } }, "よくある間違い"),
        h("span", { style: { fontSize: 52, fontWeight: 700, color: "#616161", fontFamily: FONT_FAMILY, wordBreak: "break-word", textDecoration: "line-through" } }, slide.mistakeEn ?? ""),
      ),
      h("div", {
        style: { display: "flex", flexDirection: "column", width: "100%", padding: 24, borderRadius: 20, backgroundColor: "#E8F5E9", gap: 8 },
      },
        h("span", { style: { fontSize: 28, fontWeight: 700, color: "#2E7D32", fontFamily: FONT_FAMILY } }, "正しい表現"),
        h("span", { style: { fontSize: 52, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" } }, slide.correctEn ?? ""),
      ),
      h("div", {
        style: { display: "flex", width: "100%", padding: 24, borderRadius: 16, borderLeft: `4px solid ${COLORS.turquoise}`, backgroundColor: "rgba(0,188,212,0.06)" },
      },
        h("span", { style: { fontSize: 38, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word", lineHeight: 1.5 } }, slide.mistakeExplanation ?? ""),
      ),
    ),
    bottomBar(),
  );
}
