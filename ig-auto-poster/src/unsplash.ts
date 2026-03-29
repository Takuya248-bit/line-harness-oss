const UNSPLASH_API = "https://api.unsplash.com";

interface UnsplashPhoto {
  id: string;
  urls: { raw: string; full: string; regular: string };
  user: { name: string; username: string };
  alt_description: string | null;
}

export interface PhotoResult {
  imageUrl: string;
  attribution: string;
}

export async function searchPhoto(
  query: string,
  accessKey: string,
): Promise<PhotoResult | null> {
  const params = new URLSearchParams({
    query,
    per_page: "5",
    orientation: "portrait",
    content_filter: "high",
  });

  const res = await fetch(`${UNSPLASH_API}/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });

  if (!res.ok) {
    console.error(`Unsplash search failed: ${res.status}`);
    return null;
  }

  const data = await res.json() as { results: UnsplashPhoto[] };
  if (data.results.length === 0) return null;

  const photo = data.results[Math.floor(Math.random() * data.results.length)];
  const imageUrl = `${photo.urls.raw}&w=1080&h=1350&fit=crop&crop=entropy`;
  const attribution = `Photo by ${photo.user.name} on Unsplash`;

  return { imageUrl, attribution };
}

export async function searchPhotosForSpots(
  spots: { name: string; area: string }[],
  coverQuery: string,
  accessKey: string,
): Promise<{ cover: PhotoResult | null; spots: (PhotoResult | null)[] }> {
  const cover = await searchPhoto(`${coverQuery} Bali`, accessKey);

  const spotPhotos: (PhotoResult | null)[] = [];
  for (const spot of spots) {
    const photo = await searchPhoto(
      `${spot.name} ${spot.area} Bali`,
      accessKey,
    );
    if (!photo) {
      const fallback = await searchPhoto(`${spot.area} Bali`, accessKey);
      spotPhotos.push(fallback);
    } else {
      spotPhotos.push(photo);
    }
  }

  return { cover, spots: spotPhotos };
}
