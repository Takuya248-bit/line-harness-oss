import {
  getXPostTemplates,
  createXPost,
  incrementTemplateUseCount,
  getUnusedSources,
  markSourceUsed,
  jstNow,
} from '@line-crm/db';
import type { XPostCategory, XPostCtaType, XAiSource } from '@line-crm/db';

// ---------------------------------------------------------------------------
// カテゴリ別デフォルトテンプレート（DB未登録時のフォールバック）
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATES: Record<XPostCategory, string[]> = {
  ai_news: [
    'Claude Codeがアプデされた🔥\n\nサブエージェント機能が追加されて\n複雑なタスクを並列処理できるように✨\n\n実際に使ってみたら\nコード変更+テスト+コミットを\n1つのプロンプトで完結できる\n\nターミナルで動くAIエディタ、想像以上に実用的💡',

    'AnthropicがMCPを公開した意味は大きい🚀\n\nAIがローカルファイル、DB、APIに\n直接アクセスできるプロトコル\n\n要するに「AIの手足」が標準化された✨\n\nClaude Code、Cursor、VS Codeが\n同じ仕組みで外部ツールと繋がる\n\nこれからのAI開発の土台になる💡',

    'GPT-4oが画像生成に対応👀\n\nテキスト→画像の品質が大幅に向上\n\nでも個人的に注目してるのは\nClaudeのコード生成能力🔥\n\nGPT-4oは汎用性\nClaudeは実務のコード\n\n使い分けが正解✨',
  ],

  ai_tips: [
    'Claude Codeで作業効率が3倍になった話🔥\n\n「このファイル読んで、テスト書いて、実装して、コミットして」\n\nこれ1行で全部やってくれる✨\n\n重要なのは指示の出し方\n\n具体的なゴールを示すだけで\n手順はAIが考えてくれる\n\nプロンプトは「What」だけでいい💡',

    'AIコーディングで一番大事なこと💡\n\nそれは「コンテキストの渡し方」\n\nCLAUDE.mdにプロジェクトの規約を書く\n→ 毎回説明しなくていい\n→ AIが一貫したコードを書く\n→ レビュー工数が激減✨\n\n設定ファイル1つで生産性が変わる🔥',

    'Cursorで開発してる人へ👀\n\nComposerよりClaude Codeの方が\n複雑なリファクタリングに強い\n\n理由はシンプルで\nターミナル経由で直接git操作できるから💪\n\nブランチ切って実装してPR作成まで\n全部1セッションで完結する🚀',
  ],

  ai_insight: [
    'AIエージェントが「自分で考えて動く」時代🤔\n\n指示→実行ではなく\n目標→計画→実行→検証→修正\n\nこのループをAIが自律的に回す\n\n実際にClaude Codeで毎日やってるけど\n「PM的な仕事」がAIに移りつつある\n\nエンジニアの仕事は設計と判断に集中できる🎯',

    'プログラミング経験ゼロでも\nAIでプロダクトが作れる時代✨\n\nでも「作れる」と「運用できる」は別\n\nデバッグ、セキュリティ、パフォーマンス\nここの判断力はまだ人間が必要🤔\n\nAIは最強のジュニアエンジニア\n使いこなすのはシニアの仕事💪',

    'AIツールの選び方で生産性が10倍変わる🔥\n\nClaude Code: 複雑な実装タスク\nCursor: 日常的なコーディング\nv0: UIプロトタイプ\nBolt: フルスタック雛形\n\n全部使ってみて思うのは\n「1つに絞る」より「使い分ける」が正解🎯',
  ],

  ai_tutorial: [
    'Claude Codeの始め方（5分）✨\n\n1. npm install -g @anthropic-ai/claude-code\n2. ターミナルでプロジェクトに移動\n3. claude と打つ\n4. 「このプロジェクトの構造を教えて」\n\nこれだけ💡\n\nIDEを閉じてターミナルだけで開発する\nその体験がすごい🔥',

    'CLAUDE.mdの書き方で\nAIの出力品質が劇的に変わる💡\n\n入れるべき情報:\n・技術スタック\n・コーディング規約\n・よくあるミスと対策\n・テストの書き方\n\n1回書けばずっと効く✨\nAIへの「引き継ぎ書」だと思えばいい🎯',

    'MCPサーバーを自分で作る方法🚀\n\n実はそんなに難しくない\n\n1. @modelcontextprotocol/sdk を入れる\n2. ツール定義をJSONで書く\n3. ハンドラーを実装\n4. Claude Codeの設定に追加\n\nこれでAIが自分専用のツールを使えるようになる✨',
  ],

  engagement: [
    'AI開発ツール、何使ってる？👀\n\n①Claude Code\n②Cursor\n③GitHub Copilot\n④その他\n\nリプで教えて！理由も聞きたい🙌',

    'ぶっちゃけAIで仕事の生産性上がった？🤔\n\n①劇的に上がった\n②まあまあ上がった\n③変わらない\n④むしろ下がった（使い方模索中）\n\n④の人、気持ちわかる😳',

    'AIに任せられる仕事、任せられない仕事🤔\n\n任せてる:\n・コード実装\n・テスト作成\n・リサーチ\n\n任せない:\n・要件定義\n・ビジネス判断\n・最終レビュー\n\nみんなの線引きはどこ？👀',
  ],
};

