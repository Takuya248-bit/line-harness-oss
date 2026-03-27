import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, FONT_FAMILY } from "./styles";
import { h, bottomBar, lightBackground, pageBadge } from "./base";

export function buildListSlideNode(slide: SlideData, pageLabel: string): SatoriNode {
  return lightBackground(
    h("div", { style: { display: "flex", padding: 30 } },
      pageBadge(pageLabel),
    ),
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        margin: "0 40px",
        padding: 50,
        backgroundColor: COLORS.white,
        borderRadius: 30,
        opacity: 0.92,
        gap: 20,
      },
    },
      h("span", {
        style: { fontSize: 80, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" },
      }, slide.phraseEn ?? ""),
      h("span", {
        style: { fontSize: 46, color: COLORS.gray, fontFamily: FONT_FAMILY },
      }, slide.phraseJp ?? ""),
      h("div", {
        style: { width: "100%", height: 3, backgroundColor: COLORS.turquoise, opacity: 0.4, marginTop: 20, marginBottom: 20 },
      }),
      h("div", {
        style: {
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 180, paddingTop: 8, paddingBottom: 8, borderRadius: 25, backgroundColor: "rgba(0,188,212,0.15)",
        },
      },
        h("span", { style: { fontSize: 32, fontWeight: 700, color: COLORS.turquoise, fontFamily: FONT_FAMILY } }, "Example"),
      ),
      h("span", {
        style: { fontSize: 46, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word", marginTop: 10 },
      }, slide.exampleEn ?? ""),
      h("span", {
        style: { fontSize: 40, color: COLORS.gray, fontFamily: FONT_FAMILY, wordBreak: "break-word" },
      }, slide.exampleJp ?? ""),
    ),
    bottomBar(),
  );
}
