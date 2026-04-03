export const FALLBACK_URL = "https://images.unsplash.com/photo-placeholder?w=1080&h=1350";

interface PexelsPhoto {
  src: {
    large2x: string;
  };
}

interface PexelsResponse {
  photos: PexelsPhoto[];
}

export async function fetchPexelsImage(
  query: string,
  excludeUrls?: Set<string>,
): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return FALLBACK_URL;

  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("orientation", "portrait");
    url.searchParams.set("per_page", "15");
    // ランダムページで異なる結果セットを取得（上位固定を回避）
    const page = Math.floor(Math.random() * 10) + 1;
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) return FALLBACK_URL;

    const data = (await res.json()) as PexelsResponse;
    if (!data.photos || data.photos.length === 0) return FALLBACK_URL;

    // 重複排除: excludeUrlsに含まれない写真を優先
    const candidates = excludeUrls
      ? data.photos.filter((p) => !excludeUrls.has(p.src.large2x))
      : data.photos;
    const pool = candidates.length > 0 ? candidates : data.photos;
    const photo = pool[Math.floor(Math.random() * pool.length)];
    return photo.src.large2x;
  } catch {
    return FALLBACK_URL;
  }
}

// スポットごとにクエリを変えて写真の多様性を確保するジェネリッククエリ
const GENERIC_QUERIES = [
  "bali cafe interior cozy",
  "bali coffee shop aesthetic",
  "tropical cafe wooden table",
  "bali restaurant food",
  "indonesia cafe latte art",
  "bali smoothie bowl cafe",
  "tropical coffee garden",
  "bali brunch cafe",
];

export async function fetchSpotImages(
  area: string,
  category: string,
  spotNames: string[],
  spotAreas?: string[],
): Promise<string[]> {
  void area;
  const usedUrls = new Set<string>();
  const results: string[] = [];

  // 順次実行で重複排除。Pexelsは店名を理解しないので、
  // ジェネリッククエリのバリエーションで多様な写真を取得する
  for (let idx = 0; idx < spotNames.length; idx++) {
    let chosen = FALLBACK_URL;

    // 1. スポットごとに異なるジェネリッククエリ（多様性最優先）
    const q = GENERIC_QUERIES[idx % GENERIC_QUERIES.length]!;
    const url1 = await fetchPexelsImage(q, usedUrls);
    if (url1 !== FALLBACK_URL) { chosen = url1; }

    if (chosen === FALLBACK_URL) {
      // 2. エリア名ベース
      const spotArea = spotAreas?.[idx];
      if (spotArea && spotArea.length > 0) {
        const url2 = await fetchPexelsImage(`${spotArea} bali ${category}`, usedUrls);
        if (url2 !== FALLBACK_URL) { chosen = url2; }
      }
    }

    if (chosen === FALLBACK_URL) {
      // 3. 最終フォールバック
      chosen = await fetchPexelsImage(`tropical cafe coffee`, usedUrls);
    }

    if (chosen !== FALLBACK_URL) usedUrls.add(chosen);
    results.push(chosen);
  }

  return results;
}
