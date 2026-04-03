export const FALLBACK_URL = "https://images.unsplash.com/photo-placeholder?w=1080&h=1350";

interface PexelsPhoto {
  src: {
    large2x: string;
  };
}

interface PexelsResponse {
  photos: PexelsPhoto[];
}

export async function fetchPexelsImage(query: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return FALLBACK_URL;

  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("orientation", "portrait");
    url.searchParams.set("per_page", "5");

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) return FALLBACK_URL;

    const data = (await res.json()) as PexelsResponse;
    if (!data.photos || data.photos.length === 0) return FALLBACK_URL;

    const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
    return photo.src.large2x;
  } catch {
    return FALLBACK_URL;
  }
}

export async function fetchSpotImages(
  area: string,
  category: string,
  spotNames: string[],
  spotAreas?: string[],
): Promise<string[]> {
  void area;
  const results = await Promise.all(
    spotNames.map(async (spotName, idx) => {
      // 1. 実在店名 + bali + category
      const url1 = await fetchPexelsImage(`${spotName} bali ${category}`);
      if (url1 !== FALLBACK_URL) return url1;

      // 2. エリア名 + bali + category（エリア情報がある場合）
      const spotArea = spotAreas?.[idx];
      if (spotArea) {
        const url2 = await fetchPexelsImage(`${spotArea} bali ${category}`);
        if (url2 !== FALLBACK_URL) return url2;
      }

      // 3. ジェネリック検索
      const url3 = await fetchPexelsImage(`bali ${category} interior`);
      if (url3 !== FALLBACK_URL) return url3;

      // 4. 最終フォールバック
      return fetchPexelsImage(`bali coffee shop`);
    })
  );
  return results;
}
