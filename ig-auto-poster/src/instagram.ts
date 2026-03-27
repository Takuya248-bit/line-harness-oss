const GRAPH_API_BASE = "https://graph.facebook.com/v19.0";

interface MediaResponse {
  id: string;
  error?: { message: string };
}

interface PublishResponse {
  id: string;
  error?: { message: string };
}

async function graphPost<T>(
  url: string,
  params: Record<string, string>,
): Promise<T> {
  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (json.error) {
    throw new Error(`Instagram API error: ${json.error.message}`);
  }
  return json;
}

/** Create a single image container (carousel child) */
export async function createMediaContainer(
  imageUrl: string,
  accessToken: string,
  accountId: string,
): Promise<string> {
  const res = await graphPost<MediaResponse>(
    `${GRAPH_API_BASE}/${accountId}/media`,
    {
      image_url: imageUrl,
      is_carousel_item: "true",
      access_token: accessToken,
    },
  );
  return res.id;
}

/** Create carousel container with children */
export async function createCarouselContainer(
  childrenIds: string[],
  caption: string,
  accessToken: string,
  accountId: string,
): Promise<string> {
  const res = await graphPost<MediaResponse>(
    `${GRAPH_API_BASE}/${accountId}/media`,
    {
      media_type: "CAROUSEL",
      children: childrenIds.join(","),
      caption,
      access_token: accessToken,
    },
  );
  return res.id;
}

/** Publish a media container */
export async function publishMedia(
  containerId: string,
  accessToken: string,
  accountId: string,
): Promise<string> {
  const res = await graphPost<PublishResponse>(
    `${GRAPH_API_BASE}/${accountId}/media_publish`,
    {
      creation_id: containerId,
      access_token: accessToken,
    },
  );
  return res.id;
}

/** Full carousel publish flow */
export async function publishCarousel(
  imageUrls: string[],
  caption: string,
  accessToken: string,
  accountId: string,
): Promise<string> {
  // Step 1: Create individual media containers
  const childrenIds: string[] = [];
  for (const url of imageUrls) {
    const id = await createMediaContainer(url, accessToken, accountId);
    childrenIds.push(id);
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  // Step 2: Create carousel container
  const carouselId = await createCarouselContainer(
    childrenIds,
    caption,
    accessToken,
    accountId,
  );

  // Step 3: Wait for processing then publish
  await new Promise((r) => setTimeout(r, 3000));
  const publishedId = await publishMedia(carouselId, accessToken, accountId);

  return publishedId;
}
