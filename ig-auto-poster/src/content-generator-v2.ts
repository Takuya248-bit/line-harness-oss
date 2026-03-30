import { searchPhotosForSpots } from "./photo-search";
import { fetchKnowledge, incrementUseCount } from "./knowledge";
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

const CATEGORY_TITLES: Record<string, { catchCopy: string; mainTitle: string; countLabel: string }> = {
  cafe: { catchCopy: "で行きたい！", mainTitle: "おしゃれカフェ", countLabel: "5選" },
  spot: { catchCopy: "の絶景！", mainTitle: "観光スポット", countLabel: "5選" },
  food: { catchCopy: "で食べたい！", mainTitle: "ローカルグルメ", countLabel: "5選" },
  beach: { catchCopy: "のおすすめ！", mainTitle: "ビーチ", countLabel: "5選" },
  lifestyle: { catchCopy: "の暮らし！", mainTitle: "移住のリアル", countLabel: "5選" },
  cost: { catchCopy: "の物価！", mainTitle: "コスト事情", countLabel: "まとめ" },
  visa: { catchCopy: "に行くなら！", mainTitle: "ビザ情報", countLabel: "まとめ" },
  culture: { catchCopy: "を知ろう！", mainTitle: "文化・お祭り", countLabel: "5選" },
};

const AREAS = ["チャングー", "ウブド", "スミニャック", "サヌール", "ヌサドゥア", "クタ", "ジンバラン", "ウルワツ"];

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

/** 知識DBからテンプレートベースでコンテンツ生成 */
async function generateFromKnowledgeDB(
  category: string,
  db: D1Database,
): Promise<GeneratedTopic> {
  const area = AREAS[Math.floor(Math.random() * AREAS.length)];
  const mapping = CATEGORY_KNOWLEDGE_MAP[category] ?? { categories: ["locale"], tags: [] };

  // 知識DBからエントリ取得（use_count低い順=あまり使ってないものを優先）
  const entries = await fetchKnowledge(db, mapping.categories, mapping.tags, 10);

  // 過去のposted_topicsと被らないエントリを選択
  const pastRows = await db
    .prepare("SELECT spots_json FROM posted_topics ORDER BY id DESC LIMIT 50")
    .all<{ spots_json: string }>();
  const pastSpotNames = new Set<string>();
  for (const row of pastRows.results) {
    try {
      const names = JSON.parse(row.spots_json) as string[];
      names.forEach(n => pastSpotNames.add(n));
    } catch {
      // JSON parse失敗は無視
    }
  }

  const unused = entries.filter(e => !pastSpotNames.has(e.title));
  const selected = (unused.length >= 5 ? unused : entries).slice(0, 5);

  if (selected.length === 0) {
    throw new Error(`No knowledge entries found for category: ${category}`);
  }

  const titles = CATEGORY_TITLES[category] ?? { catchCopy: "のおすすめ！", mainTitle: "スポット", countLabel: "5選" };

  function extractOneLiner(content: string): string {
    const firstSentence = content.split(/[。！\n]/)[0];
    return firstSentence.length <= 15 ? firstSentence : firstSentence.slice(0, 15);
  }

  const spots: SpotInfo[] = selected.map(entry => ({
    name: entry.title,
    area: area,
    description: entry.content.slice(0, 150),
    hours: "",
    oneLiner: extractOneLiner(entry.content),
  }));

  return {
    category,
    area,
    catchCopy: `${area}${titles.catchCopy}`,
    mainTitle: titles.mainTitle,
    countLabel: titles.countLabel,
    spots,
  };
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
    ? `\n\n📷 ${topic.spots.map(s => s.name).join(" / ")}`
    : "";

  return `${topic.catchCopy}${topic.mainTitle}${topic.countLabel}\n\n${spotList}\n\n保存してバリ旅行の参考にしてね！\n友達にもシェアしてね\n\n${hashtags}${attrLine}`;
}

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1080&h=1350&fit=crop";

export async function generateBaliContent(
  unsplashKey: string,
  db: D1Database,
  serperKey: string,
): Promise<BaliContentV2> {
  // 1. カテゴリ選択（比率ベース）
  const category = await selectCategory(db);

  // 2. 知識DBからテンプレートベースでコンテンツ生成
  const topic = await generateFromKnowledgeDB(category, db);

  // 3. 使用したナレッジエントリのカウントアップ
  const mapping = CATEGORY_KNOWLEDGE_MAP[category] ?? { categories: ["locale"], tags: [] };
  const entries = await fetchKnowledge(db, mapping.categories, mapping.tags, 10);
  if (entries.length > 0) {
    await incrementUseCount(db, entries.map((e) => e.id));
  }

  // 4. Serper優先 + Unsplashフォールバックで写真取得
  const photos = await searchPhotosForSpots(
    topic.spots.map((s) => ({ name: s.name, area: s.area })),
    topic.spots[0]?.name ?? topic.area,
    category,
    serperKey,
    unsplashKey,
  );

  // 5. テンプレートデータ組み立て
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

  // 6. posted_topicsに記録
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
