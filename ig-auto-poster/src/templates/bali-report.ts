import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildBaliReportNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: {
      display: "flex", flexDirection: "column", width: WIDTH, height: 1350,
      background: "linear-gradient(135deg, #E0F7FA 0%, #B2EBF2 40%, #E8F5E9 100%)", fontFamily: FONT_FAMILY,
    },
  },
    h("div", {
      style: { display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 60px", gap: 16 },
    },
      h("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 30, paddingRight: 30, paddingTop: 10, paddingBottom: 10, borderRadius: 25, backgroundColor: "rgba(0,188,212,0.15)" },
      },
        h("span", { style: { fontSize: 32, fontWeight: 700, color: "#00695C", fontFamily: FONT_FAMILY } }, "バリ島現地レポ"),
      ),
      h("span", { style: { fontSize: 52, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, textAlign: "center", wordBreak: "break-word" } }, slide.locationName ?? ""),
    ),
    h("div", {
      style: { display: "flex", flexDirection: "column", flex: 1, margin: "0 40px", padding: 40, backgroundColor: COLORS.white, borderRadius: 30, opacity: 0.92, gap: 24 },
    },
      h("span", { style: { fontSize: 56, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" } }, slide.phraseEn1 ?? slide.phraseEn ?? ""),
      h("span", { style: { fontSize: 40, color: COLORS.gray, fontFamily: FONT_FAMILY } }, slide.phraseJp1 ?? slide.phraseJp ?? ""),
      h("div", { style: { width: "100%", height: 3, backgroundColor: COLORS.turquoise, opacity: 0.3 } }),
      h("div", {
        style: { display: "flex", width: "100%", padding: 24, borderRadius: 16, borderLeft: `4px solid ${COLORS.turquoise}`, backgroundColor: "rgba(0,188,212,0.06)" },
      },
        h("span", { style: { fontSize: 36, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word", lineHeight: 1.5 } }, slide.usageTip ?? ""),
      ),
    ),
    bottomBar(),
  );
}
