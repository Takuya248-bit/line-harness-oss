// CS対応完了時に留学関連Q&AをNotionナレッジDBへ自動蓄積するサービス

const CS_KEYWORDS = [
  '留学', '英語', 'バリ', '費用', 'ビザ', '期間', '寮', '治安', '初心者',
] as const;

const ANXIETY_PATTERNS = ['心配', '不安', '大丈夫'];
const PRICING_PATTERNS = ['費用', '料金', '価格', '円', 'コスト'];

type KnowledgeCategory = 'FAQ' | 'concern' | 'pricing';

interface NotionConfig {
  apiKey: string;
  dbId: string;
}

function detectCategory(message: string): KnowledgeCategory {
  if (PRICING_PATTERNS.some((p) => message.includes(p))) return 'pricing';
  if (ANXIETY_PATTERNS.some((p) => message.includes(p))) return 'concern';
  return 'FAQ';
}

function matchedKeywords(message: string): string[] {
  return CS_KEYWORDS.filter((kw) => message.includes(kw));
}

export async function extractCSKnowledge(
  message: string,
  reply: string,
  notionConfig: NotionConfig,
): Promise<void> {
  const keywords = matchedKeywords(message);
  if (keywords.length === 0) return;

  const category = detectCategory(message);
  const title = message.slice(0, 50);
  const content = `Q: ${message}\nA: ${reply}`;

  const body = {
    parent: { database_id: notionConfig.dbId },
    properties: {
      Title: { title: [{ text: { content: title } }] },
      category: { select: { name: 'education' } },
      subcategory: { select: { name: category } },
      content: { rich_text: [{ text: { content } }] },
      tags: { multi_select: keywords.map((kw) => ({ name: kw })) },
      source: { select: { name: 'client_feedback' } },
      reliability: { select: { name: 'verified' } },
    },
  };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionConfig.apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error ${res.status}: ${err}`);
  }
}
