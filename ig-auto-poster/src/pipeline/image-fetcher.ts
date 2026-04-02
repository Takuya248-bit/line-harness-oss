const FALLBACK_URL = "https://images.unsplash.com/photo-placeholder?w=1080&h=1350";

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
  spotNames: string[]
): Promise<string[]> {
  // category is reserved for future use
  void category;

  const results = await Promise.all(
    spotNames.map((spotName) =>
      fetchPexelsImage(`${area} ${spotName} bali`)
    )
  );

  return results;
}
