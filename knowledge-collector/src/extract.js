const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KNOWLEDGE_API_URL = process.env.KNOWLEDGE_API_URL || "https://ig-auto-poster.archbridge24.workers.dev/api/knowledge";

export async function extractFacts(pageContent, extractInstruction) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `以下のWebページから事実・数字・変更点を抽出してください。
抽出対象: ${extractInstruction}

ルール:
- 事実と数字のみ。意見・推測は除外
- 日付がある情報は日付を含める
- 新しい情報・変更があったものだけ抽出
- 抽出するものがなければ空配列を返す
- JSON配列で返す（JSON以外のテキスト不要）: [{"title": "短いタイトル", "content": "事実の説明", "tags": "tag1,tag2"}]

Webページ内容:
${pageContent.slice(0, 4000)}`
      }],
    }),
  });

  if (!response.ok) {
    console.error(`[extract] Haiku API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const text = data.content[0].text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    return JSON.parse(match[0]);
  } catch {
    console.error("[extract] JSON parse error");
    return [];
  }
}

export async function insertKnowledge(entry, category, subcategory, sourceUrl) {
  const response = await fetch(KNOWLEDGE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category,
      subcategory,
      title: entry.title,
      content: entry.content,
      tags: entry.tags || "",
      source: "research",
      reliability: "unverified",
      source_url: sourceUrl,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[insert] API error: ${err}`);
    return false;
  }
  return true;
}
