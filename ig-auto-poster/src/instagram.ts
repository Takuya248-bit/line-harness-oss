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

interface ContainerStatusResponse {
  status_code?: string;
  error?: { message: string };
}

/** Reels container creation (Instagram Graph API v19.0) */
export async function createReelsContainer(
  videoUrl: string,
  caption: string,
  accessToken: string,
  accountId: string,
): Promise<string> {
  const res = await graphPost<MediaResponse>(
    `${GRAPH_API_BASE}/${accountId}/media`,
    {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: accessToken,
    },
  );
  return res.id;
}

async function waitForProcessing(
  containerId: string,
  accessToken: string,
  maxRetries: number = 30,
): Promise<void> {
  const url = `${GRAPH_API_BASE}/${containerId}`;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 5000));
    }
    const statusUrl = `${url}?fields=${encodeURIComponent("status_code")}&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(statusUrl);
    const json = (await res.json()) as ContainerStatusResponse;
    if (json.error) {
      throw new Error(`Instagram API error: ${json.error.message}`);
    }
    const code = json.status_code;
    if (code === "FINISHED") return;
    if (code === "ERROR") {
      throw new Error("Instagram Reels container processing failed: status_code ERROR");
    }
  }
  throw new Error(
    `Instagram Reels container processing timed out after ${maxRetries} polls`,
  );
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

/** Full Reels publish flow */
export async function publishReel(
  videoUrl: string,
  caption: string,
  accessToken: string,
  accountId: string,
): Promise<string> {
  const containerId = await createReelsContainer(
    videoUrl,
    caption,
    accessToken,
    accountId,
  );
  await waitForProcessing(containerId, accessToken);
  return publishMedia(containerId, accessToken, accountId);
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
