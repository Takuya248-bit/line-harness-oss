import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildSituationNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: {
      display: "flex", flexDirection: "column", width: WIDTH, height: 1350,
      background: "linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 50%, #E0F2F1 100%)", fontFamily: FONT_FAMILY,
    },
  },
    h("div", {
      style: { display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 60px", gap: 12 },
    },
      h("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 30, paddingRight: 30, paddingTop: 10, paddingBottom: 10, borderRadius: 25, backgroundColor: "rgba(0,150,136,0.15)" },
      },
        h("span", { style: { fontSize: 32, fontWeight: 700, color: "#00695C", fontFamily: FONT_FAMILY } }, slide.scene ?? ""),
      ),
      h("span", { style: { fontSize: 52, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, textAlign: "center" } }, slide.sceneTitle ?? ""),
    ),
    h("div", {
      style: { display: "flex", flexDirection: "column", flex: 1, margin: "0 40px", padding: 40, backgroundColor: COLORS.white, borderRadius: 30, opacity: 0.92, gap: 24 },
    },
      h("span", { style: { fontSize: 56, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" } }, slide.phraseEn1 ?? ""),
      h("span", { style: { fontSize: 40, color: COLORS.gray, fontFamily: FONT_FAMILY } }, slide.phraseJp1 ?? ""),
      h("div", { style: { width: "100%", height: 3, backgroundColor: COLORS.turquoise, opacity: 0.3 } }),
      h("span", { style: { fontSize: 56, fontWeight: 700, color: "#00695C", fontFamily: FONT_FAMILY, wordBreak: "break-word" } }, slide.responseEn ?? ""),
      h("span", { style: { fontSize: 40, color: COLORS.gray, fontFamily: FONT_FAMILY } }, slide.responseJp ?? ""),
      h("div", {
        style: { display: "flex", width: "100%", padding: 20, backgroundColor: "rgba(0,188,212,0.08)", borderRadius: 16, borderLeft: `4px solid ${COLORS.turquoise}`, marginTop: 10 },
      },
        h("span", { style: { fontSize: 34, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" } }, slide.point ?? ""),
      ),
    ),
    bottomBar(),
  );
}
