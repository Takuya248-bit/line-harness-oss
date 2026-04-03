import { d1Query, d1Execute } from "../../batch/d1-rest";

interface OverpassElement {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

const AMENITY_MAP: Record<string, string> = {
  cafe: "cafe",
  restaurant: "restaurant",
};

export async function collectSpots(
  cfAccountId: string,
  d1DbId: string,
  cfApiToken: string,
  category: string = "cafe",
  limit: number = 50,
): Promise<number> {
  const amenity = AMENITY_MAP[category] ?? "cafe";

  // 既にデータがあればスキップ（週1回の収集で十分）
  const existingCount = await d1Query<{ cnt: number }>(
    cfAccountId, d1DbId, cfApiToken,
    "SELECT COUNT(*) as cnt FROM real_spots WHERE category = ?",
    [category],
  );
  if ((existingCount[0]?.cnt ?? 0) >= 10) {
    return 0; // 十分なデータあり
  }

  // Overpass API: バリ島エリア内のカフェを検索（認証不要・完全無料）
  const query = `[out:json][timeout:25];area["name"="Bali"]["admin_level"="4"]->.bali;node["amenity"="${amenity}"](area.bali);out body ${limit};`;

  // リトライ（Overpass APIはサーバー混雑でタイムアウトすることがある）
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.ok) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }

  if (!res || !res.ok) {
    throw new Error(`Overpass API error: ${res?.status ?? "no response"}`);
  }

  const data = (await res.json()) as OverpassResponse;
  const places = data.elements.filter((e) => e.tags?.name);

  // 既存のOSM IDを取得して重複スキップ
  const existingRows = await d1Query<{ foursquare_id: string }>(
    cfAccountId,
    d1DbId,
    cfApiToken,
    "SELECT foursquare_id FROM real_spots WHERE foursquare_id IS NOT NULL",
  );
  const existingIds = new Set(existingRows.map((r) => r.foursquare_id));

  let insertCount = 0;
  for (const place of places) {
    const osmId = `osm:${place.id}`;
    if (existingIds.has(osmId)) continue;

    const name = place.tags.name;
    const area = place.tags["addr:city"] ?? place.tags["addr:street"] ?? "";
    const website = place.tags.website ?? place.tags["contact:website"] ?? null;
    const cuisine = place.tags.cuisine ?? null;

    await d1Execute(
      cfAccountId,
      d1DbId,
      cfApiToken,
      `INSERT INTO real_spots (foursquare_id, name, area, category, website, latitude, longitude, description, used_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [osmId, name, area, category, website, place.lat, place.lon, cuisine],
    );
    insertCount++;
  }

  return insertCount;
}