// ---------------------------------------------------------------------------
// テンプレートベースの投稿コンテンツ生成
// ---------------------------------------------------------------------------

export async function generateXPostContent(
  db: D1Database,
  options?: { category?: XPostCategory },
): Promise<{ content: string; category: XPostCategory }> {
  const categories: XPostCategory[] = [
    'ai_news',
    'ai_tips',
    'ai_insight',
    'ai_tutorial',
    'engagement',
  ];

  const category = options?.category ?? categories[Math.floor(Math.random() * categories.length)];

  // DBテンプレートを優先的に取得
  const dbTemplates = await getXPostTemplates(db, category);

  let content: string;

  if (dbTemplates.length > 0) {
    const sorted = [...dbTemplates].sort((a, b) => a.use_count - b.use_count);
    const pool = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    const selected = pool[Math.floor(Math.random() * pool.length)];
    content = selected.template_text;
    await incrementTemplateUseCount(db, selected.id);
  } else {
    const templates = DEFAULT_TEMPLATES[category];
    content = templates[Math.floor(Math.random() * templates.length)];
  }

  return { content, category };
}

// ---------------------------------------------------------------------------
// Notion 知識DB から一次情報を取得（LINE関連を除外）
// ---------------------------------------------------------------------------

interface NotionKnowledgeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

/** LINE関連を除外するタグ */
const EXCLUDED_TAGS = ['LINE', 'Lステップ', 'lstep', 'line-harness', 'リッチメニュー', 'Webhook'];

