import {
  getXPostTemplates,
  createXPost,
  incrementTemplateUseCount,
  jstNow,
} from '@line-crm/db';
import type { XPostCategory, XPostCtaType } from '@line-crm/db';

// ---------------------------------------------------------------------------
// CTA文言
// ---------------------------------------------------------------------------

// リンクは本文に入れない。セルフリプライ（ツリー2投目）に分離する
// → シャドウバン回避 + 本文のインプレッション確保
const CTA_REPLY_TEXTS: Record<string, string> = {
  line: '▼ 無料相談はLINEから\nhttps://line.me/R/ti/p/@601wuvmw',
  coconala: '▼ 構築代行はこちら（9,500円）\nhttps://coconala.com/services/4140764',
  both: '▼ まず相談したい方\nhttps://line.me/R/ti/p/@601wuvmw\n\n▼ すぐ構築したい方\nhttps://coconala.com/services/4140764',
};

// 本文末尾に付ける誘導文（リンクなし、バリエーション）
const CTA_TEASERS = [
  '\n\n詳しくはリプ欄↓',
  '\n\nリンクはリプに置いておきます↓',
  '\n\n気になる方はリプ欄へ↓',
  '\n\n↓詳細はリプ欄',
];

// ---------------------------------------------------------------------------
// カテゴリ別デフォルトテンプレート（DB未登録時のフォールバック）
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATES: Record<XPostCategory, string[]> = {
  tips: [
    'LINE公式アカウント、まだ手動で返信してる？\n\n自動応答を設定するだけで\n・対応時間が1/3に\n・深夜の問い合わせもカバー\n・顧客満足度UP\n\n実は月額0円でできるんです',

    'リッチメニューを「全員同じ」にしてない？\n\n友だちの属性で出し分けるだけで\nタップ率が2倍になった事例あり\n\nセグメント配信×リッチメニューの組み合わせが最強',

    '友だち追加されたのに何もしてないアカウント、多すぎる\n\n追加直後の「あいさつメッセージ」で\n・自己紹介\n・メリット提示\n・次のアクション誘導\n\nこの3つ入れるだけで離脱率が激減する',

    'LINE配信で既読率が低い人へ\n\n原因の8割は「配信時間」\n\n朝7-9時: 通勤中に見る\n昼12-13時: 休憩中に見る\n夜20-22時: リラックスタイム\n\n業種に合わせて試してみて',

    'タグ管理してないLINE公式アカウントは宝の持ち腐れ\n\n「購入済み」「資料請求」「セミナー参加」\n\nタグ1つ付けるだけで\n配信の精度が劇的に変わる\n\nまだ全員に同じ内容送ってる？',

    'LINE公式の「分析」機能、ちゃんと見てる？\n\nメッセージ開封率\nリッチメニュータップ率\n友だち増減の推移\n\n数字を見ずに配信するのは\n地図なしでドライブするのと同じ',

    'ステップ配信を組んでないLINE公式は損してる\n\n友だち追加 → 自己紹介\n1日後 → お役立ち情報\n3日後 → 事例紹介\n7日後 → サービス案内\n\nこの流れを自動化するだけで成約率が上がる',
  ],

  case_study: [
    '【実績紹介】VTuberさんのLINE構築\n\n構築前: 視聴者との接点がYouTubeだけ\n構築後: LINE登録→自動ステップ→グッズ申込\n\n構築期間: 約2週間\n月額コスト: 0円\n\nLステップなら月5,000〜32,780円かかるところ',

    '美容室オーナーさんのLINE構築事例\n\n課題: リピート率が低い\n施策: 来店後に自動フォローメッセージ\n結果: 次回予約率が改善\n\nやったことはステップ配信の設定だけ\n月額の追加コストは0円',

    'コーチングをされている方のLINE活用事例\n\n体験セッション申込の導線を自動化\n\n診断bot → 結果に合わせた情報提供 → 体験申込\n\n手動でやってた案内が全部自動に\n対応漏れがなくなったのが一番大きい',

    'オンラインスクール運営者さんの事例\n\n受講前: 問い合わせ→手動返信→案内送付\n構築後: 自動応答→カリキュラム案内→申込フォーム\n\n夜中の問い合わせにも即対応\n「返信が早い」と好評になった',

    'ECサイト運営者さんのLINE構築\n\n課題: カゴ落ちが多い\n施策: 購入未完了者にリマインド配信\n結果: 回収率が目に見えて改善\n\n配信の出し分けが無料でできるのが決め手だった',

    '飲食店オーナーさんのケース\n\n月額ツール代を年間6万円以上払っていた\n\nLカスタムに切り替えて月額0円に\nクーポン配信もセグメント配信もそのまま継続\n\n浮いた分を食材の仕入れに回せている',
  ],

  cost_comparison: [
    'Lステップの月額、把握してる？\n\nスタート: 5,000円/月\nスタンダード: 21,780円/月\nプロ: 32,780円/月\n\n年間で6〜39万円\n\n同じ機能を月額0円で使う方法、知りたい人いる？',

    'LINE CRMツールのコスト比較\n\nLステップ: 月5,000〜32,780円\nエルメ: 無料枠あり（制限多い）\nプロラインフリー: 無料（複雑）\nLカスタム: 0円\n\n「無料」の中身が全然違う\n制限なしで0円なのはLカスタムだけ',

    '年間のLINEツール代、計算したことある？\n\nLステップのスタンダードプランだと\n21,780円 × 12ヶ月 = 261,360円\n\n3年で約78万円\n\nこの金額を他の施策に使えたら何ができる？',

    '「無料プラン」の罠に注意\n\nよくある制限:\n・友だち数の上限が低い\n・配信数に制限\n・機能が大幅に制限\n・サポートなし\n\n結局有料プランに上げないと使い物にならない\nそもそも制限なしで無料のツールを選ぶべき',

    'LINE構築を外注する場合の相場感\n\n構築費: 10〜50万円\n月額ツール代: 5,000〜32,780円\n運用代行: 月3〜10万円\n\n全部合わせると初年度100万円超えることも\n\nツール代だけでも0円にできたら大きい',
  ],

  tool_guide: [
    'LINE公式アカウントのCRMツール、多すぎて選べない問題\n\n整理すると:\n・Lステップ: 高機能だけど高い\n・エルメ: 無料枠あるけど制限多い\n・プロラインフリー: 無料だけど複雑\n\n第4の選択肢があるんだけど…',

    'LINE CRMツール選びで失敗しないポイント\n\n1. 月額コストは長期で計算する\n2. 「無料」の制限を必ず確認\n3. 管理画面の使いやすさ\n4. 友だち数の上限\n5. サポート体制\n\n安さだけで選ぶと後悔する',

    'Lステップから乗り換えを検討してる人へ\n\n気になるポイント:\n・データは移行できる？ → できます\n・機能は足りる？ → 主要機能は網羅\n・設定し直し？ → 構築代行あり\n\n月額0円になるメリットは大きい',

    'LINE公式アカウントの標準機能でできること\n\n・あいさつメッセージ\n・自動応答（キーワード）\n・リッチメニュー（1種類）\n・ショップカード\n\nこれだけで足りない人がCRMツールを使う\n問題は「月額いくら払うか」',

    'エルメの無料プラン、実際どう？\n\n正直に言うと:\n・友だち数に上限がある\n・一部機能が使えない\n・本格運用には有料プランが必要\n\n「無料で始められる」と「無料で運用できる」は別の話',

    'CRMツールに求める機能TOP5\n\n1. セグメント配信（属性別に出し分け）\n2. ステップ配信（自動フォロー）\n3. リッチメニューの出し分け\n4. タグ管理\n5. 流入経路の分析\n\nこの5つが月額0円で全部使えたら？',
  ],

  engagement: [
    'LINE公式アカウント運用で一番大変なことは？\n\n①自動応答の設定\n②リッチメニューのデザイン\n③配信内容を考えること\n④友だち集め\n\nリプで教えて！',

    'ぶっちゃけLINE公式の月額ツール代、いくら払ってる？\n\n①0円（標準機能のみ）\n②〜5,000円\n③5,000〜20,000円\n④20,000円以上\n\n意外とみんな払ってるんだよね',

    'LINE公式アカウント、何人の友だちがいる？\n\n①〜100人\n②100〜500人\n③500〜1,000人\n④1,000人以上\n\n人数によって最適な運用方法が変わる',

    '正直に答えて\n\nLINE公式アカウント、ちゃんと活用できてる？\n\n①バリバリ活用してる\n②たまに配信してる\n③作ったけど放置気味\n④これから始める\n\n③の人が一番もったいない',

    'LINE公式アカウントで自動化してることある？\n\n①あいさつメッセージだけ\n②自動応答も設定してる\n③ステップ配信まで組んでる\n④何も自動化してない\n\n④の人、今すぐ①だけでもやって',

    'LINE構築で一番お金をかけるべきところは？\n\n①リッチメニューのデザイン\n②シナリオ設計\n③配信コンテンツ\n④分析と改善\n\n個人的には②だと思う。理由はリプで',
  ],
};

