import type { Env, ClaudeResponse } from './types';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude(
  env: Env,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096
): Promise<string> {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as ClaudeResponse;
  return data.content[0].text;
}

export async function generateOutline(env: Env, keyword: string, intent: string): Promise<string> {
  const system = `あなたはSEOに精通した日本語コンテンツストラテジストです。
検索上位を狙える記事構成を設計してください。`;

  const prompt = `対象キーワード: ${keyword}
検索意図: ${intent}

以下のJSON形式で記事構成を出力してください:
{
  "title": "SEO最適化されたタイトル（60文字以内）",
  "meta_description": "メタディスクリプション（120文字以内）",
  "slug": "url-friendly-slug",
  "sections": [
    {
      "h2": "見出し2のテキスト",
      "h3s": ["見出し3-1", "見出し3-2"],
      "key_points": ["このセクションで伝えるべきポイント"]
    }
  ]
}

H2は5-8個、各H2にH3を1-3個。検索意図を網羅する構成にしてください。`;

  return callClaude(env, 'claude-haiku-4-5-20251001', system, prompt, 2048);
}

export async function generateSection(
  env: Env,
  keyword: string,
  articleTitle: string,
  sectionOutline: string
): Promise<string> {
  const system = `あなたはSEOライターです。WordPress投稿用のHTMLで記事セクションを執筆してください。
- h2, h3, p, ul, li, table, strong タグのみ使用
- Markdown記法は使わない
- 自然な日本語で、読みやすく情報量が豊富な文章
- キーワードを自然に含める`;

  const prompt = `記事タイトル: ${articleTitle}
ターゲットキーワード: ${keyword}
セクション構成:
${sectionOutline}

このセクションのHTML本文を生成してください。`;

  return callClaude(env, 'claude-sonnet-4-6-20250514', system, prompt, 4096);
}

export async function generateMetadata(
  env: Env,
  keyword: string,
  content: string
): Promise<{ title: string; meta_description: string; slug: string }> {
  const system = 'SEOメタデータを生成するアシスタントです。JSON形式で出力してください。';

  const prompt = `キーワード: ${keyword}
記事本文の冒頭: ${content.substring(0, 500)}

以下のJSON形式で出力:
{"title": "60文字以内のタイトル", "meta_description": "120文字以内の説明", "slug": "english-slug"}`;

  const result = await callClaude(env, 'claude-haiku-4-5-20251001', system, prompt, 512);
  return JSON.parse(result);
}
