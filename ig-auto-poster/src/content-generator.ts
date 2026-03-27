import Anthropic from "@anthropic-ai/sdk";
import type { ContentType, ContentItem, SlideData } from "./content-data";

const TEMPLATE_TYPES: ContentType[] = [
  "list", "quiz", "before_after", "situation",
  "story", "student_mistake", "bali_report",
];

const SYSTEM_PROMPT = `あなたはバリ島の語学学校「バリリンガル」のInstagramコンテンツ作成者です。
ターゲット: 英語学習に興味がある日本人（20-40代）
トーン: カジュアルで親しみやすく、実用的
コンテンツは日本人が実際にバリ島や海外で使える英語表現を教える内容です。

必ず以下のJSON形式で返してください。それ以外のテキストは含めないでください。`;

function buildPromptForType(
  templateType: ContentType,
  pastThemes: string[],
): string {
  const pastList = pastThemes.length > 0
    ? `\n\n以下のテーマは既出です。これらと被らないテーマにしてください:\n${pastThemes.map((t) => `- ${t}`).join("\n")}`
    : "";

  const typeInstructions: Record<ContentType, string> = {
    list: `リスト型コンテンツを作成してください。
タイトル（2行以内、改行は\\nで）、サブタイトル、5つのフレーズ（英語、日本語訳、例文英語、例文日本語）を含めてください。

JSON形式:
{
  "type": "list",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "phrases": [
    { "phraseEn": "英語", "phraseJp": "日本語", "exampleEn": "例文英語", "exampleJp": "例文日本語" }
  ]
}`,
    quiz: `クイズ型コンテンツを作成してください。
タイトル、2問のクイズ（日本語の問題文、3択、正解、英語回答、日本語回答、解説）を含めてください。

JSON形式:
{
  "type": "quiz",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "quizzes": [
    { "questionJp": "問題", "optionA": "A", "optionB": "B", "optionC": "C", "correctOption": "A", "answerEn": "英語", "answerJp": "日本語", "explanation": "解説" }
  ]
}`,
    before_after: `Before/After型コンテンツを作成してください。
日本人がよく使う不自然な英語（Before）と、ネイティブが使う自然な表現（After）を5ペア作成。

JSON形式:
{
  "type": "before_after",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "pairs": [
    { "beforeEn": "不自然英語", "beforeJp": "日本語訳", "afterEn": "自然英語", "afterJp": "日本語訳", "tip": "ポイント解説" }
  ]
}`,
    situation: `シチュエーション型コンテンツを作成してください。
特定の場面で使える会話フレーズとレスポンスを5セット作成。

JSON形式:
{
  "type": "situation",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "situations": [
    { "scene": "場面名", "sceneTitle": "場面タイトル", "phraseEn1": "フレーズ英語", "phraseJp1": "フレーズ日本語", "responseEn": "レスポンス英語", "responseJp": "レスポンス日本語", "point": "ポイント" }
  ]
}`,
    story: `ストーリー型コンテンツを作成してください。
バリ島での実体験風の英語学習エピソードを5スライド分作成。

JSON形式:
{
  "type": "story",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "stories": [
    { "storyTitle": "エピソードタイトル", "storyBody": "本文（100-150文字）" }
  ]
}`,
    student_mistake: `生徒あるある型コンテンツを作成してください。
日本人が英語学習でよくやる間違いを5つ作成。

JSON形式:
{
  "type": "student_mistake",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "mistakes": [
    { "mistakeNumber": "1", "mistakeEn": "間違い英語", "correctEn": "正しい英語", "mistakeExplanation": "解説" }
  ]
}`,
    bali_report: `バリ現地レポ型コンテンツを作成してください。
バリ島の場所・場面で実際に使える英語フレーズを5つ作成。

JSON形式:
{
  "type": "bali_report",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "reports": [
    { "locationName": "場所名", "phraseEn": "フレーズ英語", "phraseJp": "フレーズ日本語", "usageTip": "使い方のコツ" }
  ]
}`,
  };

  return typeInstructions[templateType] + pastList;
}

