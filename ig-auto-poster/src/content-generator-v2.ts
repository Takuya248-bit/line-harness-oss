import { searchPhotosForSpots } from "./unsplash";
import { fetchKnowledge, fetchGuardrails, incrementUseCount, formatKnowledgeForPrompt } from "./knowledge";
import type { BaliCoverData } from "./templates/bali-cover";
import type { BaliSpotData } from "./templates/bali-spot";
import type { BaliSummaryData } from "./templates/bali-summary";
import type { BaliContentV2 } from "./templates/index";

interface SpotInfo {
  name: string;
  area: string;
  description: string;
  hours: string;
  oneLiner: string;
}

interface GeneratedTopic {
  category: string;
  area: string;
  catchCopy: string;
  mainTitle: string;
  countLabel: string;
  spots: SpotInfo[];
}

interface CategoryWeight {
  category: string;
  weight: number;
}

const CATEGORY_KNOWLEDGE_MAP: Record<string, { categories: string[]; tags: string[] }> = {
  cafe: { categories: ["locale"], tags: ["bali_cafe"] },
  spot: { categories: ["locale"], tags: ["bali_area"] },
  food: { categories: ["locale"], tags: ["bali_food", "bali_cafe"] },
  beach: { categories: ["locale"], tags: ["bali_area"] },
  lifestyle: { categories: ["locale", "case"], tags: ["bali_cost", "bali_lifestyle"] },
  cost: { categories: ["locale"], tags: ["bali_cost"] },
  visa: { categories: ["regulation"], tags: ["bali_visa"] },
  culture: { categories: ["locale"], tags: ["bali_culture"] },
};

const CATEGORY_PROMPTS: Record<string, string> = {
  cafe: "バリ島のおしゃれカフェ",
  spot: "バリ島の絶景・観光スポット",
  food: "バリ島のローカルフード・ワルン",
  beach: "バリ島のビーチ",
  lifestyle: "バリ島移住・暮らし",
  cost: "バリ島の物価・コスト",
  visa: "バリ島のビザ・手続き",
  culture: "バリ島の文化・お祭り・儀式",
};

const AREAS = ["チャングー", "ウブド", "スミニャック", "サヌール", "ヌサドゥア", "クタ", "ジンバラン", "ウルワツ"];

const SYSTEM_PROMPT = `あなたはバリ島在住の語学学校「バリリンガル」のInstagramコンテンツ作成者です。
バリ島のローカル情報を紹介するカルーセル投稿のテキストを作成します。
ターゲット: バリ島旅行に興味がある日本人（20-40代女性が中心）
トーン: カジュアルで親しみやすく、行きたくなるような紹介文

重要ルール:
- 提供された参考情報に基づいて書いてください
- 参考情報にないスポットを追加する場合は、実在が確認できるもののみ
- 営業時間が不明な場合はhoursを空文字にしてください
- 必ずJSON形式のみで返してください`;

/** カテゴリ比率に基づいてカテゴリを選択 */
async function selectCategory(db: D1Database): Promise<string> {
  const weights = await db
    .prepare("SELECT category, weight FROM category_weights ORDER BY weight DESC")
    .all<CategoryWeight>();

  const categories = weights.results;
  if (categories.length === 0) return "cafe";

  // 重み付きランダム選択
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;
  for (const cat of categories) {
    random -= cat.weight;
    if (random <= 0) return cat.category;
  }
  return categories[0].category;
}

/** Haiku APIでコンテンツ生成 */
async function generateWithHaiku(
  apiKey: string,
  category: string,
  knowledgeContext: string,
  pastTopics: string[],
): Promise<GeneratedTopic> {
  const area = AREAS[Math.floor(Math.random() * AREAS.length)];
  const categoryDesc = CATEGORY_PROMPTS[category] ?? "バリ島情報";

  const pastList = pastTopics.length > 0
    ? `\n\n以下は既出テーマです。被らないようにしてください:\n${pastTopics.map((t) => `- ${t}`).join("\n")}`
    : "";

  const prompt = `「${area}の${categoryDesc}」をテーマにカルーセル投稿を作成してください。

${knowledgeContext ? `参考情報:\n${knowledgeContext}\n\n` : ""}JSON形式:
{
  "category": "${category}",
  "area": "${area}",
  "catchCopy": "${area}で行きたい！",
  "mainTitle": "キャッチーなタイトル",
  "countLabel": "5選",
  "spots": [
    {
      "name": "スポット名（実在するもの）",
      "area": "${area}",
      "description": "紹介文（100-150文字、3-4文）",
      "hours": "営業時間（不明なら空文字）",
      "oneLiner": "一言紹介（15文字以内）"
    }
  ]
}

spots は必ず5件。${pastList}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Haiku API error: ${res.status}`);
  }

  const data = await res.json() as { content: { type: string; text: string }[] };
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Haiku returned no text");

  return JSON.parse(textBlock.text) as GeneratedTopic;
}

