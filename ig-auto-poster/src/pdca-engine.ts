import { optimizeWeights } from "./optimizer";

/**
 * Engagement score = saves×3 + shares×5 + likes×1
 * PDCA adjusts format_weights, content_templates, then category_weights (optimizeWeights).
 */

interface EngagementScore {
  key: string;
  avgScore: number;
  totalPosts: number;
  currentWeight: number;
}

function adjustWeights(scores: EngagementScore[], minPosts: number): Map<string, number> {
  const optimizable = scores.filter((s) => s.totalPosts >= minPosts);
  const result = new Map<string, number>();

  if (optimizable.length < 2) {
    for (const s of scores) result.set(s.key, s.currentWeight);
    return result;
  }

  const sorted = [...optimizable].sort((a, b) => b.avgScore - a.avgScore);
  const topN = Math.max(1, Math.floor(sorted.length * 0.4));
  const bottomN = Math.max(1, Math.floor(sorted.length * 0.3));
  const topSet = new Set(sorted.slice(0, topN).map((s) => s.key));
  const bottomSet = new Set(sorted.slice(-bottomN).map((s) => s.key));

  for (const s of scores) {
    let w = s.currentWeight;
    if (topSet.has(s.key)) w += 0.05;
    if (bottomSet.has(s.key)) w -= 0.05;
    w = Math.max(0.05, Math.min(0.4, w));
    result.set(s.key, w);
  }

  const total = [...result.values()].reduce((sum, v) => sum + v, 0);
  for (const [k, v] of result) {
    result.set(k, Math.round((v / total) * 100) / 100);
  }

  return result;
}

export async function optimizeFormatWeights(db: D1Database): Promise<void> {
  const rows = await db
    .prepare(
      `
    SELECT fw.format_type, fw.weight,
      COALESCE(AVG(pp.saves * 3 + pp.shares * 5 + pp.likes * 1), 0) as avgScore,
      COUNT(pp.id) as totalPosts
    FROM format_weights fw
    LEFT JOIN post_performance pp ON fw.format_type = pp.format_type
    GROUP BY fw.format_type
  `,
    )
    .all<{ format_type: string; weight: number; avgScore: number; totalPosts: number }>();

  const scores: EngagementScore[] = rows.results.map((r) => ({
    key: r.format_type,
    avgScore: Number(r.avgScore),
    totalPosts: Number(r.totalPosts),
    currentWeight: r.weight,
  }));

  const newWeights = adjustWeights(scores, 3);

  for (const row of rows.results) {
    const w = newWeights.get(row.format_type) ?? row.weight;
    await db
      .prepare(
        `UPDATE format_weights SET weight = ?, avg_engagement = ?, total_posts = ?, updated_at = datetime('now') WHERE format_type = ?`,
      )
      .bind(w, Number(row.avgScore), Number(row.totalPosts), row.format_type)
      .run();
  }
}

export async function optimizeTemplateWeights(db: D1Database): Promise<void> {
  const rows = await db
    .prepare(
      `
    SELECT ct.name, ct.weight,
      COALESCE(AVG(pp.saves * 3 + pp.shares * 5 + pp.likes * 1), 0) as avgScore,
      COUNT(pp.id) as totalPosts
    FROM content_templates ct
    LEFT JOIN generated_content gc ON ct.name = gc.template_name AND gc.ig_media_id IS NOT NULL
    LEFT JOIN post_performance pp ON gc.ig_media_id = pp.ig_media_id
    WHERE ct.enabled = 1
    GROUP BY ct.name
  `,
    )
    .all<{ name: string; weight: number; avgScore: number; totalPosts: number }>();

  const scores: EngagementScore[] = rows.results.map((r) => ({
    key: r.name,
    avgScore: Number(r.avgScore),
    totalPosts: Number(r.totalPosts),
    currentWeight: r.weight,
  }));

  const newWeights = adjustWeights(scores, 2);

  for (const row of rows.results) {
    const w = newWeights.get(row.name) ?? row.weight;
    await db.prepare(`UPDATE content_templates SET weight = ? WHERE name = ?`).bind(w, row.name).run();
  }
}

export async function runPDCA(db: D1Database): Promise<string> {
  await optimizeFormatWeights(db);
  await optimizeTemplateWeights(db);
  await optimizeWeights(db);

  const fmtRows = await db
    .prepare(`SELECT format_type, weight, avg_engagement, total_posts FROM format_weights ORDER BY weight DESC`)
    .all<{ format_type: string; weight: number; avg_engagement: number; total_posts: number }>();

  const tplRows = await db
    .prepare(`SELECT name, weight FROM content_templates WHERE enabled = 1 ORDER BY weight DESC LIMIT 3`)
    .all<{ name: string; weight: number }>();

  const fmtSummary = fmtRows.results.map((r) => `${r.format_type}:${r.weight.toFixed(2)}`).join(", ");
  const tplSummary = tplRows.results.map((r) => `${r.name}:${r.weight.toFixed(2)}`).join(", ");

  return `PDCA完了 フォーマット: ${fmtSummary} / テンプレTop3: ${tplSummary}`;
}
