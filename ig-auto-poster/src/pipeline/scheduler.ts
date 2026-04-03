import type { ABTestMeta, GeneratedPost } from "./types";

export function buildScheduleDates(startDate: string, count: number): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00Z");
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().split("T")[0]!);
  }
  return dates;
}

export function buildInsertParams(
  contentType: string,
  contentJson: string,
  caption: string,
  mediaUrls: string,
  scheduledDate: string,
  scheduledTime: string,
  abTestMeta: ABTestMeta,
): (string | null)[] {
  return [
    contentType,
    contentJson,
    caption,
    mediaUrls,
    scheduledDate,
    scheduledTime,
    JSON.stringify(abTestMeta),
  ];
}

export async function enqueuePost(
  db: D1Database,
  post: GeneratedPost,
  scheduledDate: string,
  scheduledTime: string = "18:00",
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO schedule_queue
       (content_type, content_json, caption, media_urls, scheduled_date, scheduled_time, status, ab_test_meta)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(
      ...buildInsertParams(
        post.contentType,
        post.contentJson,
        post.caption,
        JSON.stringify(post.mediaUrls),
        scheduledDate,
        scheduledTime,
        post.abTestMeta,
      ),
    )
    .run();

  return result.meta.last_row_id;
}

export async function enqueueWeekly(
  db: D1Database,
  posts: GeneratedPost[],
  startDate: string,
  scheduledTime: string = "18:00",
): Promise<number[]> {
  const dates = buildScheduleDates(startDate, posts.length);
  const ids: number[] = [];
  for (let i = 0; i < posts.length; i++) {
    const id = await enqueuePost(db, posts[i]!, dates[i]!, scheduledTime);
    ids.push(id);
  }
  return ids;
}

export async function enqueueWeeklyReels(
  db: D1Database,
  posts: GeneratedPost[],
  startDate: string,
): Promise<number[]> {
  const scheduledTime = "12:00";
  const dates = buildScheduleDates(startDate, posts.length);
  const ids: number[] = [];
  for (let i = 0; i < posts.length; i++) {
    const id = await enqueuePost(db, posts[i]!, dates[i]!, scheduledTime);
    ids.push(id);
  }
  return ids;
}

export async function getNextScheduledPost(
  db: D1Database,
  today: string,
): Promise<{ id: number; content_type: string; content_json: string; caption: string; media_urls: string } | null> {
  return db
    .prepare(
      `SELECT id, content_type, content_json, caption, media_urls
       FROM schedule_queue
       WHERE status = 'approved' AND scheduled_date <= ?
       ORDER BY scheduled_date ASC, scheduled_time ASC
       LIMIT 1`,
    )
    .bind(today)
    .first();
}

export async function markPosted(
  db: D1Database,
  queueId: number,
  igMediaId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE schedule_queue SET status = 'posted', posted_at = datetime('now'), ig_media_id = ? WHERE id = ?`,
    )
    .bind(igMediaId, queueId)
    .run();
}

export async function approveAllPending(db: D1Database): Promise<number> {
  const result = await db
    .prepare(`UPDATE schedule_queue SET status = 'approved' WHERE status = 'pending'`)
    .run();
  return result.meta.changes;
}
