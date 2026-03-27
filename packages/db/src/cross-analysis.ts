/**
 * Cross-analysis queries (Lステップ「クロス分析」相当)
 * Tag × Tag and Tag × Scenario correlation analysis
 */

// ========== Interfaces ==========

export interface TagOverlapCell {
  tagIdA: string;
  tagIdB: string;
  overlapCount: number;
}

export interface TagCount {
  tagId: string;
  count: number;
}

export interface CrossTagResult {
  tagCounts: TagCount[];
  matrix: TagOverlapCell[];
}

export interface TagScenarioCell {
  tagId: string;
  scenarioId: string;
  activeCount: number;
  completedCount: number;
  notEnrolledCount: number;
}

export interface CrossTagScenarioResult {
  tagCounts: TagCount[];
  cells: TagScenarioCell[];
}

// ========== Functions ==========

/**
 * Tag × Tag cross-analysis.
 * Returns each tag's holder count and the overlap (intersection) count for every pair.
 */
export async function crossAnalyzeTagVsTag(
  db: D1Database,
  lineAccountId: string,
  tagIds: string[],
): Promise<CrossTagResult> {
  if (tagIds.length === 0) {
    return { tagCounts: [], matrix: [] };
  }

  // 1. Count holders per tag (filtered by lineAccountId via friends table)
  const placeholders = tagIds.map(() => '?').join(',');
  const tagCountRows = await db
    .prepare(
      `SELECT ft.tag_id, COUNT(DISTINCT ft.friend_id) as cnt
       FROM friend_tags ft
       JOIN friends f ON f.id = ft.friend_id
       WHERE f.line_account_id = ?
         AND ft.tag_id IN (${placeholders})
       GROUP BY ft.tag_id`,
    )
    .bind(lineAccountId, ...tagIds)
    .all<{ tag_id: string; cnt: number }>();

  const tagCounts: TagCount[] = tagCountRows.results.map((r) => ({
    tagId: r.tag_id,
    count: r.cnt,
  }));

  // 2. Overlap matrix: for each pair (A, B), count friends who have both tags
  const matrix: TagOverlapCell[] = [];

  for (let i = 0; i < tagIds.length; i++) {
    for (let j = i + 1; j < tagIds.length; j++) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM friend_tags ftA
           JOIN friend_tags ftB ON ftA.friend_id = ftB.friend_id
           JOIN friends f ON f.id = ftA.friend_id
           WHERE f.line_account_id = ?
             AND ftA.tag_id = ?
             AND ftB.tag_id = ?`,
        )
        .bind(lineAccountId, tagIds[i], tagIds[j])
        .first<{ cnt: number }>();

      matrix.push({
        tagIdA: tagIds[i],
        tagIdB: tagIds[j],
        overlapCount: row?.cnt ?? 0,
      });
    }
  }

  return { tagCounts, matrix };
}

/**
 * Tag × Scenario cross-analysis.
 * For each tag, count how many of its holders are active/completed/not-enrolled in each scenario.
 */
export async function crossAnalyzeTagVsScenario(
  db: D1Database,
  lineAccountId: string,
  tagIds: string[],
  scenarioIds: string[],
): Promise<CrossTagScenarioResult> {
  if (tagIds.length === 0 || scenarioIds.length === 0) {
    return { tagCounts: [], cells: [] };
  }

  const tagPlaceholders = tagIds.map(() => '?').join(',');

  // 1. Count holders per tag
  const tagCountRows = await db
    .prepare(
      `SELECT ft.tag_id, COUNT(DISTINCT ft.friend_id) as cnt
       FROM friend_tags ft
       JOIN friends f ON f.id = ft.friend_id
       WHERE f.line_account_id = ?
         AND ft.tag_id IN (${tagPlaceholders})
       GROUP BY ft.tag_id`,
    )
    .bind(lineAccountId, ...tagIds)
    .all<{ tag_id: string; cnt: number }>();

  const tagCounts: TagCount[] = tagCountRows.results.map((r) => ({
    tagId: r.tag_id,
    count: r.cnt,
  }));

  // 2. For each (tag, scenario) pair, count active/completed/not-enrolled
  const cells: TagScenarioCell[] = [];

  for (const tagId of tagIds) {
    for (const scenarioId of scenarioIds) {
      const row = await db
        .prepare(
          `SELECT
             SUM(CASE WHEN fs.status = 'active' THEN 1 ELSE 0 END) as active_count,
             SUM(CASE WHEN fs.status = 'completed' THEN 1 ELSE 0 END) as completed_count
           FROM friend_tags ft
           JOIN friends f ON f.id = ft.friend_id
           LEFT JOIN friend_scenarios fs ON fs.friend_id = ft.friend_id AND fs.scenario_id = ?
           WHERE f.line_account_id = ?
             AND ft.tag_id = ?`,
        )
        .bind(scenarioId, lineAccountId, tagId)
        .first<{ active_count: number; completed_count: number }>();

      // Total tag holders for this tag
      const totalForTag = tagCounts.find((t) => t.tagId === tagId)?.count ?? 0;
      const active = row?.active_count ?? 0;
      const completed = row?.completed_count ?? 0;

      cells.push({
        tagId,
        scenarioId,
        activeCount: active,
        completedCount: completed,
        notEnrolledCount: totalForTag - active - completed,
      });
    }
  }

  return { tagCounts, cells };
}