function generateCaption(topic: GeneratedTopic, attributions: string[]): string {
  const spotList = topic.spots
    .map((s, i) => `${i + 1}. ${s.name}｜${s.oneLiner}`)
    .join("\n");

  const areaTag = topic.area ? `#${topic.area.replace(/ー/g, "")}` : "";
  const categoryTags: Record<string, string> = {
    cafe: "#バリ島カフェ",
    spot: "#バリ島観光",
    food: "#バリ島グルメ",
    beach: "#バリ島ビーチ",
    lifestyle: "#バリ島移住",
    cost: "#バリ島物価",
    visa: "#バリ島ビザ",
    culture: "#バリ島文化",
  };
  const catTag = categoryTags[topic.category] ?? "#バリ島";
  const hashtags = `#バリ島 #バリ旅行 ${catTag} ${areaTag} #バリ島留学 #バリリンガル #海外旅行 #インドネシア #バリ島情報 #バリ島おすすめ`;

  const attrLine = attributions.length > 0
    ? `\n\n📷 ${attributions.join(" / ")}`
    : "";

  return `${topic.catchCopy}${topic.mainTitle}${topic.countLabel}\n\n${spotList}\n\n保存してバリ旅行の参考にしてね！\n友達にもシェアしてね\n\n${hashtags}${attrLine}`;
}

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1080&h=1350&fit=crop";

export async function generateBaliContent(
  anthropicKey: string,
  unsplashKey: string,
  db: D1Database,
): Promise<BaliContentV2> {
  // 1. カテゴリ選択（比率ベース）
  const category = await selectCategory(db);

  // 2. 知識DB参照
  const mapping = CATEGORY_KNOWLEDGE_MAP[category] ?? { categories: ["locale"], tags: [] };
  const entries = await fetchKnowledge(db, mapping.categories, mapping.tags);
  const guardrails = await fetchGuardrails(db, "ig");
  const knowledgeContext = formatKnowledgeForPrompt(entries, guardrails);

  // 3. 過去のテーマ取得（重複回避）
  const pastRows = await db
    .prepare("SELECT category || ':' || COALESCE(area,'') || ':' || COALESCE(theme,'') as topic FROM posted_topics ORDER BY id DESC LIMIT 30")
    .all<{ topic: string }>();
  const pastTopics = pastRows.results.map((r) => r.topic);

  // 4. Haikuでコンテンツ生成
  const topic = await generateWithHaiku(anthropicKey, category, knowledgeContext, pastTopics);

  // 5. 使用したナレッジエントリのカウントアップ
  if (entries.length > 0) {
    await incrementUseCount(db, entries.map((e) => e.id));
  }

  // 6. Unsplashで写真取得
  const photos = await searchPhotosForSpots(
    topic.spots.map((s) => ({ name: s.name, area: s.area })),
    topic.area || topic.mainTitle,
    unsplashKey,
  );

  // 7. テンプレートデータ組み立て
  const coverData: BaliCoverData = {
    imageUrl: photos.cover?.imageUrl ?? FALLBACK_IMAGE,
    catchCopy: topic.catchCopy,
    mainTitle: topic.mainTitle,
    countLabel: topic.countLabel,
  };

  const spotsData: BaliSpotData[] = topic.spots.map((spot, i) => ({
    imageUrl: photos.spots[i]?.imageUrl ?? FALLBACK_IMAGE,
    spotNumber: i + 1,
    spotName: spot.name,
    description: spot.description,
    hours: spot.hours || undefined,
  }));

  const summaryData: BaliSummaryData = {
    title: `${topic.catchCopy}${topic.mainTitle}`,
    spots: topic.spots.map((s, i) => ({
      number: i + 1,
      name: s.name,
      oneLiner: s.oneLiner,
    })),
  };

  const attributions = [
    photos.cover?.attribution,
    ...photos.spots.map((p) => p?.attribution),
  ].filter((a): a is string => !!a);
  const uniqueAttributions = [...new Set(attributions)];

  const caption = generateCaption(topic, uniqueAttributions);

  // 8. posted_topicsに記録
  await db
    .prepare("INSERT INTO posted_topics (category, area, theme, spots_json) VALUES (?, ?, ?, ?)")
    .bind(category, topic.area, topic.mainTitle, JSON.stringify(topic.spots.map((s) => s.name)))
    .run();

  return {
    category,
    area: topic.area,
    title: `${topic.catchCopy}${topic.mainTitle}${topic.countLabel}`,
    coverData,
    spotsData,
    summaryData,
    caption,
    attributions: uniqueAttributions,
  };
}
