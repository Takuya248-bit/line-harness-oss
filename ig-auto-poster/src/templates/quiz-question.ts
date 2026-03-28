import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildQuizQuestionNode(slide: SlideData): SatoriNode {
  const options = [
    { label: "A", text: slide.optionA ?? "" },
    { label: "B", text: slide.optionB ?? "" },
    { label: "C", text: slide.optionC ?? "" },
  ];

  return h("div", {
    style: {
      display: "flex", flexDirection: "column", width: WIDTH, height: 1350,
      background: "linear-gradient(180deg, #FFF8E1 0%, #FFF3E0 100%)", fontFamily: FONT_FAMILY,
    },
  },
    h("div", {
      style: { display: "flex", alignItems: "center", justifyContent: "center", width: WIDTH, height: 240, backgroundColor: COLORS.orange },
    },
      h("span", { style: { fontSize: 120, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY } }, "Q."),
    ),
    h("div", { style: { display: "flex", padding: "40px 80px" } },
      h("span", {
        style: { fontSize: 60, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" },
      }, slide.questionJp ?? ""),
    ),
    h("div", {
      style: { display: "flex", flexDirection: "column", padding: "0 70px", gap: 20, flex: 1 },
    },
      ...options.map((opt) =>
        h("div", {
          style: {
            display: "flex", alignItems: "center", width: "100%", padding: "24px 30px",
            borderRadius: 24, backgroundColor: COLORS.white, border: "2px solid #E0E0E0", gap: 20,
          },
        },
          h("div", {
            style: {
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(0,188,212,0.25)", flexShrink: 0,
            },
          },
            h("span", { style: { fontSize: 34, fontWeight: 700, color: "#006064", fontFamily: FONT_FAMILY } }, opt.label),
          ),
          h("span", {
            style: { fontSize: 46, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" },
          }, opt.text),
        ),
      ),
    ),
    h("div", { style: { display: "flex", justifyContent: "center", padding: 30 } },
      h("div", {
        style: {
          display: "flex", alignItems: "center", justifyContent: "center",
          paddingLeft: 60, paddingRight: 60, paddingTop: 16, paddingBottom: 16,
          borderRadius: 33, backgroundColor: "rgba(0,188,212,0.25)",
        },
      },
        h("span", { style: { fontSize: 38, fontWeight: 700, color: "#00695C", fontFamily: FONT_FAMILY } }, "スワイプで答え合わせ"),
      ),
    ),
    bottomBar(),
  );
}
