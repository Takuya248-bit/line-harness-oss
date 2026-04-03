import { publishCarousel, publishReel } from "../instagram";
import { getNextScheduledPost, markPosted } from "../pipeline/scheduler";

export async function handleDailyPostCron(
  db: D1Database,
  igAccessToken: string,
  igAccountId: string,
): Promise<void> {
  const today = new Date().toISOString().split("T")[0]!;
  const post = await getNextScheduledPost(db, today);

  if (!post) {
    console.log("No approved post scheduled for today.");
    return;
  }

  const mediaUrls = JSON.parse(post.media_urls) as string[];

  if (post.content_type === "carousel") {
    const igMediaId = await publishCarousel(mediaUrls, post.caption, igAccessToken, igAccountId);
    await markPosted(db, post.id, igMediaId);
    console.log(`Posted carousel ${post.id}, IG media: ${igMediaId}`);
  } else if (post.content_type === "reel") {
    const videoUrl = mediaUrls[0]!;
    const igMediaId = await publishReel(videoUrl, post.caption, igAccessToken, igAccountId);
    await markPosted(db, post.id, igMediaId);
    console.log(`Posted reel ${post.id}, IG media: ${igMediaId}`);
  }
}