// ---------------------------------------------------------------------------
// カテゴリごとのCTA割り当て（デフォルト）
// ---------------------------------------------------------------------------

const CATEGORY_CTA_MAP: Record<XPostCategory, XPostCtaType> = {
  tips: 'none',
  case_study: 'line',
  cost_comparison: 'both',
  tool_guide: 'coconala',
  engagement: 'none',
};

// ---------------------------------------------------------------------------
// テンプレートベースの投稿コンテンツ生成
// ---------------------------------------------------------------------------

export async function generateXPostContent(
  db: D1Database,
  options?: { category?: XPostCategory; withCta?: XPostCtaType },
): Promise<{ content: string; category: XPostCategory; ctaType: XPostCtaType; ctaReplyText: string | null }> {
  const categories: XPostCategory[] = [
    'tips',
    'case_study',
    'cost_comparison',
    'tool_guide',
    'engagement',
  ];

  // カテゴリ選択
  const category = options?.category ?? categories[Math.floor(Math.random() * categories.length)];

  // DBテンプレートを優先的に取得
  const dbTemplates = await getXPostTemplates(db, category);

  let content: string;
  let templateId: string | null = null;

  if (dbTemplates.length > 0) {
    // 使用回数が少ないものを優先（下位50%からランダム選択）
    const sorted = [...dbTemplates].sort((a, b) => a.use_count - b.use_count);
    const pool = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    const selected = pool[Math.floor(Math.random() * pool.length)];
    content = selected.template_text;
    templateId = selected.id;

    await incrementTemplateUseCount(db, selected.id);
  } else {
    // フォールバック: デフォルトテンプレート
    const templates = DEFAULT_TEMPLATES[category];
    content = templates[Math.floor(Math.random() * templates.length)];
  }

  // CTA: リンクは本文に入れず、セルフリプライ用テキストとして分離
  const ctaType = options?.withCta ?? CATEGORY_CTA_MAP[category];
  let ctaReplyText: string | null = null;

  if (ctaType !== 'none') {
    ctaReplyText = CTA_REPLY_TEXTS[ctaType] ?? null;
    if (ctaReplyText) {
      // 本文にはリンクなしの誘導文だけ追加
      const teaser = CTA_TEASERS[Math.floor(Math.random() * CTA_TEASERS.length)];
      content += teaser;
    }
  }

  return { content, category, ctaType, ctaReplyText };
}

