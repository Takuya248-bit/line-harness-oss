import type { Env, ClaudeResponse } from './types';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

const AUTHOR_PERSONA = `あなたはバリで語学学校を経営しながら、LINE公式アカウントの自動化システムを構築しているエンジニア兼マーケターです。
自分の学校でLINE公式アカウントを運用し、体験申込の自動化やリピート促進を実践しています。
「LINE Harness」というオープンソースのLINE CRMを活用し、Lステップなどの有料ツールを使わずに同等以上の機能を実現しています。

文章の特徴:
- 実務経験に基づく具体的なアドバイス（「私の学校では〜」「実際に試したところ〜」）
- 数字で語る（「リピート率が○%向上」「月額○円の削減」）
- 難しい用語は避け、個人事業主でもわかる平易な言葉
- 押し売りしない。読者が自分で判断できる情報を提供する
- 断定的に書く（「〜と言えるでしょう」ではなく「〜です」）`;

const ANTI_AI_RULES = `絶対に守るべき文体ルール:
- 以下の表現を絶対に使わない: 「いかがでしたか」「まとめると」「それでは見ていきましょう」「ここでは〜について解説します」「〜することが重要です」「〜と言えるでしょう」「〜ではないでしょうか」「〜していきましょう」「〜を見ていきます」
- 英語のAI臭フレーズも禁止: comprehensive, delve, dive into, crucial, landscape, leverage, streamline, robust, seamless
- 「〜について」で始まる見出しは禁止（「LINE公式アカウントについて」→「LINE公式アカウントの始め方」）
- 一文は60文字以内を目安に短く切る
- 体言止めや倒置法を適度に使い、リズムを作る
- 「。」の後に同じ語尾が3回続かないようにする（「〜です。〜です。〜です。」は禁止）
- 接続詞のバリエーション: 「また」「さらに」の連続禁止。「ただし」「一方で」「具体的には」「ここで注意したいのが」等を使い分ける
- 架空の数値を捏造しない。具体的な数字を出す場合は、LINE公式の公開情報や一般的な業界データに基づくこと。不確かな数字には「目安として」「一般的に」と前置きする`;

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
  const system = `${AUTHOR_PERSONA}

あなたはSEOとAI検索(GEO)に精通したコンテンツストラテジストでもあります。
Google検索上位 + AI Overviews/ChatGPT Search/Perplexityに引用される記事構成を設計してください。

必須ルール:
- 冒頭1~2文で検索意図に直接回答(結論ファースト)
- H2見出しは読者の疑問に答える形にする（「〜とは？」「〜の方法」「〜の注意点」等）
- 「〜について」で始まる見出しは禁止
- FAQセクション(3~5問)を必ず含める
- 各セクションに独自の経験・データを含める箇所を指定する
- 最終セクションの前にCTA（LINE公式アカウント構築サービスへの自然な誘導）を配置する
- 記事全体で3,000〜5,000文字になる構成にする`;

  const prompt = `対象キーワード: ${keyword}
検索意図: ${intent}

以下のJSON形式で記事構成を出力してください:
{
  "title": "SEO最適化されたタイトル（60文字以内、数字を含める）",
  "meta_description": "メタディスクリプション（120文字以内、行動を促す文末）",
  "slug": "url-friendly-slug",
  "sections": [
    {
      "h2": "見出し2のテキスト",
      "h3s": ["見出し3-1", "見出し3-2"],
      "key_points": ["このセクションで伝えるべきポイント"],
      "experience_note": "ここに含める実体験・独自データの指示"
    }
  ]
}

H2は5-8個、各H2にH3を1-3個。検索意図を網羅しつつ、読者が最後まで読みたくなる構成にしてください。
JSON以外のテキストは出力しないでください。`;

  return callClaude(env, 'claude-haiku-4-5-20251001', system, prompt, 2048);
}

export async function generateSection(
  env: Env,
  keyword: string,
  articleTitle: string,
  sectionOutline: string,
  previousSections: string,
  caseStudyPrompt?: string
): Promise<string> {
  const system = `${AUTHOR_PERSONA}

${ANTI_AI_RULES}

WordPress投稿用のHTMLで記事セクションを執筆してください。

HTML構造ルール:
- h2, h3, p, ul, li, ol, table, thead, tbody, tr, th, td, strong, a タグのみ使用
- Markdown記法は使わない

SEO + GEO対策:
- 各セクション冒頭に要点サマリーを1~2文で入れる(AI引用対策)
- 事実・数値は具体的に（「多くの」→「全体の67%」「月額21,780円」等）
- 定義文は「〇〇とは、△△のことです。」形式で書く
- キーワードを自然に含める（不自然な詰め込みは逆効果）
- 読者への語りかけを適度に入れる（「あなたの教室では〜」「もし〜なら」）`;

  const prompt = `記事タイトル: ${articleTitle}
ターゲットキーワード: ${keyword}
セクション構成:
${sectionOutline}
${previousSections ? `\nこれまでに書いたセクション（内容の重複を避けてください）:\n${previousSections.substring(0, 2000)}` : ''}
${caseStudyPrompt || ''}

このセクションのHTML本文を生成してください。HTMLタグのみ出力し、前後の説明文は不要です。`;

  return callClaude(env, 'claude-sonnet-4-6-20250514', system, prompt, 4096);
}

export async function polishArticle(
  env: Env,
  keyword: string,
  title: string,
  content: string
): Promise<string> {
  const system = `${ANTI_AI_RULES}

あなたは日本語Webコンテンツの校閲者です。以下の記事を校閲・改善してください。

校閲ルール:
1. AIっぽい表現を全て自然な日本語に置換する
2. 同じ語尾が3回以上連続している箇所を修正する
3. 冗長な表現を削る（「することができます」→「できます」）
4. 各セクションの冒頭にサマリー文があることを確認（なければ追加）
5. 記事の冒頭に導入文（3行以内、読者の悩みに共感→この記事で解決できることを宣言）を追加
6. 記事の末尾にCTAを追加（LINE公式アカウント構築サービスへの自然な誘導、押し売りにならない程度）
7. HTMLタグの構造を壊さない

出力は校閲済みのHTML全文のみ。説明やコメントは不要です。`;

  const prompt = `タイトル: ${title}
キーワード: ${keyword}

校閲対象の記事:
${content}`;

  return callClaude(env, 'claude-haiku-4-5-20251001', system, prompt, 8192);
}

export async function generateMetadata(
  env: Env,
  keyword: string,
  content: string
): Promise<{ title: string; meta_description: string; slug: string }> {
  const system = 'SEOメタデータを生成するアシスタントです。JSON以外のテキストは出力しないでください。';

  const prompt = `キーワード: ${keyword}
記事本文の冒頭: ${content.substring(0, 500)}

以下のJSON形式で出力:
{"title": "60文字以内のタイトル（数字を含める）", "meta_description": "120文字以内の説明（行動を促す文末にする）", "slug": "english-slug"}`;

  const result = await callClaude(env, 'claude-haiku-4-5-20251001', system, prompt, 512);
  const match = result.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Failed to parse metadata JSON');
  return JSON.parse(match[0]);
}
