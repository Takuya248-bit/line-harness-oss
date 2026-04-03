import type {
  ContentType,
  GeneratedText,
  NightbatchConfig,
  Pattern,
  Topic,
} from "./types.js";

const FORMAT_LABELS: Record<Pattern["format"], string> = {
  education: "教育系Tips（実用的な学び・ノウハウ）",
  emotion: "感情系共感（共感・励まし・ストーリー性）",
  numbers: "数字系ランキング（箇条書き・順位・比較）",
  daily: "日常系Vlog（ライフスタイル・体験談・親近感）",
};

const VISUAL_LABELS: Record<Pattern["visualStyle"], string> = {
  bright: "明るいカラフル",
  chic: "シックミニマル",
  handwritten: "手書き温かみ",
  cinematic: "映画的・ドラマチック",
};

const TARGET_LABELS: Record<Pattern["target"], string> = {
  study_abroad: "バリ留学検討者",
  english_learner: "英語学習者",
  bali_traveler: "バリ旅行者",
};

function contentTypeHint(contentType: ContentType): string {
  if (contentType === "reel") {
    return "コンテンツ種別はリール。台本（script）は口語で短めのカット割りを意識し、フック→本編→締めの流れにする。";
  }
  return "コンテンツ種別はフィード投稿。キャプション（caption）は読みやすい改行・絵文字は控えめでよい。";
}

function buildUserPrompt(topic: Topic, pattern: Pattern, contentType: ContentType): string {
  const formatJa = FORMAT_LABELS[pattern.format];
  const visualJa = VISUAL_LABELS[pattern.visualStyle];
  const targetJa = TARGET_LABELS[pattern.target];

  return [
    "あなたはInstagram向けコンテンツのコピーライター兼ビジュアルディレクターです。",
    "次のネタとパターンに沿い、指定キーのみのJSONオブジェクトを1つだけ返してください。",
    "",
    "## 出力JSONキー（必須・英語キー名のまま）",
    "- caption: string（日本語。投稿キャプション本文）",
    "- script: string（日本語。リール想定の台本。フィードの場合も空にせず短いナレーション案でよい）",
    "- hashtags: string（ハッシュタグをスペース区切り。「#」付き）",
    "- imagePrompt: string（静止画生成向け。英語で具体的に。上のビジュアルトーンを反映）",
    "- videoPrompt: string（動画／シーン生成向け。英語で具体的に。上のビジュアルトーンを反映）",
    "",
    "## パターン",
    `- フォーマット: ${pattern.format} → ${formatJa}`,
    `- ビジュアル: ${pattern.visualStyle} → ${visualJa}`,
    `- ターゲット: ${pattern.target} → ${targetJa}`,
    contentTypeHint(contentType),
    "",
    "## ネタ",
    `- id: ${topic.id}`,
    `- title: ${topic.title}`,
    `- body:\n${topic.body}`,
    "",
    "文体はターゲットに合わせ自然な日本語。ハッシュタグは5〜12個程度。",
    "imagePromptとvideoPromptはComfyUI等にそのまま渡せる英語プロンプトにする（被写体・照明・構図・スタイル）。",
  ].join("\n");
}

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

function parseGeneratedJson(raw: string): GeneratedText {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Ollama returned JSON that is not an object");
  }
  const o = parsed as Record<string, unknown>;
  const caption = o.caption;
  const script = o.script;
  const hashtags = o.hashtags;
  const imagePrompt = o.imagePrompt;
  const videoPrompt = o.videoPrompt;

  const fields = [caption, script, hashtags, imagePrompt, videoPrompt];
  if (fields.some(f => typeof f !== "string")) {
    throw new Error(
      "Ollama JSON missing string fields: caption, script, hashtags, imagePrompt, videoPrompt",
    );
  }

  return {
    caption: caption as string,
    script: script as string,
    hashtags: hashtags as string,
    imagePrompt: imagePrompt as string,
    videoPrompt: videoPrompt as string,
  };
}

/**
 * Ollama /api/generate（format: json, stream: false）でキャプション・台本・タグ・画像/動画プロンプトを生成する。
 */
export async function generateText(
  topic: Topic,
  pattern: Pattern,
  contentType: ContentType,
  config: NightbatchConfig,
): Promise<GeneratedText> {
  const base = config.ollamaBaseUrl.replace(/\/+$/, "");
  const url = `${base}/api/generate`;
  const prompt = buildUserPrompt(topic, pattern, contentType);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt,
      stream: false,
      format: "json",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama /api/generate failed: ${res.status} ${res.statusText} ${text}`);
  }

  const data = (await res.json()) as OllamaGenerateResponse;
  if (typeof data.error === "string" && data.error.length > 0) {
    throw new Error(`Ollama error: ${data.error}`);
  }
  if (typeof data.response !== "string") {
    throw new Error("Ollama response missing string field \"response\"");
  }

  return parseGeneratedJson(data.response);
}
