const GRAPH_API_BASE = "https://graph.facebook.com/v19.0";

interface InsightsMetric {
  name: string;
  values: { value: number }[];
}

interface InsightsResponse {
  data: InsightsMetric[];
  error?: { message: string };
}

export interface PostMetrics {
  igMediaId: string;
  saves: number;
  likes: number;
  comments: number;
  reach: number;
  shares: number;
}

/** 1投稿のInsightsを取得 */
async function fetchMediaInsights(
  mediaId: string,
  accessToken: string,
): Promise<PostMetrics | null> {
  const url = `${GRAPH_API_BASE}/${mediaId}/insights?metric=saved,likes,comments,reach,shares&access_token=${accessToken}`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`Insights fetch failed for ${mediaId}: ${res.status}`);
    return null;
  }

  const data = await res.json() as InsightsResponse;
  if (data.error) {
    console.error(`Insights API error for ${mediaId}: ${data.error.message}`);
    return null;
  }

  const metrics: Record<string, number> = {};
  for (const m of data.data) {
    metrics[m.name] = m.values[0]?.value ?? 0;
  }

  return {
    igMediaId: mediaId,
    saves: metrics.saved ?? 0,
    likes: metrics.likes ?? 0,
    comments: metrics.comments ?? 0,
    reach: metrics.reach ?? 0,
    shares: metrics.shares ?? 0,
  };
}

/**
 * 投稿後7日以上経過し、まだ計測していない投稿のInsightsを取得してDBに保存する。
 */
export async function collectInsights(
  db: D1Database,
  accessToken: string,
): Promise<PostMetrics[]> {
  // 投稿済みかつ7日以上経過かつ未計測の投稿を取得
  const rows = await db
    .prepare(`
      SELECT gc.id, gc.ig_media_id, gc.category,
        COALESCE(NULLIF(TRIM(gc.format_type), ''), 'carousel') as format_type
      FROM generated_content gc
      WHERE gc.status = 'posted'
        AND gc.ig_media_id IS NOT NULL
        AND gc.posted_at IS NOT NULL
        AND julianday('now') - julianday(gc.posted_at) >= 7
        AND NOT EXISTS (
          SELECT 1 FROM post_performance pp WHERE pp.ig_media_id = gc.ig_media_id
        )
      ORDER BY gc.posted_at ASC
      LIMIT 20
    `)
    .all<{ id: number; ig_media_id: string; category: string; format_type: string }>();

  const results: PostMetrics[] = [];

  for (const row of rows.results) {
    const metrics = await fetchMediaInsights(row.ig_media_id, accessToken);
    if (!metrics) continue;

    await db
      .prepare(`
        INSERT INTO post_performance (ig_media_id, category, saves, likes, comments, reach, shares, format_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        row.ig_media_id,
        row.category,
        metrics.saves,
        metrics.likes,
        metrics.comments,
        metrics.reach,
        metrics.shares,
        row.format_type,
      )
      .run();

    results.push(metrics);
    console.log(
      `Insights collected: ${row.ig_media_id} (${row.category}) saves=${metrics.saves} shares=${metrics.shares}`,
    );
  }

  return results;
}
