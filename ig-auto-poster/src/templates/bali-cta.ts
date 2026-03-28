import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, tropicalBackground, baliLogo, wrapText } from "./base";

export function buildBaliCtaNode(): SatoriNode {
  return tropicalBackground(
    baliLogo(),
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        gap: 40,
        padding: "0 60px",
      },
    },
      h("span", {
        style: {
          fontSize: 48,
          fontWeight: 900,
          color: "white",
          fontFamily: FONT_FAMILY,
          textAlign: "center",
        },
      }, "保存してバリ旅行の\n参考にしてね！"),
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#E67E22",
          borderRadius: 50,
          padding: "20px 60px",
        },
      },
        h("span", {
          style: {
            fontSize: 36,
            fontWeight: 900,
            color: "white",
            fontFamily: FONT_FAMILY,
          },
        }, "フォローで最新情報をGET"),
      ),
      h("span", {
        style: {
          fontSize: 30,
          fontWeight: 700,
          color: "rgba(255,255,255,0.8)",
          fontFamily: FONT_FAMILY,
          textAlign: "center",
        },
      }, "バリ島のおすすめスポットを\n毎日配信中！"),
    ),
  );
}
