import { groqChat } from "../groq";
import type { ContentPlan } from "./types";

const COMMON_HASHTAGS = "#バリ島 #バリ旅行 #バリ島留学 #バリリンガル #海外旅行 #インドネシア #バリ島情報 #バリ島おすすめ";

const CATEGORY_HASHTAGS: Record<string, string> = {
  cafe: "#バリ島カフェ",
  spot: "#バリ島観光",
  food: "#バリ島グルメ",
  beach: "#バリ島ビーチ",
  lifestyle: "#バリ島移住",
  cost: "#バリ島物価",
  visa: "#バリ島ビザ",
  culture: "#バリ島文化",
};

const LINE_CTA = `---
留学の費用が気になったら
プロフィールのLINEから無料で費用表を受け取れます`;

export function buildCaptionPrompt(plan: ContentPlan): string {
  const slidesSummary = plan.slides
    .filter((s) => s.slideType === "point")
    .map((s) => `- ${s.heading}: ${s.body.slice(0, 80)}`)
    .join("\n");

  return `Instagramカルーセル投稿のキャプションを書いてください。

フォーマット: ${plan.formatName}
カテゴリ: ${plan.category}
フック（表紙）: ${plan.hook}
スライド内容:
${slidesSummary}

条件:
- 1行目: フック文（表紙と同じか、少し変えたもの）
- 2-5行: 投稿内容の要約（読みたくなる書き方）
- バリリンガルの直接宣伝なし
- 自然体で、テンプレ感のない文体
- 200文字以内

キャプション本文のみを返してください（ハッシュタグ不要）。`;
}

export function formatCaption(
  hook: string,
  body: string,
  ctaText: string,
  category: string,
): string {
  const catTag = CATEGORY_HASHTAGS[category] ?? "#バリ島";
  const hashtags = `${COMMON_HASHTAGS} ${catTag}`;
  return [hook, "", body, "", LINE_CTA, "", hashtags].join("\n");
}

export async function generateCaption(
  groqApiKey: string,
  plan: ContentPlan,
): Promise<string> {
  const prompt = buildCaptionPrompt(plan);
  const body = await groqChat(groqApiKey, [
    { role: "user", content: prompt },
  ], { temperature: 0.8, maxTokens: 512 });

  return formatCaption(plan.hook, body.trim(), plan.ctaText, plan.category);
}
