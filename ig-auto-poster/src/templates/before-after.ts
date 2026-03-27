import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildBeforeAfterNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: { display: "flex", flexDirection: "column", width: WIDTH, height: 1350, fontFamily: FONT_FAMILY },
  },
    h("div", {
      style: { display: "flex", flexDirection: "column", flex: 1, padding: 40, background: "linear-gradient(180deg, #FFF0F0 0%, #FFE0E0 100%)", gap: 16 },
    },
      h("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "center", width: 220, paddingTop: 10, paddingBottom: 10, borderRadius: 28, backgroundColor: "#FFCDD2" },
      },
        h("span", { style: { fontSize: 34, fontWeight: 700, color: "#C62828", fontFamily: FONT_FAMILY } }, "日本人英語"),
      ),
      h("span", { style: { fontSize: 56, color: "#616161", fontFamily: FONT_FAMILY, wordBreak: "break-word", marginTop: 16 } }, slide.beforeEn ?? ""),
      h("span", { style: { fontSize: 38, color: "#9E9E9E", fontFamily: FONT_FAMILY } }, slide.beforeJp ?? ""),
      h("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "center", width: 76, height: 76, borderRadius: 38, backgroundColor: "#FFCDD2", marginTop: 10 },
      },
        h("span", { style: { fontSize: 48, fontWeight: 700, color: "#E53935", fontFamily: FONT_FAMILY } }, "X"),
      ),
    ),
    h("div", {
      style: { display: "flex", flexDirection: "column", flex: 1, padding: 40, background: "linear-gradient(180deg, #E0F2F1 0%, #B2DFDB 100%)", gap: 16 },
    },
      h("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "center", width: 250, paddingTop: 10, paddingBottom: 10, borderRadius: 28, backgroundColor: "#B2DFDB" },
      },
        h("span", { style: { fontSize: 34, fontWeight: 700, color: "#00695C", fontFamily: FONT_FAMILY } }, "ネイティブ英語"),
      ),
      h("span", { style: { fontSize: 56, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word", marginTop: 16 } }, slide.afterEn ?? ""),
      h("span", { style: { fontSize: 38, color: COLORS.gray, fontFamily: FONT_FAMILY } }, slide.afterJp ?? ""),
      h("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "center", width: 76, height: 76, borderRadius: 38, backgroundColor: "#B2DFDB", marginTop: 10 },
      },
        h("span", { style: { fontSize: 48, fontWeight: 700, color: "#2E7D32", fontFamily: FONT_FAMILY } }, "O"),
      ),
    ),
    h("div", { style: { display: "flex", padding: "12px 40px", backgroundColor: "rgba(255,255,255,0.9)" } },
      h("span", { style: { fontSize: 32, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" } }, slide.tip ?? ""),
    ),
    bottomBar(),
  );
}