// ---------------------------------------------------------------------------
// AI (Claude Haiku) によるコンテンツ生成
// ---------------------------------------------------------------------------

const HAIKU_SYSTEM_PROMPT = `あなたはX（旧Twitter）で投稿するコンテンツを作成するアシスタントです。

ペルソナ:
- アカウント名: える｜LINE構築
- LINE公式アカウントの構築・運用の専門家
- 自社開発のCRMツール「Lカスタム」を提供中（月額0円）
- ターゲット: LINE公式アカウント運用者（コーチ、サロン、クリエイター）

ルール:
- 日本語で書く
- 140文字以内を目安にする（X日本語投稿）
- 改行を効果的に使って読みやすくする
- 太字マークダウン（**）は使わない
- 「LINE Harness」「オープンソース」という言葉は絶対に使わない
- サービス名は「Lカスタム」として表現する
- 専門用語（API、GUI等）は使わない
- 自然な口語体で、押し売り感を出さない
- ハッシュタグは付けない（Xのアルゴリズム上不要）
- 必ず以下の一次情報・海外データから1つ以上を盛り込む。テンプレ的な投稿は絶対に作らない

一次情報（実体験ベース）:
- 自動応答キーワードを12個→47個に増やしたら発火率23%→71%に
- リッチメニュー6分割→2分割でタップ率14%→42%（3倍）
- あいさつメッセージ200文字→30文字+ボタンでタップ率8%→42%
- 診断bot5問構成の完走率87%、平均回答時間2分18秒
- シナリオ配信間隔5分→1時間でブロック率12%→3%
- 構築期間14日（ヒアリング3日+構築7日+テスト4日）
- Lステップ同等プラン月額21,780円×12=年間261,360円→0円に
- VTuber案件で自動応答が1週間で837回発火、手動なら1日120件対応

海外データ（出典付きで使える）:
- メッセージアプリ開封率98% vs メール20%（Omnisend調査）
- チャットbot利用者のCVRは非利用者の2.8倍（Drift調査）
- 成約の80%は5-12回のフォローアップ後に発生（AiSensy調査）
- ECカゴ落ち率70%、適切なリマインダーで25%回収可能
- WhatsApp導入3ヶ月で44%の中小企業が売上改善（Gallabox調査）
- SMS/メッセージングROI: 1ドル投下→71ドル回収 vs メール36ドル（Optimonk調査）
- Unilever: WhatsAppボットで売上14倍（ブラジル事例）
- 消費者の59%が5秒以内の返信を期待（Fullview調査）`;

