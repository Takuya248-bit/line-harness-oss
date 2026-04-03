import { buildPromptForV2PlanWithRealSpots } from "../src/pipeline/content-planner";
import { groqJson } from "../src/groq";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FM = "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.reviews,places.regularOpeningHours.weekdayDescriptions";

async function main() {
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!, "X-Goog-FieldMask": FM },
    body: JSON.stringify({ textQuery: "best cafes in Bali", languageCode: "ja", maxResultCount: 8 }),
  });
  const data = await res.json() as { places?: Record<string, unknown>[] };
  const places = (data.places ?? []).filter((p: any) => (p.rating ?? 0) >= 4.5 && (p.userRatingCount ?? 0) >= 100).slice(0, 5);

  const spots = places.map((p: any) => {
    const reviews = (p.reviews ?? []).sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5);
    const parts = (p.formattedAddress ?? "").split(",").map((s: string) => s.trim());
    return {
      name: p.displayName?.text ?? "",
      area: parts[1] ?? parts[0] ?? "Bali",
      reviews_json: JSON.stringify(reviews.map((r: any) => ({ text: r.text?.text ?? "", rating: r.rating ?? 0 }))),
      rating: p.rating as number,
      review_count: p.userRatingCount as number,
      opening_hours: (p.regularOpeningHours?.weekdayDescriptions ?? []).join("\n") || null,
      price_level: null,
      website: null,
    };
  });

  const neta = [{ id: "1", title: "バリ島カフェ", content: "バリ島のカフェ文化", category: "cafe", tags: [] as string[], reliability: "verified" as const, source: "d1" }];
  const prompt = buildPromptForV2PlanWithRealSpots("cafe", "バリ島", spots, "rich", neta);
  const groqKey = process.env.GROQ_API_KEY ?? "";
  const result = await groqJson<Record<string, unknown>>(groqKey, [{ role: "user", content: prompt }], {
    temperature: 0.8, maxTokens: 4096, cerebrasApiKey: process.env.CEREBRAS_API_KEY,
  });

  // テキストだけ出力
  const r = result as any;
  console.log(`タイトル: ${r.title}`);
  console.log(`キャッチ: ${r.coverData?.catchCopy}`);
  console.log(`メイン: ${r.coverData?.mainTitle}\n`);
  for (const s of r.spotsData ?? []) {
    console.log(`━━ ${s.spotNumber}. ${s.spotName} ━━`);
    console.log(s.description);
    console.log(`→ ${s.highlight}\n`);
  }
  console.log(`── まとめ ──`);
  for (const s of r.summaryData?.spots ?? []) {
    console.log(`  ${s.number}. ${s.name}: ${s.oneLiner}`);
  }
}
main();
