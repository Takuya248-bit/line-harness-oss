import { d1Query, d1Execute } from "../../batch/d1-rest";

const PLACES_SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.regularOpeningHours,places.reviews,places.location,places.photos";

const SEARCH_QUERIES: Record<string, string> = {
  cafe: "best cafes in Bali",
  restaurant: "best restaurants in Bali",
  spot: "best tourist attractions in Bali",
  food: "best local food warung in Bali",
  beach: "best beaches in Bali",
};

interface GooglePlace {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  websiteUri?: string;
  regularOpeningHours?: {
    weekdayDescriptions: string[];
  };
  reviews?: {
    text?: { text: string; languageCode?: string };
    rating?: number;
    relativePublishTimeDescription?: string;
  }[];
  location?: { latitude: number; longitude: number };
  photos?: { name: string; widthPx: number; heightPx: number }[];
}

interface GooglePlacesResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

function mapPriceLevel(level?: string): string | null {
  if (!level) return null;
  const m: Record<string, string> = {
    PRICE_LEVEL_FREE: "",
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
  };
  const out = m[level];
  if (out === "") return null;
  return out ?? null;
}

function extractArea(formattedAddress: string): string {
  const parts = formattedAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts[1]!;
  return formattedAddress.trim();
}

function topReviewsForDb(
  reviews?: GooglePlace["reviews"],
): { text: string; rating: number }[] {
  if (!reviews?.length) return [];
  const sorted = [...reviews].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return sorted
    .slice(0, 2)
    .map((r) => ({
      text: (r.text?.text ?? "").trim(),
      rating: r.rating ?? 0,
    }))
    .filter((r) => r.text.length > 0);
}

async function searchTextWithRetry(
  apiKey: string,
  body: { textQuery: string; languageCode: string; maxResultCount: number },
): Promise<GooglePlacesResponse> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(PLACES_SEARCH_TEXT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return (await res.json()) as GooglePlacesResponse;
    }
    const status = res.status;
    if (status === 429 || status >= 500) {
      const detail = await res.text();
      lastErr = new Error(`Google Places API error: ${status} ${detail}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    throw new Error(`Google Places API error: ${status} ${await res.text()}`);
  }
  throw lastErr ?? new Error("Google Places API: exhausted retries");
}

export async function collectSpots(
  cfAccountId: string,
  d1DbId: string,
  cfApiToken: string,
  googlePlacesApiKey: string,
  category: string = "cafe",
  limit: number = 20,
): Promise<number> {
  const existingCount = await d1Query<{ cnt: number }>(
    cfAccountId,
    d1DbId,
    cfApiToken,
    "SELECT COUNT(*) as cnt FROM real_spots WHERE category = ?",
    [category],
  );
  if ((existingCount[0]?.cnt ?? 0) >= 10) {
    return 0;
  }

  const textQuery = SEARCH_QUERIES[category] ?? SEARCH_QUERIES.cafe;
  const data = await searchTextWithRetry(googlePlacesApiKey, {
    textQuery,
    languageCode: "ja",
    maxResultCount: Math.min(Math.max(1, limit), 20),
  });

  const places = data.places ?? [];
  const existingRows = await d1Query<{ foursquare_id: string }>(
    cfAccountId,
    d1DbId,
    cfApiToken,
    "SELECT foursquare_id FROM real_spots WHERE foursquare_id IS NOT NULL",
  );
  const existingIds = new Set(existingRows.map((r) => r.foursquare_id));

  let insertCount = 0;
  for (const place of places) {
    const rating = place.rating;
    const userRatingCount = place.userRatingCount;
    if (rating === undefined || userRatingCount === undefined) continue;
    if (rating < 4.5 || userRatingCount < 100) continue;

    const placeKey = `google:${place.id}`;
    if (existingIds.has(placeKey)) continue;

    const name = place.displayName?.text?.trim();
    if (!name) continue;

    const formattedAddress = place.formattedAddress?.trim() ?? "";
    const area = extractArea(formattedAddress);
    const website = place.websiteUri ?? null;
    const lat = place.location?.latitude ?? null;
    const lon = place.location?.longitude ?? null;
    const priceLevel = mapPriceLevel(place.priceLevel);
    const openingHours = place.regularOpeningHours?.weekdayDescriptions?.length
      ? place.regularOpeningHours.weekdayDescriptions.join("\n")
      : null;
    const topRev = topReviewsForDb(place.reviews);
    const reviewsJson = topRev.length > 0 ? JSON.stringify(topRev) : null;
    const photoReferences = JSON.stringify(place.photos?.slice(0, 3).map((p) => p.name) ?? []);

    await d1Execute(
      cfAccountId,
      d1DbId,
      cfApiToken,
      `INSERT INTO real_spots (
        foursquare_id, name, area, category, website, latitude, longitude,
        description, used_count, rating, review_count, reviews_json, opening_hours, price_level, photo_references
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?)`,
      [
        placeKey,
        name,
        area || formattedAddress || "Bali",
        category,
        website,
        lat,
        lon,
        rating,
        userRatingCount,
        reviewsJson,
        openingHours,
        priceLevel,
        photoReferences,
      ],
    );
    existingIds.add(placeKey);
    insertCount++;
  }

  return insertCount;
}
