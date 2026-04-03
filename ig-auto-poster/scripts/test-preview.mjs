// テスト: Google Places API → LLM → Satori画像生成 → /tmp/ にPNG保存
import { execSync } from "child_process";

// Step 1: Google Places APIからスポット取得
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.regularOpeningHours,places.reviews,places.location";
const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) { console.error("GOOGLE_PLACES_API_KEY not set"); process.exit(1); }

console.log("Step 1: Google Places API...");
const res = await fetch(PLACES_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
  body: JSON.stringify({ textQuery: "best cafes in Bali", languageCode: "ja", maxResultCount: 10 }),
});
const data = await res.json();
const places = (data.places ?? []).filter(p => (p.rating ?? 0) >= 4.5 && (p.userRatingCount ?? 0) >= 100);
console.log(`  ${places.length} spots passed filter`);

const PRICE_MAP = { PRICE_LEVEL_FREE: "", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };
const spots = places.slice(0, 5).map(p => {
  const reviews = (p.reviews ?? []).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 2);
  const reviewsJson = JSON.stringify(reviews.map(r => ({ text: r.text?.text ?? "", rating: r.rating ?? 0 })));
  const parts = (p.formattedAddress ?? "").split(",").map(s => s.trim());
  return {
    name: p.displayName?.text ?? "",
    area: parts[1] ?? parts[0] ?? "Bali",
    website: p.websiteUri ?? null,
    rating: p.rating,
    review_count: p.userRatingCount,
    reviews_json: reviewsJson,
    opening_hours: p.regularOpeningHours?.weekdayDescriptions?.join("\n") ?? null,
    price_level: PRICE_MAP[p.priceLevel] || null,
  };
});

// Step 2: LLM生成
console.log("Step 2: LLM content generation...");
const groqKey = process.env.CEREBRAS_API_KEY || process.env.GROQ_API_KEY || "";
const isCerebras = !!process.env.CEREBRAS_API_KEY;
const baseUrl = isCerebras ? "https://api.cerebras.ai/v1" : "https://api.groq.com/openai/v1";
const model = isCerebras ? "llama-3.3-70b" : "llama-3.3-70b-versatile";

const NO_PROMO = "バリリンガル・語学学校・留学費用の直接宣伝はしない";
const spotsList = spots.map((s, i) => {
  let line = `${i + 1}. ${s.name}（${s.area}）`;
  if (s.rating) line += ` ★${s.rating}`;
  if (s.review_count) line += `（${s.review_count}件）`;
  if (s.price_level) line += ` ${s.price_level}`;
  if (s.reviews_json) {
    try {
      const reviews = JSON.parse(s.reviews_json);
      if (reviews.length > 0) line += `\n   口コミ: 「${reviews[0].text.slice(0, 80)}」`;
      if (reviews.length > 1) line += `\n   口コミ2: 「${reviews[1].text.slice(0, 80)}」`;
    } catch {}
  }
  return line;
}).join("\n");

const prompt = `あなたはバリ島在住のインスタグラマーです。
カテゴリ: cafe
以下は実在するスポットです:
${spotsList}

重要ルール:
- ${NO_PROMO}
- スポットの名前・評価・口コミ内容を変えない
- LLMの役割はデータ整形のみ。新しい情報を捏造しない
- descriptionには口コミ情報を要約・日本語整形して使う（150文字以内）
- highlightは口コミから一番の魅力を30文字以内で

JSONのみを返してください。
{
  "title": "魅力的な日本語タイトル",
  "coverData": { "catchCopy": "キャッチコピー", "mainTitle": "メインタイトル", "countLabel": "5選" },
  "spotsData": [{ "spotNumber": 1, "spotName": "店名", "description": "150文字以内", "area": "エリア", "priceLevel": "$/$$/", "highlight": "30文字以内" }],
  "summaryData": { "title": "まとめ", "spots": [{ "number": 1, "name": "店名", "oneLiner": "20文字以内" }] }
}`;

const llmRes = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
  body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.8, max_tokens: 2048, response_format: { type: "json_object" } }),
});
const llmData = await llmRes.json();
const v2Raw = JSON.parse(llmData.choices?.[0]?.message?.content ?? "{}");
console.log(`  Title: ${v2Raw.title}`);
console.log(`  Spots: ${v2Raw.spotsData?.length ?? 0}`);

// Step 3: Pexels画像取得
console.log("Step 3: Pexels images...");
const pexelsKey = process.env.PEXELS_API_KEY || "";
async function pexelsImage(query) {
  if (!pexelsKey) return "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg";
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`, {
    headers: { Authorization: pexelsKey },
  });
  const d = await r.json();
  return d.photos?.[0]?.src?.large2x ?? "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg";
}

const spotImages = await Promise.all(
  (v2Raw.spotsData || []).map(s => pexelsImage(`${s.spotName} cafe bali`))
);
const coverImage = await pexelsImage("bali cafe tropical");
console.log(`  Got ${spotImages.length} spot images + 1 cover`);

// Step 4: Satori V2 render
console.log("Step 4: Satori rendering...");
// tsx経由でTypeScriptテンプレートをインポート
const renderScript = `
import { buildV2Slides, type BaliContentV2 } from "../src/templates/index";
import { renderV2Slides } from "../src/pipeline/satori-renderer";
import fs from "fs";

const v2Raw = ${JSON.stringify(v2Raw)};
const spotImages = ${JSON.stringify(spotImages)};
const coverImage = "${coverImage}";

const content: BaliContentV2 = {
  category: "cafe",
  area: "バリ島",
  title: v2Raw.title || "バリ島カフェ5選",
  coverData: {
    catchCopy: v2Raw.coverData?.catchCopy || "バリ島カフェ",
    mainTitle: v2Raw.coverData?.mainTitle || "おすすめカフェ",
    countLabel: v2Raw.coverData?.countLabel || "5選",
    imageUrl: coverImage,
  },
  spotsData: (v2Raw.spotsData || []).map((s: any, i: number) => ({
    imageUrl: spotImages[i] || "",
    spotNumber: s.spotNumber || i + 1,
    spotName: s.spotName || "",
    description: s.description || "",
    area: s.area,
    priceLevel: s.priceLevel,
    highlight: s.highlight,
    infoStyle: "rich" as const,
  })),
  summaryData: v2Raw.summaryData || { title: "まとめ", spots: [] },
  caption: "",
  attributions: [],
};

const nodes = buildV2Slides(content);
const buffers = await renderV2Slides(nodes);
for (let i = 0; i < buffers.length; i++) {
  fs.writeFileSync("/tmp/ig-preview-" + String(i + 1).padStart(2, "0") + ".png", buffers[i]);
}
console.log("Saved " + buffers.length + " images to /tmp/ig-preview-*.png");
`;

import fs from "fs";
fs.writeFileSync("/tmp/_render.ts", renderScript);
try {
  execSync("cd /Users/kimuratakuya/line-harness/ig-auto-poster && npx tsx /tmp/_render.ts", {
    stdio: "inherit",
    timeout: 30000,
    env: { ...process.env },
  });
} catch (e) {
  console.error("Render failed:", e.message);
}

// 完了
console.log("\nDone! Preview images:");
const files = fs.readdirSync("/tmp").filter(f => f.startsWith("ig-preview-")).sort();
for (const f of files) console.log(`  /tmp/${f}`);
