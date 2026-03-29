import { sendNotification } from "./line-preview";

interface CategoryScore {
  category: string;
  avgSaves: number;
  totalPosts: number;
  currentWeight: number;
}

/**
 * カテゴリ別スコアを算出し、比率を更新する。
 * - 投稿3件未満のカテゴリは最適化対象外
 * - 上位3カテゴリ: +0.05、下位2カテゴリ: -0.05
 * - 制約: 最低0.05、最大0.30
 * - 正規化して合計1.0
 */
export async function optimizeWeights(db: D1Database): Promise<CategoryScore[]> {
  // カテゴリ別の平均保存数を算出
  const scores = await db
    .prepare(`
      SELECT
        cw.category,
        cw.weight as currentWeight,
        COALESCE(AVG(pp.saves), 0) as avgSaves,
        COUNT(pp.id) as totalPosts
      FROM category_weights cw
      LEFT JOIN post_performance pp ON cw.category = pp.category
      GROUP BY cw.category
      ORDER BY avgSaves DESC
    `)
    .all<CategoryScore>();

  const categories = scores.results;
  if (categories.length === 0) return [];

  // 最適化対象（3件以上投稿があるカテゴリ）
  const optimizable = categories.filter((c) => c.totalPosts >= 3);
  if (optimizable.length < 3) {
    // 十分なデータがないので比率変更なし
    console.log(`Optimization skipped: only ${optimizable.length} categories have 3+ posts`);
    return categories;
  }

  // 上位3カテゴリ / 下位2カテゴリを特定
  const sorted = [...optimizable].sort((a, b) => b.avgSaves - a.avgSaves);
  const top3 = new Set(sorted.slice(0, 3).map((c) => c.category));
  const bottom2 = new Set(sorted.slice(-2).map((c) => c.category));

  // 比率更新
  const newWeights: { category: string; weight: number }[] = [];
  for (const cat of categories) {
    let weight = cat.currentWeight;
    if (top3.has(cat.category)) weight += 0.05;
    if (bottom2.has(cat.category)) weight -= 0.05;
    weight = Math.max(0.05, Math.min(0.30, weight));
    newWeights.push({ category: cat.category, weight });
  }

  // 正規化
  const totalWeight = newWeights.reduce((sum, c) => sum + c.weight, 0);
  for (const w of newWeights) {
    w.weight = Math.round((w.weight / totalWeight) * 100) / 100;
  }

  // DB更新
  for (const w of newWeights) {
    const score = categories.find((c) => c.category === w.category);
    await db
      .prepare("UPDATE category_weights SET weight = ?, avg_saves = ?, total_posts = ?, updated_at = datetime('now') WHERE category = ?")
      .bind(w.weight, score?.avgSaves ?? 0, score?.totalPosts ?? 0, w.category)
      .run();
  }

  console.log("Weights updated:", newWeights);
  return categories;
}

/** LINE週次レポート送信 */
export async function sendWeeklyReport(
  scores: CategoryScore[],
  userId: string,
  channelAccessToken: string,
): Promise<void> {
  const sorted = [...scores].sort((a, b) => b.avgSaves - a.avgSaves);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  const ranking = sorted
    .map((c, i) => `${i + 1}. ${c.category}: 平均${Math.round(c.avgSaves)}保存 (${c.totalPosts}件)`)
    .join("\n");

  const totalSaves = sorted.reduce((sum, c) => sum + c.avgSaves * c.totalPosts, 0);
  const totalPosts = sorted.reduce((sum, c) => sum + c.totalPosts, 0);

  const text = `IG週次レポート (${formatDate(weekAgo)}〜${formatDate(now)})

カテゴリ別保存数:
${ranking}

総投稿数: ${totalPosts}本
推定総保存数: ${Math.round(totalSaves)}`;

  await sendNotification(text, userId, channelAccessToken);
}
