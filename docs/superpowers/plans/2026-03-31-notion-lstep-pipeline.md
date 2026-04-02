# Notion → Lstep 自動構築パイプライン 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notion DB（正本）からLstepシナリオ構成を読み取り、Playwright経由で自動設定するパイプラインを構築する。s01パイロットで検証後、全17ノードに展開可能にする。

**Architecture:** Notion API → notion-lstep-runner.mjs（オーケストレーター）→ 既存Playwrightアクション群 → Notion Runs DBに結果書き戻し。未検証4アクションをverify＋idempotent化してから、ランナーでマッピング層を構築する。

**Tech Stack:** Node.js, Playwright, Notion API, 既存lstep-automationアクション群

---

## ファイル構成

| 操作 | パス | 責務 |
|------|------|------|
| Modify | `lstep-automation/src/actions/create_pack.js` | idempotent化 + verify |
| Modify | `lstep-automation/src/actions/create_action.js` | idempotent化 + verify |
| Modify | `lstep-automation/src/actions/set_action.js` | create_actionベースに書き直し + verify |
| Modify | `lstep-automation/src/actions/set_scenario_filter.js` | idempotent化 + verify |
| Create | `lstep-automation/src/notion-lstep-runner.mjs` | Notion読み込み → アクション変換 → 実行 → 結果書き戻し |
| Create | `lstep-automation/src/notion-client.mjs` | Notion API薄ラッパー（新スキーマ用） |
| Create | `lstep-automation/src/field-parser.mjs` | Notionフィールド → Playwrightアクションparams変換 |
| Create | `lstep-automation/tests/verify-create-pack.mjs` | create_pack単体verify |
| Create | `lstep-automation/tests/verify-create-action.mjs` | create_action単体verify |
| Create | `lstep-automation/tests/verify-set-scenario-filter.mjs` | set_scenario_filter単体verify |
| Modify | `lstep-automation/.env` | NOTION_TOKEN, NOTION_DB_*_ID追加 |

---

### Task 1: .env にNotion環境変数を追加

**Files:**
- Modify: `lstep-automation/.env`

- [ ] **Step 1: line-harnessから環境変数値を確認**

Run: `grep NOTION_ ~/.zshenv ~/.zshrc ~/.bash_profile 2>/dev/null; echo "---"; env | grep NOTION_`

- [ ] **Step 2: lstep-automation/.envにNotion変数を追加**

```bash
# 既存の.envに追記（値はline-harnessのexport時に使った値と同じ）
NOTION_TOKEN=<line-harnessと同じ値>
NOTION_DB_NODES_ID=<Barilingual Nodes DB ID>
NOTION_DB_TRANSITIONS_ID=<Barilingual Transitions DB ID>
NOTION_DB_MESSAGES_ID=<Barilingual Messages DB ID>
NOTION_DB_RUNS_ID=<Barilingual Runs DB ID>
```

- [ ] **Step 3: 接続テスト**

Run: `cd /Users/kimuratakuya/lstep-automation && node -e "
  const fs = require('fs');
  const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.split('=')[0],l.split('=').slice(1).join('=')]));
  fetch('https://api.notion.com/v1/databases/'+env.NOTION_DB_NODES_ID,{headers:{'Authorization':'Bearer '+env.NOTION_TOKEN,'Notion-Version':'2022-06-28'}}).then(r=>r.json()).then(d=>console.log('OK:',d.title?.[0]?.plain_text||'connected')).catch(e=>console.error('FAIL:',e.message));
"`

Expected: `OK: Barilingual Nodes`

- [ ] **Step 4: Commit**

```bash
# .envはgitignore済みのためcommit不要
```

---

### Task 2: create_pack.js idempotent化 + verify

**Files:**
- Modify: `lstep-automation/src/actions/create_pack.js`
- Create: `lstep-automation/tests/verify-create-pack.mjs`

- [ ] **Step 1: verifyスクリプトを書く（実行前の状態確認用）**

