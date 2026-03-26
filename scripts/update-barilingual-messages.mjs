#!/usr/bin/env node
// ============================================================
// バリリンガル シナリオメッセージ更新スクリプト
// ============================================================
// プレースホルダー [要設定:] を実データのメッセージに置換する
//
// 環境変数（必須）:
//   HARNESS_API_URL    - APIベースURL
//   HARNESS_API_KEY    - APIキー
//   HARNESS_ACCOUNT_ID - バリリンガルアカウントID
//
// 使い方:
//   node scripts/update-barilingual-messages.mjs --dry-run
//   node scripts/update-barilingual-messages.mjs
// ============================================================

import { writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';

// ---- 環境変数（必須チェック） ----
const API_URL = process.env.HARNESS_API_URL ?? '';
const API_KEY = process.env.HARNESS_API_KEY ?? '';
const ACCOUNT_ID = process.env.HARNESS_ACCOUNT_ID ?? '';
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_URL) { console.error('ERROR: HARNESS_API_URL が未設定'); process.exit(1); }
if (!API_KEY) { console.error('ERROR: HARNESS_API_KEY が未設定'); process.exit(1); }
if (!ACCOUNT_ID) { console.error('ERROR: HARNESS_ACCOUNT_ID が未設定'); process.exit(1); }

