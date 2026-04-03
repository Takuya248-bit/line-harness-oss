// テスト: Google Places APIでスポット取得 → LLMで1投稿分生成
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.regularOpeningHours,places.reviews,places.location";
const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) { console.error("GOOGLE_PLACES_API_KEY not set"); process.exit(1); }

const res = await fetch(PLACES_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": FIELD_MASK,
  },
  body: JSON.stringify({ textQuery: "best cafes in Bali", languageCode: "ja", maxResultCount: 10 }),
});
const data = await res.json();
const places = (data.places ?? []).filter(p => (p.rating ?? 0) >= 4.5 && (p.userRatingCount ?? 0) >= 100);

console.log(`\n=== ${places.length} spots passed filter (rating>=4.5, reviews>=100) ===\n`);

const PRICE_MAP = {
  PRICE_LEVEL_FREE: "",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

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

for (const s of spots) {
  console.log(`★${s.rating} (${s.review_count}件) ${s.name} [${s.area}] ${s.price_level ?? ""}`);
  if (s.reviews_json) {
    const revs = JSON.parse(s.reviews_json);
    for (const r of revs) console.log(`  口コミ: "${r.text.slice(0, 60)}..." (★${r.rating})`);
  }
}

// LLM生成（Cerebras > Groq フォールバック）
const groqKey = process.env.CEREBRAS_API_KEY || process.env.GROQ_API_KEY || "";
if (!groqKey) { console.error("\nCEREBRAS_API_KEY or GROQ_API_KEY not set"); process.exit(1); }

const NO_PROMO = "バリリンガル・語学学校・留学費用の直接宣伝はしない。一般的なバリ島情報・英語学習ノウハウとして価値提供する";

const spotsList = spots.map((s, i) => {
  let line = `${i + 1}. ${s.name}（${s.area}）`;
  if (s.rating) line += ` ★${s.rating}`;
  if (s.review_count) line += `（${s.review_count}件）`;
  if (s.price_level) line += ` ${s.price_level}`;
  if (s.website) line += ` / ${s.website}`;
  if (s.opening_hours) line += `\n   営業: ${s.opening_hours.split("\n")[0]}`;
  if (s.reviews_json) {
    try {
      const reviews = JSON.parse(s.reviews_json);
      if (reviews.length > 0) line += `\n   口コミ: 「${reviews[0].text.slice(0, 80)}」`;
      if (reviews.length > 1) line += `\n   口コミ2: 「${reviews[1].text.slice(0, 80)}」`;
    } catch {}
  }
  return line;
}).join("\n");

const prompt = `あなたはバリ島在住のインスタグラマーです。実際に訪れた場所の情報を発信しています。

カテゴリ: cafe
以下は実在するスポットです。名前はそのまま使ってください:
${spotsList}

重要ルール:
- ${NO_PROMO}
- 上記スポットの名前・評価・口コミ内容を変えない。そのまま使う
- LLMの役割はデータ整形のみ。新しい情報を捏造しない
- descriptionには上記の口コミ情報を要約・日本語整形して使う
- テンプレ的な表現（「〜が魅力」「〜で有名」）は避け、口コミベースのリアルな文章にする

JSONのみを返してください。

{
  "title": "cafeに合った魅力的な日本語タイトル",
  "coverData": {
    "catchCopy": "思わずスワイプしたくなるキャッチコピー",
    "mainTitle": "cafeに合ったメインタイトル",
    "countLabel": "${spots.length}選"
  },
  "spotsData": [
    {
      "spotNumber": 1,
      "spotName": "実在店名（リストの名前をそのまま使用）",
      "description": "150文字以内。口コミ情報を要約・日本語整形して使う（捏造しない）",
      "area": "正確なエリア名",
      "priceLevel": "$ / $$ / $$$",
      "highlight": "一番の魅力を30文字以内で"
    }
  ],
  "summaryData": {
    "title": "まとめ",
    "spots": [
      { "number": 1, "name": "スポット名", "oneLiner": "20文字以内の特徴" }
    ]
  }
}`;

const isCerebras = !!process.env.CEREBRAS_API_KEY;
const baseUrl = isCerebras ? "https://api.cerebras.ai/v1" : "https://api.groq.com/openai/v1";
const model = isCerebras ? "llama-3.3-70b" : "llama-3.3-70b-versatile";

const llmRes = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
    max_tokens: 2048,
    response_format: { type: "json_object" },
  }),
});

const llmData = await llmRes.json();
const content = llmData.choices?.[0]?.message?.content ?? "{}";

console.log("\n=== LLM生成結果 ===\n");
const parsed = JSON.parse(content);
console.log(JSON.stringify(parsed, null, 2));
