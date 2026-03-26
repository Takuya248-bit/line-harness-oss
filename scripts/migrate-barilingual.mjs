#!/usr/bin/env node
// ============================================================
// バリリンガル Lステップ → LINE Harness 移行スクリプト
// ============================================================
// 環境変数:
//   HARNESS_API_URL    - Harness APIのベースURL
//   HARNESS_API_KEY    - APIキー
//   HARNESS_ACCOUNT_ID - バリリンガル用アカウントID
//
// 使い方:
//   node scripts/migrate-barilingual.mjs
//   node scripts/migrate-barilingual.mjs --dry-run
// ============================================================

const API_URL = process.env.HARNESS_API_URL ?? '';
const API_KEY = process.env.HARNESS_API_KEY ?? '';
const ACCOUNT_ID = process.env.HARNESS_ACCOUNT_ID ?? '';

if (!API_URL || !API_KEY || !ACCOUNT_ID) {
  console.error('必須環境変数が未設定: HARNESS_API_URL, HARNESS_API_KEY, HARNESS_ACCOUNT_ID');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const LOG_PREFIX = DRY_RUN ? '[DRY-RUN]' : '[EXEC]';

// ---- サマリー集計 ----
const summary = { tags: { ok: 0, skip: 0, fail: 0 }, automations: { ok: 0, skip: 0, fail: 0 }, scenarios: { ok: 0, skip: 0, fail: 0 }, steps: { ok: 0, fail: 0 } };

// ---- API呼び出しヘルパー ----
async function api(method, path, body) {
  const url = `${API_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
  };
  if (body) opts.body = JSON.stringify(body);

  if (DRY_RUN && method !== 'GET') {
    console.log(`${LOG_PREFIX} ${method} ${path}`, body ? JSON.stringify(body).slice(0, 120) : '');
    return { success: true, data: { id: 'dry-run-id', name: body?.name ?? '' } };
  }

  const res = await fetch(url, opts);
  const json = await res.json();
  if (!json.success) {
    throw new Error(`API ${method} ${path} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

// ============================================================
// Phase 1: タグ作成
// ============================================================
const TAG_DEFINITIONS = [
  // イベント系
  { name: 'estimate_requested', color: '#EF4444' },
  { name: 'online_reserved', color: '#F59E0B' },
  { name: 'chat_started', color: '#10B981' },
  // フェーズ系
  { name: 'phase_未相談', color: '#6B7280' },
  { name: 'phase_相談済', color: '#3B82F6' },
  { name: 'phase_見積送付済', color: '#8B5CF6' },
  { name: 'phase_入金待ち', color: '#F59E0B' },
  { name: 'phase_入金済', color: '#10B981' },
  { name: 'phase_休眠', color: '#9CA3AF' },
  // データ世代
  { name: 'data_旧', color: '#6B7280' },
  { name: 'data_新', color: '#3B82F6' },
  // ルート識別
  { name: 'route_チャット', color: '#10B981' },
  { name: 'route_カウンセリング', color: '#F59E0B' },
  { name: 'route_見積', color: '#EF4444' },
  // AB
  { name: 'AB_A', color: '#3B82F6' },
  { name: 'AB_B', color: '#EF4444' },
  // 配信制御
  { name: '配信停止', color: '#374151' },
  { name: 'シナリオ停止', color: '#374151' },
];

async function phase1_createTags() {
  console.log('\n=== Phase 1: タグ作成 (%d個) ===', TAG_DEFINITIONS.length);

  // 既存タグ取得（冪等性チェック用）
  let existingTags = [];
  try {
    const res = await api('GET', '/api/tags');
    existingTags = (res.data || []).map(t => t.name);
  } catch (e) {
    console.warn('既存タグ取得失敗、全件作成を試みます:', e.message);
  }

  const tagIdMap = {};

  for (const tag of TAG_DEFINITIONS) {
    if (existingTags.includes(tag.name)) {
      console.log(`${LOG_PREFIX} SKIP (既存): ${tag.name}`);
      summary.tags.skip++;
      // 既存タグのIDを取得
      try {
        const res = await api('GET', '/api/tags');
        const found = (res.data || []).find(t => t.name === tag.name);
        if (found) tagIdMap[tag.name] = found.id;
      } catch (_) { /* ignore */ }
      continue;
    }
    try {
      const res = await api('POST', '/api/tags', { name: tag.name, color: tag.color });
      console.log(`${LOG_PREFIX} OK: ${tag.name} -> ${res.data?.id ?? 'created'}`);
      tagIdMap[tag.name] = res.data?.id;
      summary.tags.ok++;
    } catch (e) {
      console.error(`${LOG_PREFIX} FAIL: ${tag.name} - ${e.message}`);
      summary.tags.fail++;
    }
  }

  return tagIdMap;
}

// ============================================================
// Phase 2: 自動応答（automations）作成
// ============================================================
const AUTOMATION_DEFINITIONS = [
  {
    name: '見積り作成依頼',
    description: 'キーワード「見積」「見積もり」「見積り」で見積もりフォーム案内を送信',
    eventType: 'message_received',
    keywords: ['見積', '見積もり', '見積り', '費用を確認する'],
    matchType: 'partial',
    replyMessage: 'バリリンガルの留学費用をお調べしますね。\n\n以下のフォームからご希望の内容をお選びください。担当者が24時間以内にお見積りをお送りします。\n\nhttps://forms.gle/barilingual-estimate\n\n(フォーム送信後、自動でお見積り作成に入ります)',
    tagToAdd: 'estimate_requested',
    priority: 10,
  },
  {
    name: 'オンライン相談希望',
    description: 'キーワード「相談」「カウンセリング」「予約」でオンライン相談案内を送信',
    eventType: 'message_received',
    keywords: ['相談', 'カウンセリング', '予約', 'オンライン相談を予約する'],
    matchType: 'partial',
    replyMessage: 'オンライン無料カウンセリングのご予約ありがとうございます。\n\n以下からご都合の良い日時をお選びください:\nhttps://calendly.com/barilingual\n\n所要時間は約30分です。バリ島留学に関するどんなご質問にもお答えします。',
    tagToAdd: 'online_reserved',
    priority: 10,
  },
  {
    name: 'チャット相談',
    description: 'キーワード「質問」「聞きたい」「チャットで聞く」でチャット案内を送信',
    eventType: 'message_received',
    keywords: ['質問', '聞きたい', 'チャットで聞く', 'LINEで聞いてみる'],
    matchType: 'partial',
    replyMessage: 'チャットでのご質問を承ります。\n\nバリ島留学について知りたいことを、そのままメッセージで送ってください。スタッフが順次お返事いたします。\n\n(通常1-2時間以内にお返事します。お急ぎの場合は「急ぎ」とお書き添えください)',
    tagToAdd: 'chat_started',
    priority: 10,
  },
];

async function phase2_createAutomations(tagIdMap) {
  console.log('\n=== Phase 2: 自動応答作成 (%d本) ===', AUTOMATION_DEFINITIONS.length);

  // 既存automations取得
  let existingNames = [];
  try {
    const res = await api('GET', `/api/automations?lineAccountId=${ACCOUNT_ID}`);
    existingNames = (res.data || []).map(a => a.name);
  } catch (e) {
    console.warn('既存automations取得失敗:', e.message);
  }

  for (const auto of AUTOMATION_DEFINITIONS) {
    if (existingNames.includes(auto.name)) {
      console.log(`${LOG_PREFIX} SKIP (既存): ${auto.name}`);
      summary.automations.skip++;
      continue;
    }

    // actionsの構築: メッセージ送信 + タグ付与
    const actions = [
      { type: 'send_message', messageType: 'text', content: auto.replyMessage },
    ];
    const tagId = tagIdMap[auto.tagToAdd];
    if (tagId) {
      actions.push({ type: 'add_tag', tagId, tagName: auto.tagToAdd });
    }

    // conditionsの構築: 複数キーワードをOR条件で
    const conditions = {
      matchType: auto.matchType,
      keywords: auto.keywords,
    };

    try {
      const res = await api('POST', '/api/automations', {
        name: auto.name,
        description: auto.description,
        eventType: auto.eventType,
        conditions,
        actions,
        priority: auto.priority,
        lineAccountId: ACCOUNT_ID,
      });
      console.log(`${LOG_PREFIX} OK: ${auto.name} -> ${res.data?.id ?? 'created'}`);
      summary.automations.ok++;
    } catch (e) {
      console.error(`${LOG_PREFIX} FAIL: ${auto.name} - ${e.message}`);
      summary.automations.fail++;
    }
  }
}

// ============================================================
// Phase 3: シナリオ作成
// ============================================================

// delayMinutesの計算: Day数 → 分
const DAY_MIN = 1440; // 24 * 60

const SCENARIO_DEFINITIONS = [
  {
    name: 'ABテストシナリオ',
    description: 'A/Bパターンでの配信テスト (Day0-7)',
    triggerType: 'friend_add',
    steps: [
      { day: 0, order: 1, label: 'Day0 パターンA', conditionType: 'has_tag', conditionValue: 'AB_A' },
      { day: 0, order: 2, label: 'Day0 パターンB', conditionType: 'has_tag', conditionValue: 'AB_B' },
      { day: 1, order: 3, label: 'Day1 パターンA', conditionType: 'has_tag', conditionValue: 'AB_A' },
      { day: 1, order: 4, label: 'Day1 パターンB', conditionType: 'has_tag', conditionValue: 'AB_B' },
      { day: 3, order: 5, label: 'Day3 パターンA', conditionType: 'has_tag', conditionValue: 'AB_A' },
      { day: 3, order: 6, label: 'Day3 パターンB', conditionType: 'has_tag', conditionValue: 'AB_B' },
      { day: 5, order: 7, label: 'Day5 パターンA', conditionType: 'has_tag', conditionValue: 'AB_A' },
      { day: 5, order: 8, label: 'Day5 パターンB', conditionType: 'has_tag', conditionValue: 'AB_B' },
      { day: 7, order: 9, label: 'Day7 パターンA', conditionType: 'has_tag', conditionValue: 'AB_A' },
      { day: 7, order: 10, label: 'Day7 パターンB', conditionType: 'has_tag', conditionValue: 'AB_B' },
    ],
  },
  {
    name: '相談導線シナリオ',
    description: '未相談者への相談誘導 (Day0/1/3/5)',
    triggerType: 'tag_added',
    triggerTag: 'phase_未相談',
    steps: [
      { day: 0, order: 1, label: 'Day0 相談誘導' },
      { day: 1, order: 2, label: 'Day1 相談メリット紹介' },
      { day: 3, order: 3, label: 'Day3 相談事例紹介' },
      { day: 5, order: 4, label: 'Day5 最終案内' },
    ],
  },
  {
    name: '面談前フォローシナリオ',
    description: 'カウンセリング予約後のフォロー (Day0/1)',
    triggerType: 'tag_added',
    triggerTag: 'online_reserved',
    steps: [
      { day: 0, order: 1, label: 'Day0 予約確認・準備案内' },
      { day: 1, order: 2, label: 'Day1 面談リマインド' },
    ],
  },
  {
    name: '相談アクション促進シナリオ',
    description: '相談済み→見積/予約を促す (Day3/5/7)',
    triggerType: 'tag_added',
    triggerTag: 'phase_相談済',
    steps: [
      { day: 3, order: 1, label: 'Day3 見積もり案内' },
      { day: 5, order: 2, label: 'Day5 カウンセリング案内' },
      { day: 7, order: 3, label: 'Day7 最終フォロー' },
    ],
  },
  {
    name: '見積もり後フォローシナリオ',
    description: '見積り依頼後のフォロー (Day0/1/3/5)',
    triggerType: 'tag_added',
    triggerTag: 'estimate_requested',
    steps: [
      { day: 0, order: 1, label: 'Day0 見積り受付確認' },
      { day: 1, order: 2, label: 'Day1 見積り送付通知' },
      { day: 3, order: 3, label: 'Day3 見積り確認フォロー' },
      { day: 5, order: 4, label: 'Day5 質問・相談案内' },
    ],
  },
  {
    name: '見積もりフォローシナリオ',
    description: '見積送付後のクロージング (Day1/3/5/7)',
    triggerType: 'tag_added',
    triggerTag: 'phase_見積送付済',
    steps: [
      { day: 1, order: 1, label: 'Day1 見積り確認リマインド' },
      { day: 3, order: 2, label: 'Day3 FAQ・不安解消' },
      { day: 5, order: 3, label: 'Day5 体験談・実績紹介' },
      { day: 7, order: 4, label: 'Day7 最終フォロー' },
    ],
  },
];

async function phase3_createScenarios(tagIdMap) {
  console.log('\n=== Phase 3: シナリオ作成 (%d本) ===', SCENARIO_DEFINITIONS.length);

  // 既存シナリオ取得
  let existingNames = [];
  try {
    const res = await api('GET', `/api/scenarios?lineAccountId=${ACCOUNT_ID}`);
    existingNames = (res.data || []).map(s => s.name);
  } catch (e) {
    console.warn('既存シナリオ取得失敗:', e.message);
  }

  for (const scenarioDef of SCENARIO_DEFINITIONS) {
    if (existingNames.includes(scenarioDef.name)) {
      console.log(`${LOG_PREFIX} SKIP (既存): ${scenarioDef.name}`);
      summary.scenarios.skip++;
      continue;
    }

    // シナリオ作成
    let scenarioId;
    try {
      const triggerTagId = scenarioDef.triggerTag ? (tagIdMap[scenarioDef.triggerTag] || null) : null;
      const res = await api('POST', '/api/scenarios', {
        name: scenarioDef.name,
        description: scenarioDef.description,
        triggerType: scenarioDef.triggerType,
        triggerTagId,
        isActive: false, // 最初はOFFで作成
        lineAccountId: ACCOUNT_ID,
      });
      scenarioId = res.data?.id;
      console.log(`${LOG_PREFIX} OK: ${scenarioDef.name} -> ${scenarioId ?? 'created'}`);
      summary.scenarios.ok++;
    } catch (e) {
      console.error(`${LOG_PREFIX} FAIL: ${scenarioDef.name} - ${e.message}`);
      summary.scenarios.fail++;
      continue; // ステップ作成をスキップ
    }

    // ステップ作成
    if (!scenarioId || DRY_RUN) {
      for (const step of scenarioDef.steps) {
        console.log(`${LOG_PREFIX}   Step: ${step.label} (Day${step.day})`);
        summary.steps.ok++;
      }
      continue;
    }

    for (const step of scenarioDef.steps) {
      const placeholder = `[要設定: ${scenarioDef.name} Day${step.day} メッセージ]`;
      try {
        await api('POST', `/api/scenarios/${scenarioId}/steps`, {
          stepOrder: step.order,
          delayMinutes: step.day * DAY_MIN,
          messageType: 'text',
          messageContent: placeholder,
          conditionType: step.conditionType || null,
          conditionValue: step.conditionValue || null,
        });
        console.log(`${LOG_PREFIX}   Step OK: ${step.label}`);
        summary.steps.ok++;
      } catch (e) {
        console.error(`${LOG_PREFIX}   Step FAIL: ${step.label} - ${e.message}`);
        summary.steps.fail++;
      }
    }
  }
}

// ============================================================
// Phase 4: テスト検証
// ============================================================
async function phase4_verify() {
  console.log('\n=== Phase 4: テスト検証 ===');

  if (DRY_RUN) {
    console.log(`${LOG_PREFIX} ドライランのため検証スキップ`);
    return;
  }

  try {
    const tagsRes = await api('GET', '/api/tags');
    const tagCount = (tagsRes.data || []).length;
    console.log(`タグ総数: ${tagCount} (期待: 18以上)`);

    const autoRes = await api('GET', `/api/automations?lineAccountId=${ACCOUNT_ID}`);
    const autoCount = (autoRes.data || []).length;
    console.log(`自動応答数: ${autoCount} (期待: 3以上)`);

    const scenRes = await api('GET', `/api/scenarios?lineAccountId=${ACCOUNT_ID}`);
    const scenCount = (scenRes.data || []).length;
    console.log(`シナリオ数: ${scenCount} (期待: 6以上)`);

    // 各シナリオのステップ数を確認
    for (const s of scenRes.data || []) {
      try {
        const detail = await api('GET', `/api/scenarios/${s.id}`);
        const stepCount = (detail.data?.steps || []).length;
        console.log(`  ${s.name}: ${stepCount}ステップ`);
      } catch (_) { /* ignore */ }
    }

    if (tagCount < 17) console.warn('WARN: タグ数が期待値未満');
    if (autoCount < 3) console.warn('WARN: 自動応答数が期待値未満');
    if (scenCount < 6) console.warn('WARN: シナリオ数が期待値未満');
  } catch (e) {
    console.error('検証エラー:', e.message);
  }
}

// ============================================================
// レポート出力
// ============================================================
async function writeReport() {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { homedir } = await import('node:os');
  const home = homedir();

  const inboxDir = `${home}/.secretary/inbox`;
  await mkdir(inboxDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const reportPath = `${inboxDir}/migrate-barilingual-report-${date}.md`;

  const lines = [
    `# バリリンガル Harness移行レポート`,
    ``,
    `日時: ${new Date().toISOString()}`,
    `モード: ${DRY_RUN ? 'ドライラン' : '実行'}`,
    `API: ${API_URL}`,
    `アカウント: ${ACCOUNT_ID}`,
    ``,
    `## タグ (${TAG_DEFINITIONS.length}個)`,
    `- 成功: ${summary.tags.ok}`,
    `- スキップ(既存): ${summary.tags.skip}`,
    `- 失敗: ${summary.tags.fail}`,
    ``,
    `## 自動応答 (${AUTOMATION_DEFINITIONS.length}本)`,
    `- 成功: ${summary.automations.ok}`,
    `- スキップ(既存): ${summary.automations.skip}`,
    `- 失敗: ${summary.automations.fail}`,
    ``,
    `## シナリオ (${SCENARIO_DEFINITIONS.length}本)`,
    `- 成功: ${summary.scenarios.ok}`,
    `- スキップ(既存): ${summary.scenarios.skip}`,
    `- 失敗: ${summary.scenarios.fail}`,
    `- ステップ成功: ${summary.steps.ok}`,
    `- ステップ失敗: ${summary.steps.fail}`,
    ``,
    `## シナリオ一覧`,
    ...SCENARIO_DEFINITIONS.map(s => `- ${s.name}: ${s.steps.length}ステップ (${s.triggerType}${s.triggerTag ? ' / ' + s.triggerTag : ''})`),
    ``,
    `## 注意事項`,
    `- メッセージ本文は「[要設定:]」プレースホルダー。管理画面から設定が必要`,
    `- シナリオはis_active=falseで作成済み。内容確認後に有効化すること`,
    `- 自動応答のキーワードマッチはpartialモード`,
  ];

  await writeFile(reportPath, lines.join('\n'), 'utf-8');
  console.log(`\nレポート出力: ${reportPath}`);
}

// ============================================================
// メイン
// ============================================================
async function main() {
  console.log('============================================================');
  console.log('バリリンガル Lステップ → LINE Harness 移行');
  console.log(`モード: ${DRY_RUN ? 'ドライラン (APIは呼びません)' : '本番実行'}`);
  console.log(`API: ${API_URL}`);
  console.log(`アカウント: ${ACCOUNT_ID}`);
  console.log('============================================================');

  const tagIdMap = await phase1_createTags();
  await phase2_createAutomations(tagIdMap);
  await phase3_createScenarios(tagIdMap);
  await phase4_verify();

  // サマリー
  console.log('\n=== サマリー ===');
  console.log(`タグ: 成功${summary.tags.ok} / スキップ${summary.tags.skip} / 失敗${summary.tags.fail}`);
  console.log(`自動応答: 成功${summary.automations.ok} / スキップ${summary.automations.skip} / 失敗${summary.automations.fail}`);
  console.log(`シナリオ: 成功${summary.scenarios.ok} / スキップ${summary.scenarios.skip} / 失敗${summary.scenarios.fail}`);
  console.log(`ステップ: 成功${summary.steps.ok} / 失敗${summary.steps.fail}`);

  await writeReport();
}

main().catch((e) => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
