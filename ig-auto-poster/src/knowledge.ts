export interface KnowledgeEntry {
  id: number;
  category: string;
  subcategory: string | null;
  title: string;
  content: string;
  tags: string | null;
  source: string;
  reliability: string;
  use_count: number;
}

export interface Guardrail {
  rule_type: string;
  rule: string;
  example: string | null;
  priority: number;
}

/**
 * テーマに関連する知識エントリを取得する。
 * verified優先、use_count昇順（使用頻度が低いものを優先して重複防止）。
 */
export async function fetchKnowledge(
  db: D1Database,
  categories: string[],
  tags: string[],
  limit: number = 8,
): Promise<KnowledgeEntry[]> {
  if (categories.length === 0) return [];

  const placeholders = categories.map(() => "?").join(", ");
  const query = `
    SELECT id, category, subcategory, title, content, tags, source, reliability, use_count
    FROM knowledge_entries
    WHERE category IN (${placeholders})
    ORDER BY
      CASE reliability WHEN 'verified' THEN 0 WHEN 'anecdotal' THEN 1 ELSE 2 END,
      use_count ASC
    LIMIT ?
  `;
  const params: (string | number)[] = [...categories, limit];

  const result = await db.prepare(query).bind(...params).all<KnowledgeEntry>();

  // tagsフィルタ（SQLiteのLIKEでは複数タグのOR検索が煩雑なのでJS側で）
  if (tags.length > 0) {
    const filtered = result.results.filter((entry) =>
      tags.some((tag) => entry.tags?.includes(tag))
    );
    return filtered.length > 0 ? filtered : result.results;
  }

  return result.results;
}

/**
 * プラットフォーム向けのガードレールを取得する。
 */
export async function fetchGuardrails(
  db: D1Database,
  platform: string,
): Promise<Guardrail[]> {
  const result = await db
    .prepare(
      `SELECT rule_type, rule, example, priority
       FROM content_guardrails
       WHERE platform IN (?, 'all')
       ORDER BY priority DESC`
    )
    .bind(platform)
    .all<Guardrail>();
  return result.results;
}

/**
 * 使用したエントリのuse_countをインクリメントする。
 */
export async function incrementUseCount(
  db: D1Database,
  entryIds: number[],
): Promise<void> {
  for (const id of entryIds) {
    await db
      .prepare("UPDATE knowledge_entries SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?")
      .bind(id)
      .run();
  }
}

/**
 * 知識エントリとガードレールをプロンプト用テキストに整形する。
 */
export function formatKnowledgeForPrompt(
  entries: KnowledgeEntry[],
  guardrails: Guardrail[],
): string {
  if (entries.length === 0 && guardrails.length === 0) return "";

  const parts: string[] = [];

  if (entries.length > 0) {
    parts.push("【参考情報（一次情報・事実ベース）】");
    for (const e of entries) {
      parts.push(`- [${e.category}/${e.subcategory ?? "general"}] ${e.title}: ${e.content}`);
    }
  }

  if (guardrails.length > 0) {
    parts.push("\n【表現ルール】");
    for (const g of guardrails) {
      const ex = g.example ? `（例: ${g.example}）` : "";
      parts.push(`- [${g.rule_type}] ${g.rule}${ex}`);
    }
  }

  return parts.join("\n");
}
