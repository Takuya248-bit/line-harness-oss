/**
 * SEO writer用の知識DB参照モジュール
 * KNOWLEDGE_DB (ig-auto-poster-db) から知識を取得する
 */

export interface KnowledgeEntry {
  id: number;
  category: string;
  subcategory: string | null;
  title: string;
  content: string;
  tags: string | null;
}

export interface Guardrail {
  rule_type: string;
  rule: string;
  example: string | null;
  priority: number;
}

export async function fetchKnowledgeForSEO(
  db: D1Database,
  keyword: string,
): Promise<{ entries: KnowledgeEntry[]; guardrails: Guardrail[] }> {
  // SEO記事はLINE構築系が多い → barilingual, evidence カテゴリを優先
  // キーワードに応じてカテゴリを動的選択
  const categories: string[] = [];
  const kw = keyword.toLowerCase();

  if (kw.includes("バリ") || kw.includes("留学") || kw.includes("英語")) {
    categories.push("bali_area", "study_faq", "barilingual", "english_learning", "evidence");
  }
  if (kw.includes("line") || kw.includes("公式") || kw.includes("crm")) {
    // LINE系記事は現時点で知識DBにカテゴリなし → 空で返す
  }

  if (categories.length === 0) {
    return { entries: [], guardrails: [] };
  }

  const placeholders = categories.map(() => "?").join(", ");
  const entries = await db
    .prepare(
      `SELECT id, category, subcategory, title, content, tags
       FROM knowledge_entries
       WHERE category IN (${placeholders})
       ORDER BY CASE reliability WHEN 'verified' THEN 0 ELSE 1 END, use_count ASC
       LIMIT 15`
    )
    .bind(...categories)
    .all<KnowledgeEntry>();

  const guardrails = await db
    .prepare(
      `SELECT rule_type, rule, example, priority
       FROM content_guardrails
       WHERE platform IN ('seo', 'all')
       ORDER BY priority DESC`
    )
    .all<Guardrail>();

  return {
    entries: entries.results,
    guardrails: guardrails.results,
  };
}

export function formatKnowledgeForSEO(
  entries: KnowledgeEntry[],
  guardrails: Guardrail[],
): string {
  if (entries.length === 0 && guardrails.length === 0) return "";

  const parts: string[] = [];

  if (entries.length > 0) {
    parts.push("\n実体験・一次情報（記事に自然に組み込むこと）:");
    for (const e of entries) {
      parts.push(`- ${e.title}: ${e.content}`);
    }
  }

  if (guardrails.length > 0) {
    parts.push("\n追加の表現ルール:");
    for (const g of guardrails) {
      parts.push(`- ${g.rule}`);
    }
  }

  return parts.join("\n");
}
