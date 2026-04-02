import { groqJson } from "../groq";
import type { ContentPlan, ContentType, NetaEntry, SlideContent } from "./types";

interface BuzzFormat {
  name: string;
  weight: number;
}

export function selectBuzzFormat(formats: BuzzFormat[]): string {
  const total = formats.reduce((s, f) => s + f.weight, 0);
  if (total <= 0 || formats.length === 0) return "知ってた系";
  let rand = Math.random() * total;
  for (const f of formats) {
    rand -= f.weight;
    if (rand <= 0) return f.name;
  }
  return formats[0]!.name;
}

export function buildPromptForPlan(
  formatName: string,
  category: string,
  neta: NetaEntry[],
): string {
  const netaList = neta
    .map((n) => `- ${n.title}: ${n.content.slice(0, 200)}`)
    .join("\n");

  return `あなたはInstagramカルーセル投稿の構成作家です。

フォーマット: 「${formatName}」
カテゴリ: ${category}
使えるネタ:
${netaList}

以下の条件でカルーセル投稿の構成をJSON形式で作成してください:
- 8-10枚のスライド構成
- 1枚目: 表紙（hookとなるキャッチコピー、8-10語、情報ギャップを作る）
- 2-8枚目: 1スライド1ポイント（見出し+2-3行の説明）
- 9枚目: まとめ（全ポイントをリスト形式で総括）
- 10枚目: CTA（「保存して」「友達に送って」「プロフのLINEから」のいずれか）
- フォーマット「${formatName}」のトーンに合わせる
- バリリンガルの直接宣伝はしない。Tips型で価値提供

JSON形式:
{
  "hook": "表紙のキャッチコピー",
  "slides": [
    {"heading": "見出し", "body": "本文", "icon": "絵文字1つ", "slideType": "cover|point|summary|cta"}
  ],
  "ctaText": "CTA文言"
}`;
}

interface GroqPlanResponse {
  hook: string;
  slides: { heading: string; body: string; icon?: string; slideType: string }[];
  ctaText: string;
}

export function parseContentPlan(
  json: string,
  contentType: ContentType,
  formatName: string,
  category: string,
  neta: NetaEntry[],
): ContentPlan {
  const parsed = JSON.parse(json) as GroqPlanResponse;
  const slides: SlideContent[] = parsed.slides.map((s) => ({
    heading: s.heading,
    body: s.body,
    icon: s.icon,
    slideType: (s.slideType as SlideContent["slideType"]) || "point",
  }));

  return {
    contentType,
    formatName,
    category,
    hook: parsed.hook,
    slides,
    ctaText: parsed.ctaText,
    neta,
  };
}

export async function generateContentPlan(
  groqApiKey: string,
  formatName: string,
  category: string,
  neta: NetaEntry[],
  contentType: ContentType = "carousel",
): Promise<ContentPlan> {
  const prompt = buildPromptForPlan(formatName, category, neta);
  const result = await groqJson<GroqPlanResponse>(groqApiKey, [
    { role: "user", content: prompt },
  ], { temperature: 0.8, maxTokens: 2048 });

  return parseContentPlan(JSON.stringify(result), contentType, formatName, category, neta);
}
