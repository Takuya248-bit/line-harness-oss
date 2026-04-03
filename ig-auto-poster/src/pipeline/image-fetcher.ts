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

export async function fetchSpotImages(
  area: string,
  category: string,
  spotNames: string[],
  spotAreas?: string[],
): Promise<string[]> {
  void area;
  const usedUrls = new Set<string>();
  const results: string[] = [];

  // 順次実行で重複排除を確実にする
  for (let idx = 0; idx < spotNames.length; idx++) {
    const spotName = spotNames[idx]!;
    let chosen = FALLBACK_URL;

    // 1. 実在店名 + cafe + bali
    const url1 = await fetchPexelsImage(`${spotName} cafe bali`, usedUrls);
    if (url1 !== FALLBACK_URL) { chosen = url1; }
    else {
      // 2. エリア名 + bali + category
      const spotArea = spotAreas?.[idx];
      if (spotArea && spotArea.length > 0) {
        const url2 = await fetchPexelsImage(`${spotArea} bali ${category}`, usedUrls);
        if (url2 !== FALLBACK_URL) { chosen = url2; }
      }
    }

    if (chosen === FALLBACK_URL) {
      // 3. ジェネリック: bali cafe interior
      const url3 = await fetchPexelsImage(`bali ${category} interior`, usedUrls);
      if (url3 !== FALLBACK_URL) { chosen = url3; }
    }

    if (chosen === FALLBACK_URL) {
      // 4. 最終: tropical cafe
      chosen = await fetchPexelsImage(`tropical cafe coffee`, usedUrls);
    }

    if (chosen !== FALLBACK_URL) usedUrls.add(chosen);
    results.push(chosen);
  }

  return results;
}
