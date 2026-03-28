import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, FONT_FAMILY } from "./styles";
import { h, bottomBar, lightBackground } from "./base";

export function buildStoryNode(slide: SlideData): SatoriNode {
  return lightBackground(
    h("div", {
      style: { display: "flex", flexDirection: "column", flex: 1, padding: "60px 50px", gap: 24 },
    },
      h("span", { style: { fontSize: 56, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word" } }, slide.storyTitle ?? ""),
      h("div", { style: { width: 120, height: 4, backgroundColor: COLORS.turquoise, borderRadius: 2 } }),
      h("div", {
        style: { display: "flex", flex: 1, width: "100%", padding: 40, backgroundColor: COLORS.white, borderRadius: 24, opacity: 0.92 },
      },
        h("span", { style: { fontSize: 42, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, wordBreak: "break-word", lineHeight: 1.6 } }, slide.storyBody ?? ""),
      ),
    ),
    bottomBar(),
  );
}