```javascript
// tests/verify-create-pack.mjs
import { launchBrowser, login } from "../src/browser.js";
import { Logger } from "../src/logger.js";
import { createPack } from "../src/actions/create_pack.js";

const logger = new Logger("logs");
const TEST_PACK_NAME = "__test_verify_pack__";

async function main() {
  const { browser, page } = await launchBrowser(logger);
  await login(page, logger);

  // 1. パック作成
  logger.info("verify", "=== create_pack テスト開始 ===");
  await createPack(page, { name: TEST_PACK_NAME, templates: [] }, logger);

  // 2. パック一覧に存在するか確認
  await page.goto("https://manager.linestep.net/line/eggpack", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);
  const exists = await page.evaluate((name) => {
    return [...document.querySelectorAll("tr, li, .list-item")]
      .some(r => r.innerText.includes(name));
  }, TEST_PACK_NAME);

  if (exists) {
    logger.success("verify", `パック「${TEST_PACK_NAME}」作成確認OK`);
  } else {
    logger.error("verify", `パック「${TEST_PACK_NAME}」が一覧に見つからない`);
  }

  // 3. 冪等性テスト: 同名で再実行
  logger.info("verify", "=== 冪等性テスト ===");
  await createPack(page, { name: TEST_PACK_NAME, templates: [] }, logger);
  // idempotent化後はskippedが返るはず

  await logger.screenshot(page, "verify_pack_final");
  await browser.close();
  logger.summary();
}
main().catch(console.error);
```

- [ ] **Step 2: create_pack.jsをidempotent化**

create_template.jsのパターンに倣い、`idempotentCreate`でラップする:

```javascript
// create_pack.js の createPack 関数を修正
import { PAGES, navigateTo } from "./helpers.js";
import { idempotentCreate } from "../idempotent.js";

export async function createPack(page, params, logger) {
  const { name, folder, templates = [], _manifest } = params;
  logger.info("create_pack", `パック作成: ${name}`);

  const result = await idempotentCreate({
    page,
    logger,
    name,
    listUrl: PAGES.pack, // /line/richmenu ではなく /line/eggpack
    manifest: _manifest,
    resourceType: "pack",
    createFn: async () => {
      // 既存のパック作成ロジック（行22〜143の内容をそのまま移動）
    },
  });

  if (result.status === "skipped") {
    logger.warn("create_pack", `パック「${name}」は既に存在（スキップ）`);
  } else if (result.status === "failed") {
    throw new Error(`パック「${name}」作成失敗: ${result.reason}`);
  }
}
```

注意: `PAGES.pack` が `/line/richmenu` を指しているが、パック一覧は `/line/eggpack`。`helpers.js` に `eggpack: \`${BASE_URL}/line/eggpack\`` を追加するか、直接URLを指定する。

- [ ] **Step 3: ブラウザ起動してverifyスクリプト実行**

前提: Lstepにログイン済みのChrome (CDP port 9222) が起動していること

Run: `cd /Users/kimuratakuya/lstep-automation && node tests/verify-create-pack.mjs`

Expected:
- `パック「__test_verify_pack__」作成＆検証完了`
- 冪等性テストで`は既に存在（スキップ）`

- [ ] **Step 4: テストパックを手動削除（Lstep管理画面から）**

- [ ] **Step 5: Commit**

```bash
cd /Users/kimuratakuya/lstep-automation && git add src/actions/create_pack.js tests/verify-create-pack.mjs && git commit -m "feat: create_pack idempotent化 + verify"
```

---

### Task 3: create_action.js idempotent化 + verify

**Files:**
- Modify: `lstep-automation/src/actions/create_action.js`
- Create: `lstep-automation/tests/verify-create-action.mjs`

- [ ] **Step 1: verifyスクリプトを書く**

