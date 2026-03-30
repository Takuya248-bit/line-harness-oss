export interface PhotoResult {
  imageUrl: string;
  attribution: string;
}

// Serper.dev Google画像検索
async function searchSerper(
  query: string,
  apiKey: string,
): Promise<PhotoResult | null> {
  const res = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "id",
      hl: "ja",
      num: 5,
    }),
  });

  if (!res.ok) {
    console.error(`Serper search failed: ${res.status}`);
    return null;
  }

  const data = await res.json() as { images?: { imageUrl: string; title: string; source: string }[] };
  if (!data.images || data.images.length === 0) return null;

  // ランダムに上位5件から選択
  const img = data.images[Math.floor(Math.random() * Math.min(5, data.images.length))];
  return {
    imageUrl: img.imageUrl,
    attribution: img.source || "",
  };
}

// Unsplash（フォールバック）
const UNSPLASH_API = "https://api.unsplash.com";

interface UnsplashPhoto {
  id: string;
  urls: { raw: string };
  user: { name: string };
}

async function searchUnsplash(
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

  if (!res.ok) return null;

  const data = await res.json() as { results: UnsplashPhoto[] };
  if (data.results.length === 0) return null;

  const photo = data.results[Math.floor(Math.random() * data.results.length)];
  return {
    imageUrl: `${photo.urls.raw}&w=1080&h=1350&fit=crop&crop=entropy`,
    attribution: `Photo by ${photo.user.name} on Unsplash`,
  };
}

// カテゴリ別の検索クエリテンプレート
const CATEGORY_SEARCH_QUERIES: Record<string, string> = {
  cafe: "カフェ 内装 バリ島",
  spot: "観光 バリ島",
  food: "料理 バリ島",
  beach: "ビーチ バリ島",
  lifestyle: "暮らし バリ島",
  cost: "バリ島 生活",
  visa: "バリ島 空港",
  culture: "バリ島 祭り",
};

/** メイン: Serper優先、Unsplashフォールバック */
export async function searchPhoto(
  query: string,
  serperKey: string,
  unsplashKey: string,
): Promise<PhotoResult | null> {
  // Serperで実写検索
  const serperResult = await searchSerper(query, serperKey);
  if (serperResult) return serperResult;

  // Unsplashフォールバック
  return searchUnsplash(query, unsplashKey);
}

/** スポット用: 各スポットの写真を取得 */
export async function searchPhotosForSpots(
  spots: { name: string; area: string }[],
  coverQuery: string,
  category: string,
  serperKey: string,
  unsplashKey: string,
): Promise<{ cover: PhotoResult | null; spots: (PhotoResult | null)[] }> {
  // カバー写真
  const coverSearch = `${coverQuery} バリ島`;
  const cover = await searchPhoto(coverSearch, serperKey, unsplashKey);

  // 各スポットの写真
  const spotPhotos: (PhotoResult | null)[] = [];
  for (const spot of spots) {
    // 店名/スポット名で実写検索
    const photo = await searchPhoto(
      `${spot.name} ${spot.area} バリ`,
      serperKey,
      unsplashKey,
    );
    if (!photo) {
      // カテゴリ汎用クエリでフォールバック
      const fallbackQuery = CATEGORY_SEARCH_QUERIES[category] ?? "バリ島";
      const fallback = await searchPhoto(fallbackQuery, serperKey, unsplashKey);
      spotPhotos.push(fallback);
    } else {
      spotPhotos.push(photo);
    }
  }

  return { cover, spots: spotPhotos };
}