export async function generateAIContent(
  db: D1Database,
  apiKey: string,
  category: XPostCategory,
): Promise<string> {
  const categoryPrompts: Record<XPostCategory, string> = {
    tips: '一次情報の数字（タップ率、発火率、ブロック率等）を必ず1つ使って、LINE公式アカウントの運用Tipsを1つ作成。「実際にやってみた結果」のトーンで書く。',
    case_study:
      '一次情報の構築エピソードを元に、匿名の構築事例投稿を1つ作成。業種はVTuber、美容室、コーチ、EC、飲食から選ぶ。ビフォーアフターと具体的な数字を含める。',
    cost_comparison:
      '海外データ（ROI、開封率、CVR等）を1つ引用し、LINE公式アカウントのコスト優位性を伝える投稿を1つ作成。Lカスタムは月額0円。競合の悪口にならないバランスで。',
    tool_guide:
      '海外のチャットbot事例（WhatsApp、WeChat等）を引用し、「日本にはLINEがある」という文脈でツール選びの投稿を1つ作成。Lカスタムを選択肢の1つとして自然に紹介。',
    engagement:
      '一次情報か海外データを元に、リプやいいねが付きやすい問いかけ投稿を1つ作成。選択式の質問や「あるある」ネタで共感を誘う。数字を使って具体的に。',
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
      system: HAIKU_SYSTEM_PROMPT,
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

  return text.trim();
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
  // Ban対策: 1日最大3投稿（日次上限5のうち手動投稿分を残す）
  const postsPerDay = Math.min(options?.postsPerDay ?? 2, 3);
  const startHour = options?.startHour ?? 9;
  const endHour = options?.endHour ?? 21;

  const categories: XPostCategory[] = [
    'tips',
    'case_study',
    'cost_comparison',
    'tool_guide',
    'engagement',
  ];

  // カテゴリをバランスよく配分するためのローテーション
  // 1日2投稿 × 7日 = 14投稿。5カテゴリを均等に回す
  const categorySchedule: XPostCategory[] = [];
  for (let i = 0; i < postsPerDay * 7; i++) {
    categorySchedule.push(categories[i % categories.length]);
  }
  // シャッフル（Fisher-Yates）で同じカテゴリが連続しにくくする
  for (let i = categorySchedule.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [categorySchedule[i], categorySchedule[j]] = [categorySchedule[j], categorySchedule[i]];
  }

  // 今日の日付をJSTで取得
  const nowStr = jstNow(); // "YYYY-MM-DD HH:MM:SS" 形式
  const today = nowStr.slice(0, 10); // "YYYY-MM-DD"

  let scheduledCount = 0;

  for (let day = 0; day < 7; day++) {
    // 日付を計算
    const date = new Date(`${today}T00:00:00+09:00`);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().slice(0, 10); // "YYYY-MM-DD"

    // 投稿時間を等間隔+ランダムジッターで配分（Bot検出回避）
    const interval = (endHour - startHour) / postsPerDay;

    for (let slot = 0; slot < postsPerDay; slot++) {
      // 基本時間 + ランダムオフセット（間隔の20-80%の範囲）
      const jitterRatio = 0.2 + Math.random() * 0.6;
      const hour = Math.floor(startHour + interval * slot + interval * jitterRatio);
      const minute = Math.floor(Math.random() * 60);
      const scheduledAt = `${dateStr} ${String(Math.min(hour, endHour - 1)).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

      const categoryIndex = day * postsPerDay + slot;
      const category = categorySchedule[categoryIndex];

      // Ban対策: CTA付きは1日最大1投稿（リンクスパム回避）
      const ctaType = slot === 0 ? CATEGORY_CTA_MAP[category] : 'none' as XPostCtaType;

      const { content, ctaReplyText } = await generateXPostContent(db, {
        category,
        withCta: ctaType,
      });

      // CTA付き → スレッド形式（本文---CTAリプライ）でシャドウバン回避
      const postContent = ctaReplyText
        ? `${content}\n---\n${ctaReplyText}`
        : content;

      await createXPost(db, {
        content: postContent,
        postType: ctaReplyText ? 'thread' : 'single',
        scheduledAt,
        category,
        ctaType,
        aiGenerated: false,
      });

      scheduledCount++;
    }
  }

  return { scheduled: scheduledCount };
}
