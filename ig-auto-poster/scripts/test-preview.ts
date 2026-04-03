// テスト: Google Places API → LLM → Satori画像 → /tmp/ にPNG保存
import { buildV2Slides, type BaliContentV2 } from "../src/templates/index";
import { renderV2Slides } from "../src/pipeline/satori-renderer";
import { fetchPexelsImage, fetchSpotImages } from "../src/pipeline/image-fetcher";
import { buildPromptForV2PlanWithRealSpots } from "../src/pipeline/content-planner";
import { groqJson } from "../src/groq";
import fs from "fs";
import type { NetaEntry } from "../src/pipeline/types";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.regularOpeningHours,places.reviews,places.location";

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) { console.error("GOOGLE_PLACES_API_KEY not set"); process.exit(1); }
  const groqKey = process.env.GROQ_API_KEY || "";

  // Step 1: Google Places
  console.log("Step 1: Google Places API...");
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({ textQuery: "best cafes in Bali", languageCode: "ja", maxResultCount: 10 }),
  });
  const data = await res.json() as { places?: any[] };
  const places = (data.places ?? []).filter((p: any) => (p.rating ?? 0) >= 4.5 && (p.userRatingCount ?? 0) >= 100);
  console.log(`  ${places.length} spots passed filter`);

  const spots = places.slice(0, 5).map((p: any) => {
    const reviews = (p.reviews ?? []).sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5);
    const reviewsJson = JSON.stringify(reviews.map((r: any) => ({ text: r.text?.text ?? "", rating: r.rating ?? 0 })));
    const parts = (p.formattedAddress ?? "").split(",").map((s: string) => s.trim());
    return {
      name: p.displayName?.text ?? "",
      area: parts[1] ?? parts[0] ?? "Bali",
      rating: p.rating as number,
      review_count: p.userRatingCount as number,
      reviews_json: reviewsJson,
      opening_hours: (p.regularOpeningHours?.weekdayDescriptions ?? []).join("\n") || null,
      price_level: null as string | null,
      website: p.websiteUri ?? null,
    };
  });

  for (const s of spots) console.log(`  ★${s.rating} (${s.review_count}件) ${s.name} [${s.area}]`);

  // Step 2: LLM（content-planner.tsの本番プロンプトを使用）
  console.log("Step 2: LLM...");
  const neta: NetaEntry[] = [{ id: "1", title: "バリ島カフェ", content: "バリ島のカフェ文化", category: "cafe", tags: [], reliability: "verified", source: "d1" }];
  const prompt = buildPromptForV2PlanWithRealSpots("cafe", "バリ島", spots, "rich", neta);

  interface V2Plan {
    title: string;
    coverData: { catchCopy: string; mainTitle: string; countLabel: string };
    spotsData: { spotNumber: number; spotName: string; description: string; area?: string; highlight?: string; bestDish?: string; atmosphere?: string; reviewQuote?: string }[];
    summaryData: { title: string; spots: { number: number; name: string; oneLiner: string }[] };
  }

  const v2Raw = await groqJson<V2Plan>(groqKey, [{ role: "user", content: prompt }], {
    temperature: 0.8, maxTokens: 4096, cerebrasApiKey: process.env.CEREBRAS_API_KEY,
  });

  console.log(`  Title: ${v2Raw.title}`);
  console.log(`  Spots: ${v2Raw.spotsData?.length}`);

  // Step 3: Pexels
  console.log("Step 3: Pexels images...");
  const spotNames = v2Raw.spotsData.map(s => s.spotName);
  const spotAreas = v2Raw.spotsData.map(s => s.area ?? "");
  const spotImageUrls = await fetchSpotImages("バリ島", "cafe", spotNames, spotAreas);
  const coverImage = await fetchPexelsImage("bali cafe tropical");
  console.log(`  Got ${spotImageUrls.length} spot images`);

  // Step 4: Satori
  console.log("Step 4: Satori rendering...");
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
    spotsData: v2Raw.spotsData.map((s, i) => ({
      imageUrl: spotImageUrls[i] || "",
      spotNumber: s.spotNumber || i + 1,
      spotName: s.spotName || "",
      description: s.description || "",
      area: s.area,
      highlight: s.highlight,
      bestDish: s.bestDish,
      atmosphere: s.atmosphere,
      reviewQuote: s.reviewQuote,
      infoStyle: "rich" as const,
    })),
    summaryData: v2Raw.summaryData || { title: "まとめ", spots: [] },
    caption: "",
    attributions: [],
  };

  const nodes = buildV2Slides(content);
  const buffers = await renderV2Slides(nodes);
  for (let i = 0; i < buffers.length; i++) {
    fs.writeFileSync(`/tmp/ig-preview-${String(i + 1).padStart(2, "0")}.png`, buffers[i]);
  }
  console.log(`\nDone! ${buffers.length} images saved to /tmp/ig-preview-*.png`);
}

main().catch(e => { console.error(e); process.exit(1); });
