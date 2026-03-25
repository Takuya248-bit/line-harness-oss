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
- 架空の数値を捏造しない。具体的な数字を出す場合は、LINE公式の公開情報や一般的な業界データに基づくこと。不確かな数字には「目安として」「一般的に」と前置きする
- 「〜と言えるでしょう」「〜ではないでしょうか」は記事全体で各1回まで。2回以上使わない
- 「重要です」「必要です」は記事全体で各3回以内に抑える
- 各セクションの冒頭を「〜について解説します」で始めるパターンは禁止。具体的な事実や読者への問いかけで始める`;

const AUTHORITY_SOURCES = [
  'LINE公式ドキュメント (https://developers.line.biz/ja/docs/)',
  'LINE for Business (https://www.linebiz.com/jp/)',
  'Cloudflare Workers ドキュメント',
];

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
- 記事冒頭に50〜70文字のTL;DR（検索意図への直接回答）を配置する指示を含める
- H2見出しは読者の疑問に答える形にする（「〜とは？」「〜の方法」「〜の注意点」等）
- 「〜について」で始まる見出しは禁止
- FAQセクション(3~5問)を必ず含める（AI Overviews引用対策）
- 各セクションに独自の経験・データを含める箇所を指定する
- 最終セクションの前にCTA（LINE公式アカウント構築サービスへの自然な誘導）を配置する
- 記事全体で3,000〜5,000文字になる構成にする
- トピッククラスター戦略: 関連記事への内部リンク候補キーワードを3つ提案する`;

  const prompt = `対象キーワード: ${keyword}
検索意図: ${intent}

以下のJSON形式で記事構成を出力してください:
{
  "title": "SEO最適化されたタイトル（60文字以内、数字を含める）",
  "meta_description": "メタディスクリプション（120文字以内、行動を促す文末）",
  "slug": "url-friendly-slug",
  "tldr": "50〜70文字で検索意図に直接回答する一文",
  "related_keywords": ["関連記事候補キーワード1", "候補2", "候補3"],
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
- 全てのタグを正しく閉じる

SEO + GEO対策:
- 各セクション冒頭に要点サマリーを1~2文で入れる(AI Overviews引用対策: 引用の44%は記事冒頭30%から抽出される)
- 事実・数値は具体的に（「多くの」→「全体の67%」「月額21,780円」等）
- ただし架空の統計は作らない。不確かな場合は「一般的に〜とされています」
- 定義文は「〇〇とは、△△のことです。」形式で書く（AI引用されやすい）
- キーワードを自然に含める（不自然な詰め込みは逆効果）
- エンティティ（固有名詞、サービス名、数値）を豊富に含める
- 読者への語りかけを適度に入れる（「あなたの教室では〜」「もし〜なら」）

experience_note（実体験メモ）の活用:
- セクション構成にexperience_noteが含まれている場合、必ず本文中に自然に組み込むこと
- 「私が実際に○○した際には」「私の学校で試したところ」等の一人称体験として記述する
- experience_noteの内容を無視してはいけない。記事の信頼性を高める最重要要素

権威ソースの引用:
- 関連する場合、以下の権威ソースを自然に引用してください: ${AUTHORITY_SOURCES.join(' / ')}
- URLをそのまま記事に入れず、<a href="URL">テキスト</a>のテキストリンク形式で出力する
- 全セクションに無理に入れる必要はない。関連性がある場合のみ

セクション間の接続:
- 前セクションの要約が提供されている場合、その結論を受けて自然なトランジションで始めること
- 「次に」「また」等の接続詞の単純な羅列は避け、前セクションの内容を踏まえた導入にする`;

  const prompt = `記事タイトル: ${articleTitle}
ターゲットキーワード: ${keyword}
セクション構成:
${sectionOutline}
${previousSections ? `\nこれまでに書いたセクション（内容の重複を避け、前セクションの結論を受けて自然なトランジションで始めてください）:\n${previousSections.substring(0, 2000)}` : ''}
${caseStudyPrompt || ''}

このセクションのHTML本文を生成してください。HTMLタグのみ出力し、前後の説明文は不要です。`;

  return callClaude(env, 'claude-sonnet-4-6-20250514', system, prompt, 4096);
}

export async function polishArticle(
  env: Env,
  keyword: string,
  title: string,
  tldr: string,
  content: string
): Promise<string> {
  const system = `${AUTHOR_PERSONA}

${ANTI_AI_RULES}

あなたは日本語Webコンテンツの校閲者です。著者のペルソナとトーンを維持したまま、以下の記事を校閲・改善してください。

校閲ルール:
1. AIっぽい表現を全て自然な日本語に置換する
2. 同じ語尾が3回以上連続している箇所を修正する
3. 冗長な表現を削る（「することができます」→「できます」「行うことが可能です」→「できます」）
4. 各セクションの冒頭にサマリー文があることを確認（なければ追加）
5. 記事の最初に以下を追加:
   - TL;DR文をpタグのstrongで囲んで配置（AI Overviews引用対策）
   - 導入文（3行以内、読者の悩みに共感→この記事で解決できることを宣言）
6. 記事の末尾にCTAを追加:
   - 「LINE公式アカウントの構築を代行しています。」から始まる自然な誘導（2〜3行）
   - 押し売り感を出さない
7. HTMLタグの構造を壊さない。全てのタグが正しく閉じていることを確認する
8. 架空の数値や存在しない統計が含まれていたら削除する
9. Truth & Traceability: 根拠のない「業界トップ」「多くの企業が」「圧倒的な」等の曖昧な主張を見つけたら、具体的な表現に置換するか削除する
10. Hallucination Detection: 出所不明の数値や%があれば削除するか「一般的に〜と言われています」に緩和する。架空の調査名・レポート名は削除する
11. Featured Snippet最適化: 各H2直下の最初の段落が40〜60語程度の簡潔な回答ブロックになっているか確認し、なっていなければ調整する
12. 語尾パターン: 3連続で同じ語尾（「です。」「です。」「です。」や「ます。」「ます。」「ます。」）がないか再確認し、体言止めや疑問形を混ぜて修正する

出力は校閲済みのHTML全文のみ。説明やコメントは不要です。`;

  const prompt = `タイトル: ${title}
キーワード: ${keyword}
TL;DR: ${tldr}

校閲対象の記事:
${content}`;

  return callClaude(env, 'claude-sonnet-4-6-20250514', system, prompt, 8192);
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
