const PEXELS_API_BASE = "https://api.pexels.com";

export interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

export interface PexelsVideo {
  id: number;
  url: string;
  video_files: PexelsVideoFile[];
}

export interface PexelsSearchResult {
  videos: PexelsVideo[];
  total_results: number;
  page?: number;
  per_page?: number;
  next_page?: string;
  prev_page?: string;
}

const CATEGORY_QUERIES: Record<string, string[]> = {
  cafe: ["bali cafe", "bali coffee shop"],
  spot: ["bali temple", "bali rice terrace"],
  food: ["bali food", "indonesian street food"],
  beach: ["bali beach", "bali ocean sunset"],
  lifestyle: ["bali lifestyle", "digital nomad bali"],
  cost: ["bali market", "bali shopping"],
  visa: ["bali airport", "indonesia travel"],
  culture: ["bali ceremony", "bali dance"],
};

function spotQueries(area: string): string[] {
  const base = CATEGORY_QUERIES.spot ?? ["bali temple", "bali rice terrace"];
  return [...base, `${area} bali`];
}

function queriesForCategory(category: string, area: string): string[] {
  if (category === "spot") return spotQueries(area);
  return CATEGORY_QUERIES[category] ?? ["bali beach", "bali lifestyle"];
}

function pickBestMp4Url(video: PexelsVideo): string | null {
  const mp4s = video.video_files.filter((f) => f.file_type === "video/mp4");
  const hd = mp4s.filter((f) => Math.min(f.width, f.height) >= 720);
  const pool = hd.length > 0 ? hd : mp4s;
  if (pool.length === 0) return null;
  pool.sort((a, b) => b.width * b.height - a.width * b.height);
  return pool[0]!.link;
}

async function fetchVideosForQuery(
  apiKey: string,
  query: string,
  perPage: number,
): Promise<PexelsVideo[]> {
  const params = new URLSearchParams({
    query,
    orientation: "portrait",
    size: "medium",
    per_page: String(Math.min(80, Math.max(1, perPage))),
  });
  const url = `${PEXELS_API_BASE}/videos/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as PexelsSearchResult;
  return data.videos ?? [];
}

/**
 * カテゴリに応じた検索クエリでPexels動画を取得
 * 9:16比率（portrait）で720p以上のMP4を優先
 */
export async function searchPexelsVideos(
  apiKey: string,
  category: string,
  area: string,
  count: number = 5,
): Promise<string[]> {
  const key = apiKey.trim();
  if (!key) return [];

  const queries = queriesForCategory(category, area);
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    if (urls.length >= count) break;
    let videos: PexelsVideo[];
    try {
      videos = await fetchVideosForQuery(key, q, count);
    } catch {
      continue;
    }
    for (const v of videos) {
      if (urls.length >= count) break;
      const link = pickBestMp4Url(v);
      if (!link || seen.has(link)) continue;
      seen.add(link);
      urls.push(link);
    }
  }

  return urls.slice(0, count);
}
