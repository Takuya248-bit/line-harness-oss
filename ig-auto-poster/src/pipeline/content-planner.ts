import { groqJson } from "../groq";
import type {
  ContentPlan,
  ContentType,
  HookStyle,
  NetaEntry,
  ReelFormat,
  ReelPlan,
  SlideContent,
} from "./types";

interface BuzzFormat {
  name: string;
  weight: number;
}

/** 全コンテンツプロンプト共通の宣伝・トーン制約 */
const NO_DIRECT_PROMO_RULE =
  "バリリンガル・語学学校・留学費用の直接宣伝はしない。一般的なバリ島情報・英語学習ノウハウとして価値提供する";

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
- ${NO_DIRECT_PROMO_RULE}

JSON形式:
{
  "hook": "表紙のキャッチコピー",
  "slides": [
    {"heading": "見出し", "body": "本文", "icon": "絵文字1つ", "slideType": "cover|point|summary|cta"}
  ],
  "ctaText": "CTA文言"
}`;
}

export function buildPromptForV2Plan(
  category: string,
  area: string,
  neta: NetaEntry[],
): string {
  const netaList = neta
    .map((n) => `- ${n.title}: ${n.content.slice(0, 200)}`)
    .join("\n");

  const categoryGuide: Record<string, string> = {
    cafe: "実在するバリ島の人気カフェを紹介。店の雰囲気、メニューの特徴、Wi-Fi・電源の有無など具体的に。",
    spot: "実在するバリ島の観光スポットを紹介。アクセス、入場料、ベストな時間帯など実用情報を含める。",
    food: "実在するバリ島のレストラン・ワルン（食堂）を紹介。看板メニュー、価格帯、営業時間など具体的に。",
    beach: "実在するバリ島のビーチを紹介。波の状態、混雑度、周辺施設、サンセットの美しさなど具体的に。",
    lifestyle: "バリ島での実際の生活に役立つスポットを紹介。コワーキング、ジム、マーケットなど。",
    cost: "バリ島の物価・コストに関する実用情報。具体的な金額（ルピア/円）を含める。",
    culture: "バリ島の文化体験スポットを紹介。寺院、伝統舞踊、祭り、工芸など。体験方法と注意点を含める。",
  };

  return `あなたはバリ島在住のインスタグラマーです。実際に訪れた場所の情報を発信しています。

エリア: ${area}
カテゴリ: ${category}
カテゴリガイド: ${categoryGuide[category] ?? "実在するバリ島の情報を紹介。"}
参考ネタ:
${netaList}

重要ルール:
- ${NO_DIRECT_PROMO_RULE}
- 実在する場所・店のみ紹介する（架空の名前は絶対NG）
- descriptionは具体的な体験談風に書く（「〜がおすすめ」「〜で有名」等の一般論は避ける）
- 各スポットのエリア名は正確に（ウブド、スミニャック、チャングー、クタ、サヌール、ヌサドゥア等）

以下のJSONスキーマに従い作成してください。JSONのみを返してください。

{
  "title": "${category}に合った魅力的な日本語タイトル",
  "coverData": {
    "catchCopy": "思わずスワイプしたくなるキャッチコピー",
    "mainTitle": "${category}に合ったメインタイトル（例: 絶品グルメ、映えカフェ）",
    "countLabel": "5選"
  },
  "spotsData": [
    {
      "spotNumber": 1,
      "spotName": "実在する店名/スポット名",
      "description": "150文字以内。具体的な体験（メニュー名、価格、雰囲気、おすすめ時間帯、周辺情報など）を盛り込む。テンプレ的な表現は避け、行った人にしかわからないリアルな情報を入れる",
      "area": "正確なエリア名",
      "priceLevel": "$ / $$ / $$$（実際の価格帯）",
      "highlight": "一番の魅力を30文字以内で（例: ナシゴレン150円で絶品）"
    }
  ],
  "summaryData": {
    "title": "まとめ",
    "spots": [
      { "number": 1, "name": "スポット名", "oneLiner": "20文字以内の特徴" }
    ]
  }
}`;
}

export function buildPromptForV2PlanWithRealSpots(
  category: string,
  area: string,
  spots: {
    name: string;
    area: string;
    website?: string | null;
    rating?: number | null;
    review_count?: number | null;
    reviews_json?: string | null;
    opening_hours?: string | null;
    price_level?: string | null;
  }[],
  infoStyle: "simple" | "rich" | "practical",
  neta: NetaEntry[],
): string {
  void infoStyle; // 現在はrich固定

  const netaList = neta
    .map((n) => `- ${n.title}: ${n.content.slice(0, 200)}`)
    .join("\n");

  const spotsList = spots
    .map((s, i) => {
      let line = `${i + 1}. ${s.name}（${s.area}）`;
      if (s.rating) line += ` ★${s.rating}`;
      if (s.review_count) line += `（${s.review_count}件）`;
      if (s.opening_hours) line += `\n   営業: ${s.opening_hours.split("\n")[0]}`;
      if (s.reviews_json) {
        try {
          const reviews = JSON.parse(s.reviews_json) as { text: string; rating: number }[];
          for (let ri = 0; ri < reviews.length; ri++) {
            line += `\n   口コミ${ri + 1}: 「${reviews[ri]!.text.slice(0, 200)}」`;
          }
        } catch {
          /* ignore invalid json */
        }
      }
      return line;
    })
    .join("\n\n");

  return `あなたはバリ島に住んでいて、実際にこれらのお店に通っているインスタグラマーです。
