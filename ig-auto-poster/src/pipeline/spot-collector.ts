import { d1Query, d1Execute } from "../../batch/d1-rest";

interface FoursquarePlace {
  fsq_id: string;
  name: string;
  location: { address?: string; locality?: string; country?: string };
  categories: { id: number; name: string }[];
  website?: string;
}

interface FoursquareResponse {
  results: FoursquarePlace[];
}

export async function collectSpots(
  foursquareKey: string,
  cfAccountId: string,
  d1DbId: string,
  cfApiToken: string,
  category: string = "cafe",
  limit: number = 50,
): Promise<number> {
  // Foursquare Place Search API v3
  // categories=13032 is the Foursquare category ID for Cafe
  const params = new URLSearchParams({
    ll: "-8.6765,115.2126",
    radius: "30000",
    categories: "13032",
    fields: "fsq_id,name,location,categories,website",
    limit: String(limit),
  });

  const res = await fetch(
    `https://api.foursquare.com/v3/places/search?${params.toString()}`,
    {
      headers: {
        Authorization: foursquareKey,
        Accept: "application/json",
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Foursquare API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as FoursquareResponse;
  const places = data.results ?? [];

  // Check existing foursquare_ids to skip duplicates
  const existingRows = await d1Query<{ foursquare_id: string }>(
    cfAccountId,
    d1DbId,
    cfApiToken,
    "SELECT foursquare_id FROM real_spots WHERE foursquare_id IS NOT NULL",
  );
  const existingIds = new Set(existingRows.map((r) => r.foursquare_id));

  let insertCount = 0;
  for (const place of places) {
    if (existingIds.has(place.fsq_id)) continue;

    const area = place.location.locality ?? place.location.country ?? "";
    const website = place.website ?? null;

    await d1Execute(
      cfAccountId,
      d1DbId,
      cfApiToken,
      `INSERT INTO real_spots (foursquare_id, name, area, category, website, used_count)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [place.fsq_id, place.name, area, category, website],
    );
    insertCount++;
  }

  return insertCount;
}