function parseResponse(templateType: ContentType, raw: unknown, nextId: number): ContentItem {
  const data = raw as Record<string, unknown>;
  const title = (data.title as string) ?? "";
  const subtitle = (data.subtitle as string) ?? "";
  const slides: SlideData[] = [
    { slideNumber: 1, slideType: "cover" },
  ];

  let slideNum = 2;

  switch (templateType) {
    case "list": {
      const phrases = (data.phrases as Record<string, string>[]) ?? [];
      for (const p of phrases) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          phraseEn: p.phraseEn,
          phraseJp: p.phraseJp,
          exampleEn: p.exampleEn,
          exampleJp: p.exampleJp,
        });
      }
      break;
    }
    case "quiz": {
      const quizzes = (data.quizzes as Record<string, string>[]) ?? [];
      for (const q of quizzes) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          questionJp: q.questionJp,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
        });
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          correctOption: q.correctOption,
          answerEn: q.answerEn,
          answerJp: q.answerJp,
          explanation: q.explanation,
        });
      }
      break;
    }
    case "before_after": {
      const pairs = (data.pairs as Record<string, string>[]) ?? [];
      for (const p of pairs) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          beforeEn: p.beforeEn,
          beforeJp: p.beforeJp,
          afterEn: p.afterEn,
          afterJp: p.afterJp,
          tip: p.tip,
        });
      }
      break;
    }
    case "situation": {
      const situations = (data.situations as Record<string, string>[]) ?? [];
      for (const s of situations) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          scene: s.scene,
          sceneTitle: s.sceneTitle,
          phraseEn1: s.phraseEn1,
          phraseJp1: s.phraseJp1,
          responseEn: s.responseEn,
          responseJp: s.responseJp,
          point: s.point,
        });
      }
      break;
    }
    case "story": {
      const stories = (data.stories as Record<string, string>[]) ?? [];
      for (const s of stories) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          storyTitle: s.storyTitle,
          storyBody: s.storyBody,
        });
      }
      break;
    }
    case "student_mistake": {
      const mistakes = (data.mistakes as Record<string, string>[]) ?? [];
      for (const m of mistakes) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          mistakeNumber: m.mistakeNumber,
          mistakeEn: m.mistakeEn,
          correctEn: m.correctEn,
          mistakeExplanation: m.mistakeExplanation,
        });
      }
      break;
    }
    case "bali_report": {
      const reports = (data.reports as Record<string, string>[]) ?? [];
      for (const r of reports) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          locationName: r.locationName,
          phraseEn1: r.phraseEn,
          phraseJp1: r.phraseJp,
          usageTip: r.usageTip,
        });
      }
      break;
    }
  }

  slides.push({ slideNumber: slideNum, slideType: "cta", leadMagnet: "レベル別英語学習ロードマップ" });

  return { id: nextId, type: templateType, title, subtitle, slides };
}

function generateCaption(title: string): string {
  const hashtags = "#英語学習 #英会話 #英語フレーズ #バリ島 #バリ島留学 #英語勉強法 #ネイティブ英語 #留学 #海外生活 #バリリンガル";
  return `${title.replaceAll("\\n", " ")}\n\n保存して何度も見返してね！\n好きな英単語をコメントで教えてね\n毎日使える英語を発信中\n\n${hashtags}`;
}

export async function generateContent(
  apiKey: string,
  db: D1Database,
): Promise<{ content: ContentItem; caption: string }> {
  const client = new Anthropic({ apiKey });

  const templateType = TEMPLATE_TYPES[Math.floor(Math.random() * TEMPLATE_TYPES.length)];

  const pastRows = await db
    .prepare("SELECT json_extract(content_json, '$.title') as title FROM generated_content ORDER BY id DESC LIMIT 50")
    .all<{ title: string }>();
  const pastThemes = pastRows.results.map((r) => r.title).filter(Boolean);

  const maxIdRow = await db
    .prepare("SELECT COALESCE(MAX(id), 1000) + 1 as next_id FROM generated_content")
    .first<{ next_id: number }>();
  const nextId = maxIdRow?.next_id ?? 1001;

  const prompt = buildPromptForType(templateType, pastThemes);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude API returned no text content");
  }

  const raw = JSON.parse(textBlock.text);
  const content = parseResponse(templateType, raw, nextId);
  const caption = generateCaption(content.title);

  await db
    .prepare("INSERT INTO generated_content (template_type, content_json, caption, status) VALUES (?, ?, ?, 'pending_review')")
    .bind(templateType, JSON.stringify(content), caption)
    .run();

  return { content, caption };
}