友達に「ここ絶対行って！」とおすすめするような、熱量のある文章を書いてください。

カテゴリ: ${category}
参考ネタ:
${netaList}

以下は実在するスポットと、実際の来店者の口コミです:
${spotsList}

文章のルール:
- ${NO_DIRECT_PROMO_RULE}
- スポット名は変えない。口コミに書かれている事実（料理名、スタッフ名、雰囲気）をたっぷり使う
- 口コミにない情報を捏造しない。ただし口コミの情報を膨らませて魅力的に書くのはOK
- スタッフや口コミ投稿者の個人名は使わない（Antari, Gita等は省く）
- 「〜が魅力」「〜で有名」「〜がおすすめ」のような薄い表現は禁止。具体的に書く
- 読んだ人が「行きたい！」と思える、五感に訴える文章にする（香り、味、空間の雰囲気、店員さんの笑顔など）
- 価格情報より体験の質を優先して書く

JSONのみを返してください。

{
  "title": "${category}に合った、思わず保存したくなる日本語タイトル",
  "coverData": {
    "catchCopy": "情報ギャップを作るキャッチコピー（例: まだ知らないの？）",
    "mainTitle": "メインタイトル",
    "countLabel": "${spots.length}選"
  },
  "spotsData": [
    {
      "spotNumber": 1,
      "spotName": "実在店名（リストの名前をそのまま使用）",
      "description": "口コミベースの紹介文。2〜3行（80〜120文字）で、どんな体験ができるか具体的に書く。五感に訴える表現で行きたくなる文章に",
      "area": "正確なエリア名",
      "bestDish": "口コミで評判の料理やドリンク（例: サクサクのクロワッサンサンド）（30文字以内）",
      "atmosphere": "空間の特徴を一言で（例: 緑に囲まれた隠れ家）（20文字以内）",
      "hours": "営業時間（例: 7:00-22:00）",
      "highlight": "一番の魅力を凝縮（20文字以内）"
    }
  ],
  "summaryData": {
    "title": "まとめ",
    "spots": [
      { "number": 1, "name": "スポット名", "oneLiner": "行きたくなる一言（25文字以内）" }
    ]
  }
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

/** リール形式ごとのDM誘導CTAの骨子（モデルがctaTextに反映する） */
export function ctaForCategory(format: ReelFormat): string {
  switch (format) {
    case "bali_tips":
      return `ctaTextの方針: 動画のテーマに合わせ「カフェ」など一言キーワードをコメントでもらい、DMで場所・続き・補足に誘導する一文にする（サービス名の直宣伝は書かない）。`;
    case "english_phrase":
      return `ctaTextの方針: 「英語」とコメントでもらい、DMで例文・ニュアンスの続きに誘導する一文にする（教室紹介や料金の話はしない）。`;
    case "bali_english":
      return `ctaTextの方針: 「バリ英語」や表現のキーワードをコメントでもらい、DMで現地用例の補足に誘導する一文にする。`;
    case "bali_life":
      return `ctaTextの方針: 「日常」や気になる生活トピックをコメントでもらい、DMで金額・手続きなどの続きに誘導する一文にする。`;
    case "relatable":
      return `ctaTextの方針: 「あるある」や自分の体験ワードをコメントでもらい、DMで共感ネタの続きに誘導する一文にする。`;
    default: {
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}

function reelFormatBlock(format: ReelFormat, category: string): string {
  switch (format) {
    case "bali_tips":
      return `構造: バリ島の「${category}」をTOP5形式で紹介する。具体的な店名・場所名を必ず含める。
各ポイント（factsの各要素）は1行15文字以内の具体的事実だけを書く。`;
    case "english_phrase":
      return `構造: ネイティブが実際に使う英語フレーズを紹介する。日本語話者の言い回しとの違いを対比する。
各factは「フレーズ＋一言の使い方／日本語との違い」が伝わる1行にする。`;
    case "bali_english":
      return `構造: バリ島で使える英語表現や、インドネシア人の英語あるある（現地の英語事情）を扱う。
各factは現場で使える短文にする。`;
    case "bali_life":
      return `構造: バリ島在住者の日常を時系列で紹介する。具体的な金額（ルピア等）・場所名を含める。
factsは5〜7件。`;
    case "relatable":
      return `構造: 海外生活の「あるある」を扱う。日本との文化の違いで共感を生む内容にする。
各factは共感ポイントが一発で伝わる短文にする（5選程度）。`;
    default: {
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}

function hookStyleBlock(hookStyle: HookStyle): string {
  switch (hookStyle) {
    case "question":
      return `フックの書き方（hookText）: 「知ってた？」系の問いかけで冒頭の情報ギャップを作る。`;
    case "assertion":
      return `フックの書き方（hookText）: 「これが正解」系の断定・強い主張で止める。`;
    case "number_first":
      return `フックの書き方（hookText）: 数字先行（例: 「月3万円で〜」）で具体性から入る。`;
    case "pov":
      return `フックの書き方（hookText）: 「POV: あなたが〜」形式の主観視点で始める。`;
    default: {
      const _exhaustive: never = hookStyle;
      return _exhaustive;
    }
  }
}

export function buildPromptForReelPlan(
  format: ReelFormat,
  category: string,
  neta: NetaEntry[],
  hookStyle: HookStyle,
): string {
  const netaList = neta
    .map((n) => `- ${n.title}: ${n.content.slice(0, 200)}`)
    .join("\n");

  const formatRules = reelFormatBlock(format, category);
  const hookRules = hookStyleBlock(hookStyle);
  const ctaRules = ctaForCategory(format);

  return `あなたはInstagramリール（縦動画）の台本作家です。

カテゴリ: ${category}
リールフォーマット: ${format}
使えるネタ:
${netaList}

${formatRules}

${hookRules}

${ctaRules}

以下の条件でリール用の構成をJSON形式で作成してください:
- ${NO_DIRECT_PROMO_RULE}
- hookText: 冒頭フック（画面上・フック用。hookStyleの指定に従う）
- facts: 本編各シーン用の短いテキスト（フォーマットの文字数・件数ルールに厳密に従う）
- narrationTexts: 各factスライドの音声読み上げ用。factsと同じ要素数。口語で自然に（generate-reel.mjs のTTS想定）
- ctaText: 締めのCTA。上記「ctaTextの方針」に沿い、コメント→DMの流れで自然な一文にする

必ずJSONのみを返す（説明文・マークダウン不要）。

JSON形式:
{
  "hookText": "フック文",
  "facts": ["ファクト1", "..."],
  "narrationTexts": ["ナレーション1", "..."],
  "ctaText": "CTA文言"
}`;
}

interface GroqReelPlanResponse {
  hookText?: string;
  facts?: string[];
  narrationTexts?: string[];
  ctaText?: string;
}

export function parseReelPlan(
  json: string,
  reelFormat: ReelFormat,
  hookStyle: HookStyle,
): ReelPlan {
  const parsed = JSON.parse(json) as GroqReelPlanResponse;
  const hookText =
    typeof parsed.hookText === "string" && parsed.hookText.trim().length > 0
      ? parsed.hookText.trim()
      : "バリ島、知ってた？";
  const facts = Array.isArray(parsed.facts)
    ? parsed.facts.map((f) => String(f).trim()).filter((f) => f.length > 0)
    : [];
  let narrationTexts = Array.isArray(parsed.narrationTexts)
    ? parsed.narrationTexts.map((n) => String(n).trim()).filter((n) => n.length > 0)
    : [];
  if (narrationTexts.length !== facts.length) {
    narrationTexts = facts.map((f, i) => narrationTexts[i] ?? f);
  }
  const ctaText =
    typeof parsed.ctaText === "string" && parsed.ctaText.trim().length > 0
      ? parsed.ctaText.trim()
      : "気になる点をコメントで一言。DMで続き送るね";

  return {
    hookText,
    facts,
    narrationTexts,
    ctaText,
    reelFormat,
    hookStyle,
  };
}

export async function generateReelPlan(
  groqApiKey: string,
  format: ReelFormat,
  category: string,
  neta: NetaEntry[],
  hookStyle: HookStyle,
): Promise<ReelPlan> {
  const prompt = buildPromptForReelPlan(format, category, neta, hookStyle);
  const result = await groqJson<GroqReelPlanResponse>(groqApiKey, [{ role: "user", content: prompt }], {
    temperature: 0.8,
    maxTokens: 2048,
  });

  return parseReelPlan(JSON.stringify(result), format, hookStyle);
}