// ---- API呼び出しヘルパー ----
async function api(method, path, body) {
  const url = `${API_URL}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  if (DRY_RUN && method !== 'GET') {
    console.log(`  [DRY-RUN] ${method} ${path}`);
    if (body?.messageContent) {
      console.log(`    本文先頭: ${body.messageContent.slice(0, 50)}...`);
    }
    return { success: true };
  }

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} HTTP ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(`API ${method} ${path} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

// ============================================================
// メッセージ定義
// ============================================================
// KOH定例方針: テキスト短縮+バナー画像誘導
// - テキストは簡潔に
// - CTA部分は明確に残す
// - 画像URL部分は [IMAGE_URL] プレースホルダー
// ============================================================

const SCENARIO_MESSAGES = {
  // ----------------------------------------------------------
  // 1. 見積もり後フォローシナリオ (4ステップ: Day0/1/3/5)
  // ----------------------------------------------------------
  '見積もり後フォローシナリオ': {
    1: `お見積もりをお送りしました\n\nご不明な点があれば、いつでもお気軽にメッセージください\n\nじっくり検討していただいて大丈夫です`,

    2: `バリリンガルです\n\nバリ島留学はコスパ抜群です\n\n━━━━━━━━━━━━━━\nバリ島留学のコスパ\n\n生活費: 日本の約1/3\n授業料: 1週間プランで約15万円〜\n　(航空券・宿泊込み)\n食事: 1食200〜500円程度\n━━━━━━━━━━━━━━\n\n欧米留学と比べると約40%お得です\n\n気になる点があればお気軽にご質問ください`,

    3: `卒業生の声をご紹介します\n\n━━━━━━━━━━━━━━\nAさん（30代・会社員）\n「1週間の短期留学でしたが、\n英語への苦手意識がなくなりました」\n\nBさん（20代・フリーランス）\n「バリ島でリモートワークしながら\n英語を学べました」\n━━━━━━━━━━━━━━\n\n迷っている時間が一番もったいない\nそう言ってくださる卒業生が多いです`,

    4: `バリリンガルです\n\nご検討いかがでしょうか？\n\n今なら、お見積もりから1週間以内のお申し込みで入学金が無料になります\n\n「もう少し相談したい」方は、無料のオンライン相談もご利用いただけます\n\nメッセージで「相談したい」と送ってくださいね`,
  },

  // ----------------------------------------------------------
  // 2. 面談前フォローシナリオ (2ステップ: Day0/1)
  // ----------------------------------------------------------
  '面談前フォローシナリオ': {
    1: `ご予約ありがとうございます!\n\nオンライン相談の日程が確定しました。\n当日は、あなたに合ったプランを\n一緒に考えていきますので、\n気になることがあれば何でも聞いてくださいね。`,

    2: `明日のオンライン相談、\nお待ちしております!\n\nよく聞かれる質問をまとめました。\n\n━━━━━━━━━━━━━━\nよくある質問 TOP3\n\nQ1. 費用はどのくらい？\n→ 1週間 85,000円〜\n　（授業＋宿泊込み）\n\nQ2. 英語が全くできなくても大丈夫？\n→ 初心者向けカリキュラムあり\n　 日本人スタッフも常駐\n\nQ3. どのくらいの期間がおすすめ？\n→ 1〜2週間が人気\n━━━━━━━━━━━━━━\n\n他にも気になることがあれば、\n明日の相談でお気軽にどうぞ!`,
  },

  // ----------------------------------------------------------
  // 3. 相談アクション促進シナリオ (3ステップ: Day3/5/7)
  // ----------------------------------------------------------
  '相談アクション促進シナリオ': {
    1: `留学相談にご興味いただきありがとうございます\n\n「何を聞いたらいいかわからない」\nそんな方も大歓迎です\n\n例えばこんな質問からでOK\n・費用の目安を教えてほしい\n・初めての海外で不安がある\n・1週間でどのくらい伸びる？\n\nお気軽にメッセージを送ってくださいね`,

    2: `見積もりにご興味いただきありがとうございます\n\n見積もりは無料、強引な勧誘は一切ありません\n\nご希望の期間や時期をお伝えいただければ、あなた専用のプランと費用をお出しします\n\nチャットで「見積もりお願いします」と送るだけでOKです`,

    3: `バリリンガルです\n\n「いつかやりたいけど踏み出せない」\n「費用も時期もよくわからない」\n\nバリリンガルに来られる方の多くが同じ気持ちでした\n\n相談してみたら「もっと早く聞けばよかった」と言ってくださる方がほとんどです\n\n無料のオンライン相談は30分程度\nメッセージで「相談したい」と送ってくださいね`,
  },

  // ----------------------------------------------------------
  // 4. ABテストシナリオ (Day6分: ステップ9,10 / Day7分: ステップ11,12)
  //    ※ Day0-5は既にupdate-scenario-messages.mjsで設定済み
  //    ※ stepOrderはAPIの既存ステップ順序に依存するため、
  //       名前マッチングで特定する
  // ----------------------------------------------------------
  'ABテストシナリオ': {
    // Day6 パターンA (stepOrder=11 or ラベル含む "Day6")
    11: `昨日お届けした\n「来る前と来た後」の声、\nいかがでしたか？\n\n「もっと早く来ればよかった」\nよく聞く声です。\n\n━━━━━━━━━━━━━━\nよくある"先延ばし"の理由\n\n・お金が貯まったら\n・仕事が落ち着いたら\n・英語をもう少し勉強してから\n\nでも実際は…\n・費用は想像より安かった\n・仕事は辞めなくても短期で行けた\n・現地で伸ばすのが一番早かった\n━━━━━━━━━━━━━━\n\n自分へのご褒美に、\nバリ島で英語を学ぶ体験を。\n\n特典がある今のうちに、\nまずは気軽にご相談ください。`,

    // Day6 パターンB
    12: `昨日お届けした\n「来る前と来た後」の声、\nいかがでしたか？\n\n「もっと早く来ればよかった」\nよく聞く声です。\n\n━━━━━━━━━━━━━━\nよくある"先延ばし"の理由\n\n・お金が貯まったら\n・仕事が落ち着いたら\n・英語をもう少し勉強してから\n\nでも実際は…\n・費用は想像より安かった\n・仕事は辞めなくても短期で行けた\n・現地で伸ばすのが一番早かった\n━━━━━━━━━━━━━━\n\n「またいつか」が続いてきたなら、\n今が動くタイミングかもしれません。\n\n特典がある今のうちに、\nまずは気軽にご相談ください。`,

    // Day7 パターンA
    13: `この1週間、\nメッセージを読んでいただき\nありがとうございます。\n\n最後に一つだけお伝えしたいことが\nあります。\n\n━━━━━━━━━━━━━━\n一番多い感想は…\n\n「もっと早く来ればよかった」\n\n・30代で初めての留学だったけど\n　年齢は関係なかった\n・1週間でリスニングが変わった\n・帰国後も英語を続けられている\n━━━━━━━━━━━━━━\n\n自分へのご褒美に、\nバリ島で英語を学ぶ体験を。\n\n特典がある今のうちに、\nまずは気軽にご相談ください。`,

    // Day7 パターンB
    14: `この1週間、\nメッセージを読んでいただき\nありがとうございます。\n\n最後に一つだけお伝えしたいことが\nあります。\n\n━━━━━━━━━━━━━━\n一番多い感想は…\n\n「もっと早く来ればよかった」\n\n・30代で初めての留学だったけど\n　年齢は関係なかった\n・1週間でリスニングが変わった\n・帰国後も英語を続けられている\n━━━━━━━━━━━━━━\n\n「いつか環境を変えよう」\nそう思い続けてきたなら、\n今がそのタイミングです。\n\n特典がある今のうちに、\nまずは気軽にご相談ください。`,
  },

  // ----------------------------------------------------------
  // 5. 相談導線シナリオ (4ステップ)
  //    consultation_followup.yamlのテンプレートを反映
  // ----------------------------------------------------------
  '相談導線シナリオ': {
    1: `バリリンガルです。\n\n留学について、まだ迷っていませんか？\n\n「興味はあるけど、何から始めたらいいかわからない」\n\nバリリンガルのオンライン相談は30分・無料です。\n強引な勧誘はありません。\n\nあなたの状況に合わせて最適なプランを一緒に考えましょう。`,

    2: `バリリンガルです。\n\nオンライン相談を受けた方の声です。\n\n━━━━━━━━━━━━━━\n・費用の目安がわかって安心した\n・自分に合うプランを提案してもらえた\n・留学のイメージが具体的になった\n・無理な勧誘がなくて好印象だった\n━━━━━━━━━━━━━━\n\n30分の無料相談で不安を解消しませんか？\n\n「相談したい」とメッセージを送ってください。`,

    3: `バリリンガルです。\n\nこんな方が来ています。\n\n━━━━━━━━━━━━━━\nCさん（30代・看護師）\n「有給を使って1週間の短期留学。\n帰国後もオンラインで継続中です」\n\nDさん（40代・経営者）\n「ビジネス英語を集中的に学べました」\n━━━━━━━━━━━━━━\n\nあなたの目的に合ったプランをご提案します。\nお気軽にご相談ください。`,

    4: `バリリンガルです。\n\n留学について、最後のご案内です。\n\n今ならお友だち追加特典として\n入学金30,000円が無料のキャンペーン中です。\n\nまずは無料相談から始めてみませんか？\n\n「相談したい」とメッセージを送ってください。`,
  },

  // ----------------------------------------------------------
  // 6. 見積もりフォローシナリオ (4ステップ: Day1/3/5/7)
  //    ※ 見積もり後フォローとは別シナリオ
  // ----------------------------------------------------------
  '見積もりフォローシナリオ': {
    1: `バリリンガルです\n\n先日のお見積もりはご確認いただけましたか？\n\nご不明な点があれば、何でもお気軽にご質問ください\n\nじっくりご検討いただいて大丈夫ですよ`,

    2: `バリリンガルです\n\nよくいただく質問をまとめました\n\n━━━━━━━━━━━━━━\nQ. ビザは必要？\n→ 30日以内ならビザ不要\n\nQ. 現地の治安は？\n→ バリ島は観光地で比較的安全\n\nQ. Wi-Fi環境は？\n→ 学校・宿泊施設すべてWi-Fi完備\n\nQ. 持ち物は？\n→ パスポートと最低限の衣類でOK\n━━━━━━━━━━━━━━\n\n他にも気になることがあればメッセージください`,

    3: `バリリンガルです\n\n留学した方の「ビフォー・アフター」です\n\n━━━━━━━━━━━━━━\nEさん（20代・会社員）\nBefore: 「Thank you」しか言えなかった\nAfter: カフェで店員さんと英語で雑談できるように\n\nFさん（30代・主婦）\nBefore: 英語の勉強が3日坊主\nAfter: 帰国後もオンラインレッスン継続中。TOEIC200点UP\n━━━━━━━━━━━━━━\n\nご質問はいつでもお気軽にどうぞ`,

    4: `バリリンガルです\n\nお見積もりから1週間が経ちました\n\n今なら入学金30,000円が無料のキャンペーン中。\n追加のご質問やプラン変更のご希望があれば対応いたします。\n\n「もう少し相談したい」方はお気軽にメッセージを送ってください。\n無料のオンライン相談もご利用いただけます。`,
  },
};

// ----------------------------------------------------------
// アンケートリマインドシナリオ (Phase1a) のメッセージ
// ※ シナリオ名がAPIでどう登録されているかに応じてマッチング
// ----------------------------------------------------------
const PHASE1A_MESSAGES = {
  1: `こんにちは！バリリンガルです\n\n先ほどはお友だち追加ありがとうございます\n\nあなたにピッタリの留学プランをご提案するために、たった1分のアンケートにご協力いただけませんか？\n\n5つの質問に答えるだけで、おすすめプランが届きます`,

  2: `もし英語が話せるようになったら、何をしてみたいですか？\n\n・海外で働いてみたい\n・世界中を旅したい\n・外国人の友達を作りたい\n・キャリアアップしたい\n\nあなたの「やりたいこと」に合わせた留学プランをご提案しています\n\nまだアンケートがお済みでない方は、ぜひ回答してみてくださいね（約1分）`,
};

// ----------------------------------------------------------
// アンケート後ナーチャリングシナリオ (Phase1b) のメッセージ
// ----------------------------------------------------------
const PHASE1B_MESSAGES = {
  1: `アンケートへのご回答ありがとうございます！\n\nあなたの回答をもとに、ピッタリの留学プランをご案内しますね\n\n気になることがあれば、いつでもメッセージください`,

  2: `こんにちは！バリリンガルです\n\n先日はアンケートにご回答いただきありがとうございました\n\n「英語を話せるようになりたい」\nそう思ったときが、一歩踏み出すベストタイミングです\n\n日本人スタッフが現地でしっかりサポートしています\n\nまずは気軽に、あなたの希望を聞かせてください`,

  3: `バリリンガルです\n\n留学って気になるけど、こんな不安はありませんか？\n\n「費用が高そう…」\n→ バリ島は生活費が日本の1/3。留学費用もリーズナブル\n\n「英語力ゼロでも大丈夫？」\n→ 初心者専用クラスあり。日本人スタッフ常駐\n\n「仕事を辞めないといけない？」\n→ 1週間からの短期留学もあります\n\n無料のオンライン相談で一緒に考えてみませんか？\n強引な勧誘は一切ありません`,
};

// Phase1a/1b のシナリオ名パターン
const PHASE1A_NAME_PATTERNS = ['Phase1a', 'アンケート未回答', 'アンケートリマインド'];
const PHASE1B_NAME_PATTERNS = ['Phase1b', '回答後フォロー', 'ナーチャリング', 'アンケート後'];

// ============================================================
// メイン処理
// ============================================================
async function main() {
  const startTime = Date.now();

  console.log('============================================================');
  console.log('バリリンガル シナリオメッセージ更新');
  console.log(`モード: ${DRY_RUN ? 'ドライラン (書き込みなし)' : '本番実行'}`);
  console.log(`API: ${API_URL}`);
  console.log(`アカウント: ${ACCOUNT_ID}`);
  console.log('============================================================\n');

  // ---- シナリオ一覧取得 ----
  const scenRes = await api('GET', `/api/scenarios?lineAccountId=${ACCOUNT_ID}`);
  const scenarios = scenRes.data || [];
  console.log(`シナリオ数: ${scenarios.length}\n`);

  if (scenarios.length === 0) {
    console.warn('WARN: シナリオが見つかりません。先にmigrate-barilingual.mjsを実行してください。');
    process.exit(0);
  }

  // ---- 集計 ----
  const report = {
    total: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  // ---- 各シナリオを処理 ----
  for (const scenario of scenarios) {
    // メッセージ定義を特定
    let messages = SCENARIO_MESSAGES[scenario.name];

    // Phase1a/1bのパターンマッチ
    if (!messages) {
      if (PHASE1A_NAME_PATTERNS.some(p => scenario.name.includes(p))) {
        messages = PHASE1A_MESSAGES;
      } else if (PHASE1B_NAME_PATTERNS.some(p => scenario.name.includes(p))) {
        messages = PHASE1B_MESSAGES;
      }
    }

    if (!messages) {
      console.log(`SKIP: ${scenario.name} (メッセージ定義なし)`);
      report.skipped++;
      report.details.push({ scenario: scenario.name, action: 'skip', reason: 'メッセージ定義なし' });
      continue;
    }

    console.log(`--- ${scenario.name} (id: ${scenario.id}) ---`);

    // ステップ取得
    let steps;
    try {
      const detailRes = await api('GET', `/api/scenarios/${scenario.id}`);
      steps = detailRes.data?.steps || [];
      console.log(`  ステップ数: ${steps.length}`);
    } catch (e) {
      console.error(`  ERROR: ステップ取得失敗 - ${e.message}`);
      report.failed++;
      report.details.push({ scenario: scenario.name, action: 'error', reason: e.message });
      continue;
    }

    // 各ステップを更新
    for (const step of steps) {
      report.total++;
      const newMessage = messages[step.stepOrder];

      if (!newMessage) {
        console.log(`  SKIP: step ${step.stepOrder} (メッセージ定義なし)`);
        report.skipped++;
        continue;
      }

      // プレースホルダーか既存メッセージかチェック
      const currentContent = step.messageContent || '';
      const isPlaceholder = currentContent.startsWith('[要設定:');
      const isEmpty = currentContent.trim() === '';

      if (!isPlaceholder && !isEmpty) {
        // 既にカスタムメッセージが設定済みで同じ内容ならスキップ
        if (currentContent === newMessage) {
          console.log(`  SKIP: step ${step.stepOrder} (同一内容)`);
          report.skipped++;
          continue;
        }
        // 内容が異なる場合は上書き（プレースホルダー以外でも更新する）
        console.log(`  NOTE: step ${step.stepOrder} 既存メッセージを上書きします`);
      }

      try {
        await api('PUT', `/api/scenarios/${scenario.id}/steps/${step.id}`, {
          messageContent: newMessage,
        });
        const preview = newMessage.replace(/\n/g, ' ').slice(0, 40);
        console.log(`  OK: step ${step.stepOrder} → "${preview}..."`);
        report.updated++;
        report.details.push({
          scenario: scenario.name,
          step: step.stepOrder,
          action: 'updated',
          preview: preview,
        });
      } catch (e) {
        console.error(`  FAIL: step ${step.stepOrder} - ${e.message}`);
        report.failed++;
        report.details.push({
          scenario: scenario.name,
          step: step.stepOrder,
          action: 'failed',
          reason: e.message,
        });
      }
    }
    console.log('');
  }

  // ---- サマリー ----
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('=== サマリー ===');
  console.log(`更新: ${report.updated} / スキップ: ${report.skipped} / 失敗: ${report.failed} / 合計: ${report.total}`);
  console.log(`所要時間: ${elapsed}s`);

  // ---- レポート出力 ----
  await writeReport(report, elapsed);
}

// ============================================================
// レポート出力
// ============================================================
async function writeReport(report, elapsed) {
  const home = homedir();
  const inboxDir = `${home}/.secretary/inbox`;
  await mkdir(inboxDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);
  const reportPath = `${inboxDir}/update-barilingual-messages-${dateStr}.md`;

  const lines = [
    `# バリリンガル メッセージ更新レポート`,
    ``,
    `日時: ${now.toISOString()}`,
    `モード: ${DRY_RUN ? 'ドライラン' : '本番実行'}`,
    `所要時間: ${elapsed}s`,
    ``,
    `## サマリー`,
    `- 更新: ${report.updated}`,
    `- スキップ: ${report.skipped}`,
    `- 失敗: ${report.failed}`,
    `- 合計ステップ: ${report.total}`,
    ``,
    `## 対象シナリオ`,
    `- 見積もり後フォローシナリオ (4ステップ: Day0/1/3/5)`,
    `- 面談前フォローシナリオ (2ステップ: Day0/1)`,
    `- 相談アクション促進シナリオ (3ステップ: Day3/5/7)`,
    `- ABテストシナリオ Day6-7追加分 (4ステップ)`,
    `- 相談導線シナリオ (4ステップ)`,
    `- 見積もりフォローシナリオ (4ステップ: Day1/3/5/7)`,
    `- Phase1a アンケートリマインド (2ステップ)`,
    `- Phase1b アンケート後ナーチャリング (3ステップ)`,
    ``,
    `## 詳細`,
    ...report.details.map(d => {
      if (d.action === 'skip') return `- SKIP: ${d.scenario} (${d.reason})`;
      if (d.action === 'error') return `- ERROR: ${d.scenario} (${d.reason})`;
      if (d.action === 'failed') return `- FAIL: ${d.scenario} step ${d.step} (${d.reason})`;
      return `- OK: ${d.scenario} step ${d.step} → "${d.preview}..."`;
    }),
    ``,
    `## 注意事項`,
    `- 画像URLは [IMAGE_URL] プレースホルダーのまま。管理画面から別途設定が必要`,
    `- シナリオは is_active=false のまま。内容確認後に有効化すること`,
    `- KOH定例方針に基づきテキストを短縮済み`,
  ];

  await writeFile(reportPath, lines.join('\n'), 'utf-8');
  console.log(`\nレポート出力: ${reportPath}`);
}

// ============================================================
// 実行
// ============================================================
main().catch((e) => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
