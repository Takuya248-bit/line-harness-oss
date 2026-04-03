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

export async function collectInsightsV4(
  db: D1Database,
  accessToken: string,
  accountId: string,
): Promise<void> {
  const posts = await db
    .prepare(
      `SELECT sq.id AS queue_id, sq.ig_media_id, sq.ab_test_meta
       FROM schedule_queue sq
       WHERE sq.status = 'posted'
         AND sq.ig_media_id IS NOT NULL
         AND sq.id NOT IN (SELECT queue_id FROM ab_test_results)
         AND sq.posted_at <= datetime('now', '-2 days')
       LIMIT 20`,
    )
    .all<{ queue_id: number; ig_media_id: string; ab_test_meta: string }>();

  for (const post of posts.results) {
    const url = `https://graph.facebook.com/v21.0/${post.ig_media_id}/insights?metric=saved,reach,shares&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) continue;

    const data = (await res.json()) as { data: { name: string; values: { value: number }[] }[] };
    const metrics: Record<string, number> = {};
    for (const m of data.data) {
      metrics[m.name] = m.values[0]?.value ?? 0;
    }

    const reach = metrics.reach ?? 0;
    const saves = metrics.saved ?? 0;
    const shares = metrics.shares ?? 0;
    const saveRate = reach > 0 ? saves / reach : 0;

    const meta = JSON.parse(post.ab_test_meta || "{}") as { testWeek?: string; isControl?: boolean; testVariant?: string };
    const testRow = meta.testWeek
      ? await db.prepare("SELECT id FROM ab_tests WHERE test_week = ? LIMIT 1").bind(meta.testWeek).first<{ id: number }>()
      : null;

    if (testRow) {
      await db
        .prepare(
          `INSERT INTO ab_test_results (test_id, queue_id, is_control, variant_value, reach, saves, shares, save_rate, collected_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(testRow.id, post.queue_id, meta.isControl ? 1 : 0, meta.testVariant ?? "", reach, saves, shares, saveRate)
        .run();
    }
  }

  const sevenDaysAgo = Math.floor((Date.now() - 7 * 86400000) / 1000);
  const now = Math.floor(Date.now() / 1000);
  const profileUrl = `https://graph.facebook.com/v21.0/${accountId}/insights?metric=profile_views&period=day&since=${sevenDaysAgo}&until=${now}&access_token=${accessToken}`;
  const profileRes = await fetch(profileUrl);
  if (profileRes.ok) {
    const profileData = (await profileRes.json()) as { data: { values: { value: number }[] }[] };
    const totalViews = profileData.data[0]?.values?.reduce((s: number, v: { value: number }) => s + v.value, 0) ?? 0;
    console.log(`Profile views (7d): ${totalViews}`);
  }
}

type ReelInsightsMeta = Record<string, unknown> & {
  reelFormat?: string;
  targetKpi?: string;
  successThreshold?: number;
};

function evaluateReelHypothesis(meta: ReelInsightsMeta, saveRate: number, shareRate: number): boolean | null {
  const th = meta.successThreshold;
  if (typeof th !== "number" || !Number.isFinite(th)) return null;
  const kpi = typeof meta.targetKpi === "string" ? meta.targetKpi.toLowerCase() : "";
  const actual = kpi.includes("share") ? shareRate : saveRate;
  return actual >= th;
}

/**
 * Posted reels: fetch reach/saved/shares, merge into ab_test_meta,
 * evaluate hypothesis vs successThreshold, log per-reelFormat aggregates.
 */
export async function collectReelInsights(
  db: D1Database,
  igAccessToken: string,
  igAccountId: string,
): Promise<void> {
  void igAccountId;

  const rows = await db
    .prepare(
      `SELECT id, ig_media_id, ab_test_meta
       FROM schedule_queue
       WHERE content_type = 'reel'
         AND status = 'posted'
         AND ig_media_id IS NOT NULL
         AND posted_at IS NOT NULL
         AND posted_at <= datetime('now', '-2 days')
       ORDER BY posted_at ASC
       LIMIT 50`,
    )
    .all<{ id: number; ig_media_id: string; ab_test_meta: string | null }>();

  const byFormat = new Map<string, { n: number; sumSaveRate: number; sumShareRate: number }>();

  for (const row of rows.results) {
    const url = `https://graph.facebook.com/v21.0/${row.ig_media_id}/insights?metric=reach,saved,shares&access_token=${igAccessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Reel insights fetch failed ${row.ig_media_id}: ${res.status}`);
      continue;
    }

    const parsed = (await res.json()) as InsightsResponse;
    if (parsed.error) {
      console.error(`Reel insights API error ${row.ig_media_id}: ${parsed.error.message}`);
      continue;
    }

    const metrics: Record<string, number> = {};
    for (const m of parsed.data) {
      metrics[m.name] = m.values[0]?.value ?? 0;
    }

    const reach = metrics.reach ?? 0;
    const saves = metrics.saved ?? 0;
    const shares = metrics.shares ?? 0;
    const saveRate = reach > 0 ? saves / reach : 0;
    const shareRate = reach > 0 ? shares / reach : 0;

    const meta = JSON.parse(row.ab_test_meta || "{}") as ReelInsightsMeta;
    meta.saves = saves;
    meta.reach = reach;
    meta.shares = shares;
    meta.saveRate = saveRate;
    meta.shareRate = shareRate;
    meta.insightsCollectedAt = new Date().toISOString();

    const passed = evaluateReelHypothesis(meta, saveRate, shareRate);
    if (passed === null) meta.hypothesisPassed = null;
    else meta.hypothesisPassed = passed;

    await db
      .prepare(`UPDATE schedule_queue SET ab_test_meta = ? WHERE id = ?`)
      .bind(JSON.stringify(meta), row.id)
      .run();

    const fmt = typeof meta.reelFormat === "string" ? meta.reelFormat : "(no format)";
    const agg = byFormat.get(fmt) ?? { n: 0, sumSaveRate: 0, sumShareRate: 0 };
    agg.n += 1;
    agg.sumSaveRate += saveRate;
    agg.sumShareRate += shareRate;
    byFormat.set(fmt, agg);

    console.log(
      `Reel insights queue#${row.id} ${row.ig_media_id}: reach=${reach} saves=${saves} shares=${shares} hypothesisPassed=${String(passed)}`,
    );
  }

  for (const [fmt, agg] of byFormat) {
    if (agg.n === 0) continue;
    const avgSave = agg.sumSaveRate / agg.n;
    const avgShare = agg.sumShareRate / agg.n;
    console.log(
      `Reel format "${fmt}" weekly aggregate: n=${agg.n} avgSaveRate=${avgSave.toFixed(5)} avgShareRate=${avgShare.toFixed(5)}`,
    );
  }
}