async function fetchFirsthandKnowledge(
  notionApiKey: string,
  notionDbId: string,
  limit = 10,
): Promise<NotionKnowledgeEntry[]> {
  const res = await fetch(`https://api.notion.com/v1/databases/${notionDbId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        or: [
          { property: 'category', select: { equals: 'technology' } },
          { property: 'category', select: { equals: 'method' } },
          { property: 'category', select: { equals: 'ai_news' } },
        ],
      },
      sorts: [{ property: 'use_count', direction: 'ascending' }],
      page_size: limit,
    }),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { results: Array<{ id: string; properties: Record<string, any> }> };

  return data.results
    .map((page) => {
      const p = page.properties;
      const tags = (p.tags?.multi_select ?? []).map((t: { name: string }) => t.name);
      return {
        id: page.id,
        title: (p.title?.title ?? []).map((t: { plain_text: string }) => t.plain_text).join(''),
        content: (p.content?.rich_text ?? []).map((t: { plain_text: string }) => t.plain_text).join(''),
        tags,
      };
    })
    .filter((e) => !e.tags.some((t: string) => EXCLUDED_TAGS.some((ex) => t.toLowerCase().includes(ex.toLowerCase()))));
}

// ---------------------------------------------------------------------------
// AI (Claude Haiku) によるコンテンツ生成（ソースベース）
// ---------------------------------------------------------------------------

function buildSystemPrompt(sources: XAiSource[], firsthandKnowledge: NotionKnowledgeEntry[]): string {
  const sourceBlock = sources.length > 0
    ? sources
        .map((s) => `- [${s.source_type}] ${s.title} (${s.url}) score:${s.score}`)
        .join('\n')
    : '（今回はソースなし。自身の知識から生成すること）';

  const knowledgeBlock = firsthandKnowledge.length > 0
    ? firsthandKnowledge.map((k) => `- ${k.title}: ${k.content.slice(0, 100)}`).join('\n')
    : '- Claude Codeでサブエージェント並列起動して開発効率3倍\n- CLAUDE.mdにルール書くだけでAIの出力品質が劇的に向上\n- MCPサーバー自作してDB直接操作可能に\n- Cloudflare Workers + D1でAI連携サービスを月額0円運用';

  return `あなたはX（旧Twitter）で投稿するコンテンツを作成するアシスタントです。

ペルソナ:
- アカウント名: える｜AI活用
- AI・LLMツールを実務でガチ運用している実践者
- Claude Code、Cursor、MCP等を日常的に使って開発している
- 海外のAI最新情報を日本語でわかりやすく解説する
- ターゲット: エンジニア〜ライトエンジニア、AI活用に興味がある人

ルール:
- 日本語で書く
- 140文字以内を目安にする（X日本語投稿）
- 改行を効果的に使って読みやすくする
- 太字マークダウン（**）は使わない
- ハッシュタグは付けない
- CTAやリンクは入れない
- 「実際に使ってみた」「やってみたら」等の実践者トーンで書く
- テンプレ的な投稿は絶対に作らない
- 海外情報は「〜らしい」ではなく断定調で書く（ソースがあるため）
- 絵文字を自然に使う（1投稿に2〜4個）。句点「。」で終わらせず絵文字で締める
- 使っていい絵文字例: 🔥✨💡🚀👀🤔💪😳🫣✅⚡️🎯💭🙌
- 文頭・文末・強調ポイントに散りばめる。連続使用は2個まで

実務で得た一次情報（Notion知識DBから取得）:
${knowledgeBlock}

本日の海外AIソース:
${sourceBlock}`;
}

export async function generateAIContent(
  db: D1Database,
  apiKey: string,
  category: XPostCategory,
  notionConfig?: { apiKey: string; dbId: string },
): Promise<{ content: string; usedSourceIds: string[] }> {
  // 未使用ソースを取得
  const sources = await getUnusedSources(db, 5);

  // Notion知識DBから一次情報を取得（LINE関連除外）
  let firsthandKnowledge: NotionKnowledgeEntry[] = [];
  if (notionConfig) {
    try {
      firsthandKnowledge = await fetchFirsthandKnowledge(notionConfig.apiKey, notionConfig.dbId, 10);
    } catch (e) {
      console.warn('[x-content] Notion fetch failed, using fallback:', e);
    }
  }

  const categoryPrompts: Record<XPostCategory, string> = {
    ai_news:
      '海外AIソースから1つ選び、日本語でニュース速報的な投稿を作成。「何が変わるのか」「なぜ重要か」を実践者目線で解説。ソースがない場合はAI業界の最新動向について書く。',
    ai_tips:
      '一次情報リストから1つ選び、具体的なAI活用Tipsを作成。数字や具体例を含める。一次情報の内容をそのまま使わず、自分の体験として再構成する。',
    ai_insight:
      '海外ソースまたは一次情報を元に、AI業界のトレンドや将来予測について考察する投稿を作成。ポジショントークを恐れず、実践者としての意見を入れる。',
    ai_tutorial:
      '一次情報リストから1つ選び、AIツールの具体的な使い方を短くまとめた投稿を作成。ステップバイステップで再現可能な内容にする。',
    engagement:
      'AI活用に関する問いかけ投稿を作成。選択式の質問や「あるある」ネタで共感を誘う。一次情報の数字やデータを使って具体的に。',
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 300,
      system: buildSystemPrompt(sources, firsthandKnowledge),
      messages: [
        {
          role: 'user',
          content: categoryPrompts[category],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown');
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const result = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // ニュース系カテゴリでソースを使った場合、使用済みにマーク
  const usedSourceIds: string[] = [];
  if (['ai_news', 'ai_insight'].includes(category) && sources.length > 0) {
    await markSourceUsed(db, sources[0].id);
    usedSourceIds.push(sources[0].id);
  }

  return { content: text.trim(), usedSourceIds };
}

// ---------------------------------------------------------------------------
// 1週間分の投稿を自動スケジュール
// ---------------------------------------------------------------------------

export async function scheduleWeeklyPosts(
  db: D1Database,
  options?: {
    postsPerDay?: number;
    startHour?: number;
    endHour?: number;
  },
): Promise<{ scheduled: number }> {
  const postsPerDay = options?.postsPerDay ?? 5;
  const startHour = options?.startHour ?? 7;
  const endHour = options?.endHour ?? 21;

  const categories: XPostCategory[] = [
    'ai_news',
    'ai_tips',
    'ai_insight',
    'ai_tutorial',
    'engagement',
  ];

  const categorySchedule: XPostCategory[] = [];
  for (let i = 0; i < postsPerDay * 7; i++) {
    categorySchedule.push(categories[i % categories.length]);
  }
  for (let i = categorySchedule.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [categorySchedule[i], categorySchedule[j]] = [categorySchedule[j], categorySchedule[i]];
  }

  const nowStr = jstNow();
  const today = nowStr.slice(0, 10);

  let scheduledCount = 0;

  for (let day = 0; day < 7; day++) {
    const date = new Date(`${today}T00:00:00+09:00`);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().slice(0, 10);

    const interval = (endHour - startHour) / postsPerDay;

    for (let slot = 0; slot < postsPerDay; slot++) {
      const jitterRatio = 0.2 + Math.random() * 0.6;
      const hour = Math.floor(startHour + interval * slot + interval * jitterRatio);
      const minute = Math.floor(Math.random() * 60);
      const scheduledAt = `${dateStr} ${String(Math.min(hour, endHour - 1)).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

      const categoryIndex = day * postsPerDay + slot;
      const category = categorySchedule[categoryIndex];

      const { content } = await generateXPostContent(db, { category });

      await createXPost(db, {
        content,
        postType: 'single',
        scheduledAt,
        category,
        ctaType: 'none',
        aiGenerated: false,
      });

      scheduledCount++;
    }
  }

  return { scheduled: scheduledCount };
}