```javascript
// tests/verify-create-action.mjs
import { launchBrowser, login } from "../src/browser.js";
import { Logger } from "../src/logger.js";
import { createAction } from "../src/actions/create_action.js";

const logger = new Logger("logs");
const TEST_ACTION_NAME = "__test_verify_action__";

async function main() {
  const { browser, page } = await launchBrowser(logger);
  await login(page, logger);

  // タグ操作のみの最小テスト
  logger.info("verify", "=== create_action テスト開始 ===");
  const result = await createAction(page, {
    name: TEST_ACTION_NAME,
    operations: [
      { type: "tag", action: "add", tag_name: "アンケート_回答済" }
    ],
  }, logger);

  logger.info("verify", `結果: actionId=${result?.actionId || "未取得"}`);

  // アクション一覧で存在確認
  await page.goto("https://manager.linestep.net/line/action", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);
  const exists = await page.evaluate((name) => {
    return [...document.querySelectorAll("tr, li, .list-item")]
      .some(r => r.innerText.includes(name));
  }, TEST_ACTION_NAME);

  if (exists) {
    logger.success("verify", `アクション「${TEST_ACTION_NAME}」作成確認OK`);
  } else {
    logger.error("verify", `アクション「${TEST_ACTION_NAME}」が一覧に見つからない`);
  }

  await logger.screenshot(page, "verify_action_final");
  await browser.close();
  logger.summary();
}
main().catch(console.error);
```

- [ ] **Step 2: create_action.jsをidempotent化**

アクション一覧URL `PAGES.action` で `idempotentCreate` ラップ。

```javascript
import { PAGES } from "./helpers.js";
import { idempotentCreate } from "../idempotent.js";

export async function createAction(page, params, logger) {
  const { name, folder, operations = [], _manifest } = params;
  logger.info("create_action", `アクション作成: ${name}`);

  let actionId = null;

  const result = await idempotentCreate({
    page,
    logger,
    name,
    listUrl: PAGES.action,
    manifest: _manifest,
    resourceType: "action",
    createFn: async () => {
      // 既存の作成ロジック（行82〜318）をそのまま移動
      // actionId取得ロジックも含む
    },
  });

  if (result.status === "skipped") {
    // 既存アクションのIDを取得
    await page.goto(PAGES.action, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    actionId = await page.evaluate((name) => {
      const rows = [...document.querySelectorAll("tr, [class*='list-item']")]
        .filter(r => r.offsetParent !== null && r.textContent.includes(name));
      if (rows.length > 0) {
        const link = rows[0].querySelector("a[href*='/line/action/']");
        if (link) { const m = link.href.match(/\/line\/action\/(\d+)/); return m ? m[1] : null; }
      }
      return null;
    }, name);
    logger.warn("create_action", `アクション「${name}」は既に存在（ID: ${actionId}）`);
  } else if (result.status === "failed") {
    throw new Error(`アクション「${name}」作成失敗: ${result.reason}`);
  }

  return { actionId };
}
```

- [ ] **Step 3: verify実行**

Run: `cd /Users/kimuratakuya/lstep-automation && node tests/verify-create-action.mjs`

Expected:
- `アクション「__test_verify_action__」作成＆検証完了`
- actionIdが数字で返ること

- [ ] **Step 4: テストアクションを手動削除**

- [ ] **Step 5: Commit**

```bash
cd /Users/kimuratakuya/lstep-automation && git add src/actions/create_action.js tests/verify-create-action.mjs && git commit -m "feat: create_action idempotent化 + verify"
```

---

### Task 4: set_scenario_filter.js verify

**Files:**
- Modify: `lstep-automation/src/actions/set_scenario_filter.js`
- Create: `lstep-automation/tests/verify-set-scenario-filter.mjs`

- [ ] **Step 1: verifyスクリプトを書く**

```javascript
// tests/verify-set-scenario-filter.mjs
import { launchBrowser, login } from "../src/browser.js";
import { Logger } from "../src/logger.js";
import { setScenarioFilter } from "../src/actions/set_scenario_filter.js";

const logger = new Logger("logs");

async function main() {
  const { browser, page } = await launchBrowser(logger);
  await login(page, logger);

  // S_01シナリオに対してタグ絞り込みをテスト
  // 注意: 既存シナリオのフィルターを変更するため、S_01のURLを直接指定
  logger.info("verify", "=== set_scenario_filter テスト開始 ===");

  await setScenarioFilter(page, {
    scenario: "S_01",
    tags: [
      { name: "配信停止", condition: "exclude" },
    ],
  }, logger);

  // 設定が反映されたかスクリーンショットで確認
  await logger.screenshot(page, "verify_filter_final");
  await browser.close();
  logger.summary();
}
main().catch(console.error);
```

- [ ] **Step 2: verify実行**

Run: `cd /Users/kimuratakuya/lstep-automation && node tests/verify-set-scenario-filter.mjs`

