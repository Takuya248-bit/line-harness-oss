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

export function buildPromptForV2Plan(
  category: string,
  area: string,
  neta: NetaEntry[],
): string {
  const netaList = neta
    .map((n) => `- ${n.title}: ${n.content.slice(0, 200)}`)
    .join("\n");

  return `あなたはInstagramカルーセル投稿の構成作家です。

エリア: ${area}
カテゴリ: ${category}
使えるネタ:
${netaList}

以下のJSONスキーマに従い、${area}の${category}を紹介するカルーセル投稿の構成をJSON形式で作成してください。

条件:
- spotsDataは5件（spotNumber 1〜5）
- description は80文字以内（その場所の魅力・特徴・雰囲気を具体的に）
- area, priceLevel, highlight は必須
- summaryData.spots[].oneLiner は20文字以内
- imageUrlフィールドは含めない
- 必ずJSONのみを返す（説明文・マークダウン不要）

JSONスキーマ:
{
  "title": "エリア名+カテゴリを表す日本語タイトル",
  "coverData": {
    "catchCopy": "読者を引きつけるキャッチコピー（例: チャングーで行きたい！）",
    "mainTitle": "カテゴリ名（例: おしゃれカフェ）",
    "countLabel": "5選"
  },
  "spotsData": [
    {
      "spotNumber": 1,
      "spotName": "スポット名",
      "description": "80文字以内の説明（魅力・特徴・雰囲気を具体的に）",
      "area": "エリア名（例: ウブド、スミニャック、チャングー）",
      "priceLevel": "$ / $$ / $$$",
      "highlight": "おすすめポイント（30文字以内）"
    }
  ],
  "summaryData": {
    "title": "まとめタイトル",
    "spots": [
      {
        "number": 1,
        "name": "スポット名",
        "oneLiner": "15文字以内のひとこと"
      }
    ]
  }
}`;
}

export function buildPromptForV2PlanWithRealSpots(
  category: string,
  area: string,
  spots: { name: string; area: string; website?: string | null }[],
  infoStyle: "simple" | "rich" | "practical",
  neta: NetaEntry[],
): string {
  const netaList = neta
    .map((n) => `- ${n.title}: ${n.content.slice(0, 200)}`)
    .join("\n");

  const spotsList = spots
    .map((s, i) => `${i + 1}. ${s.name}（${s.area}）${s.website ? ` / ${s.website}` : ""}`)
    .join("\n");

  const styleFields = (() => {
    if (infoStyle === "simple") {
      return `      "description": "80文字以内の説明（魅力・特徴・雰囲気を具体的に）",
      "area": "エリア名",
      "priceLevel": "$ / $$ / $$$",
      "highlight": "おすすめポイント（30文字以内）"`;
    }
    if (infoStyle === "rich") {
      return `      "description": "80文字以内の説明（魅力・特徴・雰囲気を具体的に）",
      "area": "エリア名",
      "priceLevel": "$ / $$ / $$$",
      "highlight": "おすすめポイント（30文字以内）"`;
    }
    // practical
    return `      "description": "80文字以内の説明（魅力・特徴・雰囲気を具体的に）",
      "area": "エリア名",
      "priceLevel": "$ / $$ / $$$",
      "hours": "営業時間（例: 8:00-22:00）",
      "recommendedMenu": "おすすめメニュー（20文字以内）"`;
  })();

  return `あなたはInstagramカルーセル投稿の構成作家です。

エリア: ${area}
カテゴリ: ${category}
使えるネタ:
${netaList}

以下は実在するスポットです。名前はそのまま使ってください:
${spotsList}

以下のJSONスキーマに従い、${area}の${category}を紹介するカルーセル投稿の構成をJSON形式で作成してください。

条件:
- spotsDataは上記スポットリストの件数（spotNumber 1〜${spots.length}）
- description は50文字以内
- summaryData.spots[].oneLiner は15文字以内
- imageUrlフィールドは含めない
- 必ずJSONのみを返す（説明文・マークダウン不要）

JSONスキーマ:
{
  "title": "エリア名+カテゴリを表す日本語タイトル",
  "coverData": {
    "catchCopy": "読者を引きつけるキャッチコピー（例: チャングーで行きたい！）",
    "mainTitle": "カテゴリ名（例: おしゃれカフェ）",
    "countLabel": "${spots.length}選"
  },
  "spotsData": [
    {
      "spotNumber": 1,
      "spotName": "実在店名（リストの名前をそのまま使用）",
      "area": "エリア名",
${styleFields}
    }
  ],
  "summaryData": {
    "title": "まとめタイトル",
    "spots": [
      {
        "number": 1,
        "name": "スポット名",
        "oneLiner": "15文字以内のひとこと"
      }
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

function reelFormatBlock(format: ReelFormat, category: string): string {
  switch (format) {
    case "ranking":
      return `構造: バリ島の「${category}」をTOP5形式で紹介する。
各ポイント（factsの各要素）は1行15文字以内の事実だけを書く。`;
    case "cost_appeal":
      return `構造: 費用・コストの魅力を軸に紹介する。
具体的な金額（月○万円、1食○円など）を必ず各ポイントに含める。`;
    case "before_after":
      return `構造: ビフォー状態とアフター状態を対比させた「変化ストーリー」にする。
各factはビフォー→アフターの対比が伝わる1行にまとめる。`;
    case "routine":
      return `構造: 時系列で1日の流れを描く。
factsは5〜7件。朝から夜までのシーン順に並べる。`;
    case "relatable":
      return `構造: 留学生・海外在住者が共感する「あるある」を5選で紹介する。
各factは共感ポイントが一発で伝わる短文にする。`;
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

  return `あなたはInstagramリール（縦動画）の台本作家です。

カテゴリ: ${category}
リールフォーマット: ${format}
使えるネタ:
${netaList}

${formatRules}

${hookRules}

以下の条件でリール用の構成をJSON形式で作成してください:
- バリリンガルの直接宣伝はしない。Tips・体験談ベースで価値提供
- hookText: 冒頭フック（画面上・フック用。hookStyleの指定に従う）
- facts: 本編各シーン用の短いテキスト（フォーマットの文字数・件数ルールに厳密に従う）
- narrationTexts: 各factスライドの音声読み上げ用。factsと同じ要素数。口語で自然に（generate-reel.mjs のTTS想定）
- ctaText: 締めのCTA（「保存して」「プロフのLINEから」などから適宜選択）

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
      : "プロフィールのリンクからLINEで詳しく";

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