Expected:
- `シナリオ「S_01」の対象絞り込み設定完了`
- screenshotでフィルターが設定されていること

- [ ] **Step 3: 必要に応じてセレクター修正**

Shadow DOM内の `simple-member-query` 要素が見つからない場合、screenshotを確認して修正。

- [ ] **Step 4: Commit**

```bash
cd /Users/kimuratakuya/lstep-automation && git add src/actions/set_scenario_filter.js tests/verify-set-scenario-filter.mjs && git commit -m "feat: set_scenario_filter verify"
```

---

### Task 5: notion-client.mjs（Notion API薄ラッパー）

**Files:**
- Create: `lstep-automation/src/notion-client.mjs`

- [ ] **Step 1: Notion APIクライアントを作成**

```javascript
// src/notion-client.mjs
// 新スキーマ（Nodes/Transitions/Messages/Runs）用Notion APIクライアント
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq), v = trimmed.slice(eq + 1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const TOKEN = process.env.NOTION_TOKEN;
const DB = {
  nodes: process.env.NOTION_DB_NODES_ID,
  transitions: process.env.NOTION_DB_TRANSITIONS_ID,
  messages: process.env.NOTION_DB_MESSAGES_ID,
  runs: process.env.NOTION_DB_RUNS_ID,
};
const BASE = "https://api.notion.com/v1";
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

function getProp(page, name) {
  const p = page.properties[name];
  if (!p) return null;
  switch (p.type) {
    case "title": return p.title.map(t => t.plain_text).join("");
    case "rich_text": return p.rich_text.map(t => t.plain_text).join("");
    case "number": return p.number;
    case "select": return p.select?.name ?? null;
    case "multi_select": return p.multi_select.map(s => s.name);
    case "checkbox": return p.checkbox;
    default: return null;
  }
}

async function query(dbKey, filter, sorts) {
  const body = {};
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;
  const pages = [];
  let cursor;
  do {
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${BASE}/databases/${DB[dbKey]}/query`, {
      method: "POST", headers: HEADERS, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Notion ${res.status}: ${await res.text()}`);
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

export async function fetchNode(nodeId) {
  const rows = await query("nodes", {
    and: [
      { property: "node_id", rich_text: { equals: nodeId } },
      { property: "enabled", checkbox: { equals: true } },
    ],
  });
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    node_id: getProp(r, "node_id"),
    display_name: getProp(r, "display_name"),
    phase: getProp(r, "phase"),
    conversion: getProp(r, "conversion"),
    condition_on: getProp(r, "condition_on"),
    friend_info_policy: getProp(r, "friend_info_policy"),
    tags_add: getProp(r, "tags_add"),
    schedule: getProp(r, "schedule"),
    actions: getProp(r, "actions"),
  };
}

export async function fetchTransitions(fromNodeId) {
  const rows = await query("transitions", {
    and: [
      { property: "from_node_id", rich_text: { equals: fromNodeId } },
      { property: "enabled", checkbox: { equals: true } },
    ],
  }, [{ property: "priority", direction: "ascending" }]);
  return rows.map(r => ({
    transition_id: getProp(r, "transition_id"),
    from_node_id: getProp(r, "from_node_id"),
    to_node_id: getProp(r, "to_node_id"),
    trigger_type: getProp(r, "trigger_type"),
    trigger_detail: getProp(r, "trigger_detail"),
    priority: getProp(r, "priority"),
    stop_current_scenario: getProp(r, "stop_current_scenario"),
  }));
}

export async function fetchMessages(nodeId) {
  const rows = await query("messages", {
    and: [
      { property: "node_id", rich_text: { equals: nodeId } },
      { property: "enabled", checkbox: { equals: true } },
    ],
  }, [
    { property: "day_index", direction: "ascending" },
    { property: "message_id", direction: "ascending" },
  ]);
  return rows.map(r => ({
    message_id: getProp(r, "message_id"),
    node_id: getProp(r, "node_id"),
    scenario_id: getProp(r, "scenario_id"),
    day_index: getProp(r, "day_index"),
    time_slot: getProp(r, "time_slot"),
    message_type: getProp(r, "message_type"),
    content: getProp(r, "content"),
    cta_label: getProp(r, "cta_label"),
    cta_action: getProp(r, "cta_action"),
  }));
}

export async function updateRun(runId, payload) {
  // runIdでRuns DBを検索して更新
  const rows = await query("runs", {
    property: "run_id", rich_text: { equals: runId },
  });
  if (rows.length === 0) throw new Error(`Run not found: ${runId}`);
  const pageId = rows[0].id;
  const properties = {};
  if (payload.status) properties.status = { select: { name: payload.status } };
  if (payload.last_step) properties.last_step = { rich_text: [{ text: { content: payload.last_step } }] };
  if (payload.error_type) properties.error_type = { rich_text: [{ text: { content: payload.error_type } }] };
  if (payload.error_detail) properties.error_detail = { rich_text: [{ text: { content: payload.error_detail } }] };
  if (payload.started_at) properties.started_at = { date: { start: payload.started_at } };
  if (payload.finished_at) properties.finished_at = { date: { start: payload.finished_at } };
  const res = await fetch(`${BASE}/pages/${pageId}`, {
    method: "PATCH", headers: HEADERS,
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`Notion update ${res.status}: ${await res.text()}`);
  return await res.json();
}
```

- [ ] **Step 2: 動作確認**

Run: `cd /Users/kimuratakuya/lstep-automation && node -e "
  import('./src/notion-client.mjs').then(async m => {
    const node = await m.fetchNode('s01');
    console.log('Node:', node?.display_name);
    const trans = await m.fetchTransitions('s01');
    console.log('Transitions:', trans.length);
    const msgs = await m.fetchMessages('s01');
    console.log('Messages:', msgs.length);
  });
"`

Expected:
```
Node: S_01 アンケート
Transitions: 1
Messages: 10
```

- [ ] **Step 3: Commit**

```bash
cd /Users/kimuratakuya/lstep-automation && git add src/notion-client.mjs && git commit -m "feat: Notion API client for new schema (Nodes/Transitions/Messages/Runs)"
```

---

### Task 6: field-parser.mjs（Notionフィールド → アクションパラメータ変換）

**Files:**
- Create: `lstep-automation/src/field-parser.mjs`

- [ ] **Step 1: パーサー実装**

```javascript
// src/field-parser.mjs
// Notion DBのフィールド値をPlaywrightアクションのparamsに変換する

/**
 * friend_info_policy パース
 * 入力例: "[0_アンケート開始日時]=初回のみ / [on_アンケート更新日時]=毎回更新"
 * 出力: [{ field: "アンケート開始日時", prefix: "0_", mode: "write_once" }, ...]
 */
export function parseFriendInfoPolicy(policy) {
  if (!policy) return [];
  const parts = policy.split("/").map(s => s.trim()).filter(Boolean);
  return parts.map(part => {
    const match = part.match(/\[(\w+?)_(.+?)\]=(.+)/);
    if (!match) return null;
    const [, prefix, fieldName, mode] = match;
    return {
      field: fieldName,
      prefix,  // "0_" = write-once, "on_" = update-only
      mode: prefix === "0_" || prefix === "0" ? "write_once" : "update",
      raw_mode: mode,
    };
  }).filter(Boolean);
}

/**
 * tags_add パース
 * 入力例: "アンケート回答で属性タグ + アンケート_回答済"
 * 出力: ["アンケート_回答済"] （明示的なタグ名のみ抽出）
 *
 * 「属性タグ」のような説明文は除外し、
 * 具体的なタグ名（区切り文字: ","、"+"、"/"、"または"）のみ返す
 */
export function parseTagsAdd(tagsStr) {
  if (!tagsStr) return [];
  // "または" を分割子に
  const parts = tagsStr
    .replace(/または/g, ",")
    .split(/[,+/]/)
    .map(s => s.trim())
    .filter(Boolean);
  // 説明文（「〜で〜タグ」のようなフレーズ）を除外
  return parts.filter(p =>
    !p.includes("で") && !p.includes("に応じて") && p.length < 30
  );
}

/**
 * schedule パース
 * 入力例: "Day0,1,3,5"
 * 出力: [0, 1, 3, 5]
 */
export function parseSchedule(scheduleStr) {
  if (!scheduleStr) return [];
  return scheduleStr
    .replace(/Day/gi, "")
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));
}

/**
 * actions パース
 * 入力例: "Day3未回答は S_01停止→phase=99→S_05"
 * 出力: { trigger: "Day3未回答", steps: ["S_01停止", "phase=99", "S_05"] }
 */
export function parseActions(actionsStr) {
  if (!actionsStr) return [];
  const parts = actionsStr.split("。").map(s => s.trim()).filter(Boolean);
  return parts.map(part => {
    const stepsRaw = part.split("→").map(s => s.trim());
    const trigger = stepsRaw[0];
    const steps = stepsRaw.slice(1);
    return { trigger, steps };
  });
}

/**
 * メッセージをday_indexごとにグループ化
 * text + cta を1つのテンプレートにまとめる
 */
export function groupMessagesByDay(messages) {
  const groups = new Map();
  for (const msg of messages) {
    const key = msg.day_index;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(msg);
  }
  return groups;
}

/**
 * メッセージグループ → create_template params に変換
 * text + cta をまとめてProseMirrorテキストに
 */
export function messagesToTemplateParams(nodeId, dayIndex, dayMessages, scenarioId) {
  const textMsgs = dayMessages.filter(m => m.message_type === "text");
  const ctaMsgs = dayMessages.filter(m => m.message_type === "cta");

  // テンプレート名: S_01_D00 形式
  const dayStr = String(dayIndex).padStart(2, "0");
  const templateName = `${scenarioId || nodeId}_D${dayStr}`;

  // テキスト結合（text + CTA label を1つのテンプレートに）
  let content = textMsgs.map(m => m.content).join("\n\n");
  if (ctaMsgs.length > 0) {
    content += "\n\n" + ctaMsgs.map(m => m.cta_label).join("\n");
  }

  return {
    type: "standard",
    name: templateName,
    messages: [{ kind: "text", content }],
  };
}
```

- [ ] **Step 2: パーサーテスト（CLIで即確認）**

Run: `cd /Users/kimuratakuya/lstep-automation && node -e "
  import('./src/field-parser.mjs').then(m => {
    console.log('friendInfo:', JSON.stringify(m.parseFriendInfoPolicy('[0_アンケート開始日時]=初回のみ / [on_アンケート更新日時]=毎回更新')));
    console.log('tags:', m.parseTagsAdd('アンケート回答で属性タグ + アンケート_回答済'));
    console.log('schedule:', m.parseSchedule('Day0,1,3,5'));
    console.log('actions:', JSON.stringify(m.parseActions('Day3未回答は S_01停止→phase=99→S_05')));
  });
"`

Expected:
```
friendInfo: [{"field":"アンケート開始日時","prefix":"0_","mode":"write_once","raw_mode":"初回のみ"},{"field":"アンケート更新日時","prefix":"on_","mode":"update","raw_mode":"毎回更新"}]
tags: ["アンケート_回答済"]
schedule: [0,1,3,5]
actions: [{"trigger":"Day3未回答は S_01停止","steps":["phase=99","S_05"]}]
```

- [ ] **Step 3: Commit**

```bash
cd /Users/kimuratakuya/lstep-automation && git add src/field-parser.mjs && git commit -m "feat: field-parser for Notion → Playwright action params"
```

---

### Task 7: notion-lstep-runner.mjs（メインオーケストレーター）

**Files:**
- Create: `lstep-automation/src/notion-lstep-runner.mjs`

- [ ] **Step 1: ランナー実装**

```javascript
// src/notion-lstep-runner.mjs
// Notion DB → Lstep UI 自動設定ランナー
//
// 使い方:
//   node src/notion-lstep-runner.mjs s01                # s01ノード実行
//   node src/notion-lstep-runner.mjs s01 --dry-run      # Notion読み取りのみ
//   node src/notion-lstep-runner.mjs s01 --resume       # last_stepから再開
import { fetchNode, fetchTransitions, fetchMessages, updateRun } from "./notion-client.mjs";
import {
  parseFriendInfoPolicy, parseTagsAdd, parseSchedule,
  parseActions, groupMessagesByDay, messagesToTemplateParams,
} from "./field-parser.mjs";
import { launchBrowser, login } from "./browser.js";
import { Logger } from "./logger.js";
import { getAction } from "./actions/index.js";

const args = process.argv.slice(2);
const targetNodeId = args.find(a => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const resume = args.includes("--resume");

if (!targetNodeId) {
  console.error("Usage: node src/notion-lstep-runner.mjs <node_id> [--dry-run] [--resume]");
  process.exit(1);
}

const runId = `pilot-${targetNodeId}-001`;

async function main() {
  const logger = new Logger("logs");
  logger.info("runner", `=== Notion→Lstep Runner: ${targetNodeId} ===`);

  // 1. Notionからデータ読み込み
  logger.info("runner", "Notion からデータ取得中...");
  const node = await fetchNode(targetNodeId);
  if (!node) throw new Error(`Node not found: ${targetNodeId}`);
  const transitions = await fetchTransitions(targetNodeId);
  const messages = await fetchMessages(targetNodeId);
  logger.info("runner", `Node: ${node.display_name}, Transitions: ${transitions.length}, Messages: ${messages.length}`);

  // 2. フィールドパース
  const friendInfoFields = parseFriendInfoPolicy(node.friend_info_policy);
  const tags = parseTagsAdd(node.tags_add);
  const schedule = parseSchedule(node.schedule);
  const actions = parseActions(node.actions);
  const messageGroups = groupMessagesByDay(messages);

  // 実行計画を表示
  const plan = {
    node: node.display_name,
    friendInfoFields: friendInfoFields.length,
    tags: tags,
    schedule: schedule,
    actions: actions.length,
    messageGroups: messageGroups.size,
    transitions: transitions.map(t => t.transition_id),
  };
  console.log("\n実行計画:");
  console.log(JSON.stringify(plan, null, 2));

  if (dryRun) {
    console.log("\n(dry-run: ここで終了)");
    // メッセージ詳細も表示
    for (const [day, msgs] of messageGroups) {
      const tpl = messagesToTemplateParams(targetNodeId, day, msgs, node.display_name.split(" ")[0]);
      console.log(`\nDay${day} template: ${tpl.name}`);
      console.log(tpl.messages[0].content.substring(0, 100) + "...");
    }
    return;
  }

  // 3. ブラウザ起動
  const started_at = new Date().toISOString();
  await updateRun(runId, { status: "running", started_at, last_step: "precheck" });

  const { browser, page } = await launchBrowser(logger);
  await login(page, logger);

  let lastStep = "precheck";
  const appliedTransitionIds = [];
  const appliedMessageIds = [];

  try {
    // 4. タグ作成
    lastStep = "node.tags_add";
    for (const tag of tags) {
      logger.info("runner", `タグ作成: ${tag}`);
      const createTag = getAction("create_tag");
      await createTag(page, { name: tag }, logger);
    }
    await updateRun(runId, { last_step: lastStep });

    // 5. 友だち情報欄作成
    lastStep = "node.friend_info_policy";
    for (const fi of friendInfoFields) {
      logger.info("runner", `友だち情報欄: ${fi.field}`);
      const createFriendField = getAction("create_friend_field");
      await createFriendField(page, { name: fi.field, type: "年月日" }, logger);
    }
    await updateRun(runId, { last_step: lastStep });

    // 6. メッセージテンプレート作成
    lastStep = "messages";
    const createTemplate = getAction("create_template");
    for (const [day, msgs] of messageGroups) {
      const systemMsgs = msgs.filter(m => m.message_type === "system");
      const contentMsgs = msgs.filter(m => m.message_type !== "system");
      if (contentMsgs.length === 0) continue;

      const tplParams = messagesToTemplateParams(
        targetNodeId, day, contentMsgs,
        msgs[0].scenario_id || targetNodeId.toUpperCase(),
      );
      logger.info("runner", `テンプレート作成: ${tplParams.name} (Day${day})`);
      await createTemplate(page, tplParams, logger);
      appliedMessageIds.push(...contentMsgs.map(m => m.message_id));
    }
    await updateRun(runId, { last_step: lastStep });

    // 7. 完了
    lastStep = "done";
    await updateRun(runId, {
      status: "success",
      last_step: "done",
      finished_at: new Date().toISOString(),
    });

    logger.success("runner", "=== パイロット実行完了 ===");
    console.log("\n結果:");
    console.log(JSON.stringify({
      result: "success",
      applied_node_id: targetNodeId,
      applied_transition_ids: appliedTransitionIds,
      applied_message_ids: appliedMessageIds,
      last_step: lastStep,
    }, null, 2));

  } catch (err) {
    logger.error("runner", `失敗: ${err.message}`);
    await updateRun(runId, {
      status: "failed",
      last_step: lastStep,
      error_type: err.constructor.name,
      error_detail: err.message.substring(0, 200),
    }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
    logger.summary();
  }
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: helpers.jsにeggpack URLを追加**

`lstep-automation/src/actions/helpers.js` の `PAGES` に追加:

```javascript
eggpack: `${BASE_URL}/line/eggpack`,
```

- [ ] **Step 3: dry-run テスト**

Run: `cd /Users/kimuratakuya/lstep-automation && node src/notion-lstep-runner.mjs s01 --dry-run`

Expected:
- Notionからs01データ取得
- 実行計画のJSON出力
- Day0,1,3,5のテンプレート名とコンテンツプレビュー

- [ ] **Step 4: Commit**

```bash
cd /Users/kimuratakuya/lstep-automation && git add src/notion-lstep-runner.mjs src/actions/helpers.js && git commit -m "feat: Notion→Lstep runner with dry-run support"
```

---

### Task 8: s01パイロット実行

**Files:**
- 変更なし（実行のみ）

前提: Task 2-4のverifyが全て通っていること

- [ ] **Step 1: Chrome CDP起動確認**

Run: `curl -s http://127.0.0.1:9222/json/version | head -1`

Expected: JSONレスポンス（ブラウザ情報）

起動していない場合:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 &
```

- [ ] **Step 2: dry-runで最終確認**

Run: `cd /Users/kimuratakuya/lstep-automation && node src/notion-lstep-runner.mjs s01 --dry-run`

- [ ] **Step 3: 本番実行**

Run: `cd /Users/kimuratakuya/lstep-automation && node src/notion-lstep-runner.mjs s01`

Expected:
- タグ作成（アンケート_回答済）→ skipped or success
- 友だち情報欄作成（4件）→ skipped or success
- テンプレート作成（Day0,1,3,5の4件）→ skipped or success
- Notion Runs更新 → status=success

- [ ] **Step 4: Lstep管理画面で手動確認**

- テンプレート一覧にS_01_D00, S_01_D01, S_01_D03, S_01_D05が存在するか
- タグ一覧にアンケート_回答済が存在するか
- 友だち情報一覧に4フィールドが存在するか

- [ ] **Step 5: Notion Runs DBでステータス確認**

`pilot-s01-001` が `status=success`, `last_step=done` になっているか

- [ ] **Step 6: 結果をprogress.mdに記録**

---

## 依存関係

```
Task 1 (env) ──→ Task 5 (notion-client) ──→ Task 6 (field-parser) ──→ Task 7 (runner)
                                                                            ↓
Task 2 (create_pack verify) ──────────────────────────────────────→ Task 8 (pilot)
Task 3 (create_action verify) ────────────────────────────────────→ Task 8
Task 4 (set_scenario_filter verify) ──────────────────────────────→ Task 8
```

並列実行可能:
- Task 1 + Task 2 + Task 3 + Task 4 （全て独立）
- Task 5 + Task 6 （Task 1完了後、互いに独立）
- Task 7 （Task 5,6完了後）
- Task 8 （Task 2,3,4,7全て完了後）

## 注意事項

- verifyテスト（Task 2-4）はLstepに実データを作成する。テスト後にゴミデータを手動削除する手順を含む
- `PAGES.pack` は `/line/richmenu`（リッチメニュー）を指しているが、パック一覧は `/line/eggpack`。修正が必要
- s01のメッセージにはsystem型（アクション指示）が含まれる。Task 7ではsystemメッセージをスキップし、将来のTask（create_action連携）で対応
- set_action.js は現在「モーダルが既に開いている前提」の設計。create_action.js に機能統合されているため、Task 3のcreate_action verifyで実質カバーされる
