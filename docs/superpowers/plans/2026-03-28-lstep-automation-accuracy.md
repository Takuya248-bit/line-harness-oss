# lstep-automation 実行精度改善 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lステップ GUI 自動化の実行精度を向上させる。棚卸し→修復→共通基盤の順で、冪等性・trace収集・dry-run を導入する。

**Architecture:** 既存の auto_run.js + actions/ 構造を維持しつつ、共通基盤（storageState認証、trace収集、冪等化ヘルパー、成功判定）をレイヤーとして追加する。auto_run.js に dry-run モードと storageState 認証を組み込み、各アクションに pre-check / post-check を段階的に追加していく。

**Tech Stack:** Node.js, Playwright (^1.58.0), YAML (^2.7.0), better-sqlite3

**プロジェクトディレクトリ:** `/Users/kimuratakuya/lstep-automation/`

---

## ファイル構成

### 新規作成
- `src/auth.js` — storageState ベースの認証管理
- `src/trace-collector.js` — trace / console / network 収集
- `src/idempotent.js` — 冪等化ヘルパー（pre-check, post-check, retry）
- `src/verifier.js` — 成功判定（一覧確認 + 詳細確認）
- `src/dry-run.js` — dry-run モード（YAML解析→diff出力）
- `src/audit.js` — 全アクション棚卸しスクリプト
- `src/manifest.js` — resource-manifest.json 管理
- `workflows/audit/` — 棚卸し用テスト YAML 格納先

### 既存変更
- `src/auto_run.js` — storageState 認証、trace 収集、dry-run フラグ対応
- `src/browser.js` — storageState ベースの context 生成に切り替え
- `src/logger.js` — console.jsonl / network-failures.json 出力追加
- `src/actions/helpers.js` — PAGES に不足 URL 追加（conversion 等）
- `src/actions/create_tag.js` — 冪等化（pre-check + post-check）
- `src/actions/delete_tag.js` — 冪等化
- `src/actions/create_friend_field.js` — 冪等化
- `src/actions/rename_friend_field.js` — 冪等化
- `src/actions/create_template.js` — 冪等化
- `src/actions/create_scenario.js` — 冪等化
- `src/actions/index.js` — 新アクション登録

---

### Task 1: storageState 認証基盤

**Files:**
- Create: `src/auth.js`
- Modify: `src/browser.js`
- Modify: `src/login_save.mjs`

- [ ] **Step 1: login_save.mjs を storageState 保存に対応**

`src/login_save.mjs` の Cookie 保存部分の後に storageState 保存を追加する。

```js
// login_save.mjs の ctx.close() の前に追加:
const storageState = await ctx.storageState();
fs.writeFileSync('./lstep-storage-state.json', JSON.stringify(storageState, null, 2));
console.log(`storageState 保存完了 (cookies: ${storageState.cookies.length}, origins: ${storageState.origins.length})`);
```

- [ ] **Step 2: src/auth.js を作成**

```js
// src/auth.js — storageState ベースの認証管理
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORAGE_PATH = path.join(__dirname, "..", "lstep-storage-state.json");
const FALLBACK_COOKIE_PATH = path.join(__dirname, "..", "lstep-cookies.json");

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AUTH_FAILURE";
  }
}

/**
 * storageState ファイルを読み込む。なければ cookies.json からフォールバック生成。
 */
export function loadStorageState(storagePath = DEFAULT_STORAGE_PATH) {
  if (fs.existsSync(storagePath)) {
    return JSON.parse(fs.readFileSync(storagePath, "utf-8"));
  }
  // フォールバック: cookies.json → storageState 形式に変換
  if (fs.existsSync(FALLBACK_COOKIE_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(FALLBACK_COOKIE_PATH, "utf-8"));
    return { cookies, origins: [] };
  }
  throw new AuthError(
    "認証ファイルが見つかりません。`node src/login_save.mjs` を実行してください。"
  );
}

/**
 * ログイン済みか確認。未ログインなら AuthError を投げる。
 */
export async function verifyLoggedIn(page, logger) {
  const url = page.url();
  if (url.includes("login") || url === "about:blank") {
    // ダッシュボードに遷移してみる
    await page.goto("https://manager.linestep.net/", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(3000);
    if (page.url().includes("login")) {
      throw new AuthError(
        "セッション切れ。`node src/login_save.mjs` を実行してください。"
      );
    }
  }
  logger.success("auth", `認証OK (${page.url()})`);
}
```

- [ ] **Step 3: browser.js を storageState 対応に変更**

`src/browser.js` の `launchBrowser` 関数に storageState オプションを追加。persistent context の代わりに通常の browser.newContext + storageState を使う headless モードを追加する。

```js
// browser.js の launchBrowser 関数末尾（persistent context ブロックの前）に追加:

// storageState モード: headless 時は persistent context を使わず storageState で認証
const storageStatePath = process.env.LSTEP_STORAGE_STATE || "";
if (storageStatePath || useHeadless) {
  const { loadStorageState } = await import("./auth.js");
  const storageState = loadStorageState(storageStatePath || undefined);

  const browser = await chromium.launch({
    headless: useHeadless,
    args: launchArgs,
  });
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 900 },
    locale: "ja-JP",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(120000);
  logger.info("browser", `storageState モードで起動 (headless: ${useHeadless})`);
  return { browser, context, page };
}
```

- [ ] **Step 4: auto_run.js の login() を verifyLoggedIn() に差し替え**

```js
// auto_run.js の import に追加:
import { verifyLoggedIn, AuthError } from "./auth.js";

// main() 内の login(page, logger) を以下に変更:
try {
  await verifyLoggedIn(page, logger);
} catch (e) {
  if (e.name === "AUTH_FAILURE") {
    logger.error("auth", e.message);
    console.error("\n⚠️  " + e.message);
    process.exit(2); // auth failure は exit code 2
  }
  throw e;
}
```

- [ ] **Step 5: 動作確認**

Run: `cd /Users/kimuratakuya/lstep-automation && LSTEP_HEADLESS=true node -e "import('./src/auth.js').then(m => { const s = m.loadStorageState(); console.log('cookies:', s.cookies.length, 'origins:', s.origins.length); })"`

Expected: cookies 数と origins 数が表示される（storageState がなければ cookies.json からフォールバック）

- [ ] **Step 6: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/auth.js src/browser.js src/login_save.mjs src/auto_run.js
git commit -m "feat: add storageState-based auth, fallback from cookies.json"
```

---

### Task 2: trace / console / network 収集

**Files:**
- Create: `src/trace-collector.js`
- Modify: `src/logger.js`
- Modify: `src/auto_run.js`

- [ ] **Step 1: src/trace-collector.js を作成**

```js
// src/trace-collector.js — Playwright trace + console + network 収集
import fs from "fs";
import path from "path";

export class TraceCollector {
  constructor(runDir) {
    this.runDir = runDir;
    this.tracesDir = path.join(runDir, "traces");
    fs.mkdirSync(this.tracesDir, { recursive: true });
    this.consoleLog = [];
    this.networkFailures = [];
    this._listeners = [];
  }

  /**
   * context に対して trace を開始する
   */
  async startTrace(context, name = "run") {
    this.context = context;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    this.traceName = name;
  }

  /**
   * page の console / network イベントをリッスン
   */
  attachPageListeners(page) {
    const onConsole = (msg) => {
      this.consoleLog.push({
        time: new Date().toISOString(),
        type: msg.type(),
        text: msg.text().substring(0, 500),
        url: page.url(),
      });
    };
    const onPageError = (err) => {
      this.consoleLog.push({
        time: new Date().toISOString(),
        type: "pageerror",
        text: err.message.substring(0, 500),
        url: page.url(),
      });
    };
    const onResponse = (response) => {
      const status = response.status();
      if (status >= 400) {
        this.networkFailures.push({
          time: new Date().toISOString(),
          url: response.url().substring(0, 300),
          status,
          method: response.request().method(),
        });
      }
    };
    const onRequestFailed = (request) => {
      this.networkFailures.push({
        time: new Date().toISOString(),
        url: request.url().substring(0, 300),
        method: request.method(),
        failure: request.failure()?.errorText || "unknown",
      });
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);
    page.on("requestfailed", onRequestFailed);

    this._listeners.push(
      { page, event: "console", fn: onConsole },
      { page, event: "pageerror", fn: onPageError },
      { page, event: "response", fn: onResponse },
      { page, event: "requestfailed", fn: onRequestFailed }
    );
  }

  /**
   * trace を停止してファイルに保存
   */
  async stopTrace() {
    if (!this.context) return;
    const tracePath = path.join(this.tracesDir, `${this.traceName}.zip`);
    await this.context.tracing.stop({ path: tracePath });
    return tracePath;
  }

  /**
   * console / network ログをファイルに保存
   */
  saveArtifacts() {
    fs.writeFileSync(
      path.join(this.runDir, "console.jsonl"),
      this.consoleLog.map((e) => JSON.stringify(e)).join("\n") + "\n"
    );
    fs.writeFileSync(
      path.join(this.runDir, "network-failures.json"),
      JSON.stringify(this.networkFailures, null, 2)
    );
  }

  /**
   * リスナー解除
   */
  detach() {
    for (const { page, event, fn } of this._listeners) {
      page.removeListener(event, fn);
    }
    this._listeners = [];
  }
}
```

- [ ] **Step 2: auto_run.js に TraceCollector を組み込む**

```js
// auto_run.js の import に追加:
import { TraceCollector } from "./trace-collector.js";

// main() 内、browser 起動後に追加:
const traceCollector = new TraceCollector(logger.runDir);
await traceCollector.startTrace(result.context || result.browser, "run");
traceCollector.attachPageListeners(page);

// finally ブロック内、browser.close() の前に追加:
try {
  await traceCollector.stopTrace();
  traceCollector.saveArtifacts();
  traceCollector.detach();
  logger.info("runner", `trace/console/network 保存完了`);
} catch (traceErr) {
  logger.warn("runner", `trace保存失敗(無視): ${traceErr.message.substring(0, 60)}`);
}
```

- [ ] **Step 3: 動作確認**

Run: `cd /Users/kimuratakuya/lstep-automation && node src/auto_run.js workflows/test.yaml 2>&1 | tail -5`

Expected: ログに「trace/console/network 保存完了」が表示される。`logs/` 配下の run ディレクトリに `traces/run.zip`, `console.jsonl`, `network-failures.json` が存在する。

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/trace-collector.js src/auto_run.js
git commit -m "feat: add trace/console/network collection per run"
```

---

### Task 3: resource-manifest と cleanup 管理

**Files:**
- Create: `src/manifest.js`

- [ ] **Step 1: src/manifest.js を作成**

```js
// src/manifest.js — テストデータの作成/削除を追跡する resource manifest
import fs from "fs";
import path from "path";

export class ResourceManifest {
  constructor(runDir) {
    this.filePath = path.join(runDir, "resource-manifest.json");
    this.quarantinePath = path.join(runDir, "quarantine.json");
    this.resources = [];
    this.quarantine = [];
  }

  /**
   * 作成したリソースを記録
   */
  add(type, name, params = {}) {
    this.resources.push({
      type,
      name,
      params,
      createdAt: new Date().toISOString(),
      cleanedUp: false,
    });
    this._save();
  }

  /**
   * cleanup 完了をマーク
   */
  markCleaned(name) {
    const res = this.resources.find((r) => r.name === name && !r.cleanedUp);
    if (res) {
      res.cleanedUp = true;
      res.cleanedUpAt = new Date().toISOString();
      this._save();
    }
  }

  /**
   * cleanup 失敗をマーク（quarantine に移動）
   */
  markQuarantined(name, reason) {
    this.quarantine.push({
      name,
      reason,
      time: new Date().toISOString(),
    });
    fs.writeFileSync(this.quarantinePath, JSON.stringify(this.quarantine, null, 2));
  }

  /**
   * まだ cleanup されていないリソース一覧
   */
  getPending() {
    return this.resources.filter((r) => !r.cleanedUp);
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.resources, null, 2));
  }

  /**
   * 既存の manifest を読み込む（前回 run の残留データ検出用）
   */
  static loadPrevious(runsDir) {
    const dirs = fs.readdirSync(runsDir).sort().reverse();
    for (const dir of dirs) {
      const p = path.join(runsDir, dir, "resource-manifest.json");
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, "utf-8"));
        const pending = data.filter((r) => !r.cleanedUp);
        if (pending.length > 0) return { dir, pending };
      }
    }
    return null;
  }
}
```

- [ ] **Step 2: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/manifest.js
git commit -m "feat: add resource manifest for test data tracking"
```

---

### Task 4: 冪等化ヘルパーと成功判定

**Files:**
- Create: `src/idempotent.js`
- Create: `src/verifier.js`

- [ ] **Step 1: src/verifier.js を作成**

```js
// src/verifier.js — アクション成功判定
//
// 一覧確認 + 詳細確認 + 再読込確認の3段階で判定する

/**
 * 一覧画面で対象名が存在するか DOM 確認
 */
export async function verifyExistsInList(page, name, logger) {
  // テーブル or リスト内のテキストを検索
  const found = await page.evaluate((searchName) => {
    const rows = [...document.querySelectorAll("tr, li, .list-item")];
    return rows.some((r) => r.innerText.includes(searchName));
  }, name);
  if (found) {
    logger.info("verify", `一覧に「${name}」を確認`);
  }
  return found;
}

/**
 * 一覧画面で対象名が存在しないことを確認（削除判定）
 */
export async function verifyNotInList(page, name, logger) {
  const found = await page.evaluate((searchName) => {
    const rows = [...document.querySelectorAll("tr, li, .list-item")];
    return rows.some((r) => r.innerText.includes(searchName));
  }, name);
  if (!found) {
    logger.info("verify", `一覧から「${name}」が消えていることを確認`);
  }
  return !found;
}

/**
 * ページを再読込して再確認
 */
export async function verifyAfterReload(page, name, shouldExist, logger) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);
  if (shouldExist) {
    return verifyExistsInList(page, name, logger);
  } else {
    return verifyNotInList(page, name, logger);
  }
}

/**
 * console error / pageerror が致命的でないことを確認
 */
export function checkConsoleFatal(traceCollector) {
  const fatal = traceCollector.consoleLog.filter(
    (e) =>
      e.type === "pageerror" ||
      (e.type === "error" && !e.text.includes("favicon"))
  );
  return fatal.length;
}

/**
 * network failure が閾値以下か確認
 */
export function checkNetworkFailures(traceCollector, threshold = 5) {
  return traceCollector.networkFailures.length <= threshold;
}
```

- [ ] **Step 2: src/idempotent.js を作成**

```js
// src/idempotent.js — 冪等化ヘルパー
//
// pre-check → execute → post-check → reload確認 の流れを標準化

import { verifyExistsInList, verifyNotInList, verifyAfterReload } from "./verifier.js";

/**
 * 冪等な作成: 既に存在すればスキップ、なければ作成して検証
 *
 * @param {object} opts
 * @param {Page} opts.page
 * @param {Logger} opts.logger
 * @param {string} opts.name - 作成対象の名前
 * @param {string} opts.listUrl - 一覧画面の URL
 * @param {Function} opts.createFn - 実際の作成処理（async () => void）
 * @param {ResourceManifest} opts.manifest - リソース管理
 * @param {string} opts.resourceType - リソース種別（tag, template 等）
 */
export async function idempotentCreate({
  page, logger, name, listUrl, createFn, manifest, resourceType,
}) {
  // pre-check: 既存確認
  logger.info("idempotent", `pre-check: 「${name}」の存在確認`);
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);
  const alreadyExists = await verifyExistsInList(page, name, logger);
  if (alreadyExists) {
    logger.warn("idempotent", `「${name}」は既に存在。作成スキップ`);
    return { status: "skipped", reason: "already_exists" };
  }

  // execute
  logger.info("idempotent", `execute: 「${name}」を作成`);
  await createFn();

  // post-check: 一覧に存在するか
  logger.info("idempotent", `post-check: 一覧確認`);
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);
  const existsAfter = await verifyExistsInList(page, name, logger);
  if (!existsAfter) {
    logger.warn("idempotent", `post-check 失敗: 一覧に「${name}」が見つからない`);
    return { status: "failed", reason: "not_found_after_create" };
  }

  // reload確認
  const existsAfterReload = await verifyAfterReload(page, name, true, logger);
  if (!existsAfterReload) {
    logger.warn("idempotent", `reload確認失敗: 「${name}」がリロード後に消えた`);
    return { status: "failed", reason: "vanished_after_reload" };
  }

  // manifest に記録
  if (manifest) {
    manifest.add(resourceType, name);
  }

  logger.success("idempotent", `「${name}」作成＆検証完了`);
  return { status: "success" };
}

/**
 * 冪等な削除: 存在しなければスキップ、あれば削除して検証
 */
export async function idempotentDelete({
  page, logger, name, listUrl, deleteFn, manifest,
}) {
  // pre-check
  logger.info("idempotent", `pre-check: 「${name}」の存在確認`);
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);
  const exists = await verifyExistsInList(page, name, logger);
  if (!exists) {
    logger.warn("idempotent", `「${name}」は存在しない。削除スキップ`);
    return { status: "skipped", reason: "not_found" };
  }

  // execute
  await deleteFn();

  // post-check
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);
  const gone = await verifyNotInList(page, name, logger);
  if (!gone) {
    logger.warn("idempotent", `post-check 失敗: 「${name}」がまだ存在する`);
    return { status: "failed", reason: "still_exists" };
  }

  const goneAfterReload = await verifyAfterReload(page, name, false, logger);
  if (!goneAfterReload) {
    return { status: "failed", reason: "reappeared_after_reload" };
  }

  if (manifest) manifest.markCleaned(name);

  logger.success("idempotent", `「${name}」削除＆検証完了`);
  return { status: "success" };
}

/**
 * 冪等リトライ: 作成系は存在確認してから再実行
 */
export async function idempotentRetry({
  page, logger, name, listUrl, actionFn, maxRetries = 3, delays = [10000, 30000, 60000],
}) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await actionFn();
      return result;
    } catch (err) {
      logger.warn("retry", `attempt ${attempt + 1}/${maxRetries} 失敗: ${err.message.substring(0, 100)}`);

      // 再読込して存在確認（サイレント成功の可能性）
      await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);
      const exists = await verifyExistsInList(page, name, logger);
      if (exists) {
        logger.info("retry", `「${name}」はエラーだが実際に作成されていた（サイレント成功）`);
        return { status: "success", note: "silent_success" };
      }

      if (attempt < maxRetries - 1) {
        const delay = delays[attempt] || delays[delays.length - 1];
        logger.info("retry", `${delay / 1000}秒待機後にリトライ`);
        await page.waitForTimeout(delay);
      }
    }
  }
  return { status: "failed", reason: "max_retries_exceeded" };
}
```

- [ ] **Step 3: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/verifier.js src/idempotent.js
git commit -m "feat: add idempotent helpers and verification functions"
```

---

### Task 5: helpers.js に不足 URL 追加

**Files:**
- Modify: `src/actions/helpers.js`

- [ ] **Step 1: PAGES に不足 URL を追加**

`src/actions/helpers.js` の PAGES オブジェクトに以下を追加:

```js
// 既存の PAGES に追加
conversion: `${BASE_URL}/line/journey-tag`,
pack: `${BASE_URL}/line/richmenu`,
funnel: `${BASE_URL}/line/funnel`,
cross_analysis: `${BASE_URL}/line/cross-analysis`,
```

- [ ] **Step 2: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/actions/helpers.js
git commit -m "feat: add missing page URLs to helpers.js"
```

---

### Task 6: create_tag を冪等化（優先度1のサンプル実装）

**Files:**
- Modify: `src/actions/create_tag.js`

- [ ] **Step 1: create_tag.js に冪等化を適用**

```js
// src/actions/create_tag.js — 冪等化対応版
import { PAGES, navigateTo } from "./helpers.js";
import { idempotentCreate } from "../idempotent.js";

/**
 * create_tag: タグを新規作成（冪等）
 *
 * params:
 *   name: タグ名
 *   folder: (optional) フォルダ名
 *   _manifest: (optional) ResourceManifest インスタンス
 */
export async function createTag(page, params, logger) {
  const { name, folder, _manifest } = params;
  logger.info("create_tag", `タグ作成: ${name}`);

  const result = await idempotentCreate({
    page,
    logger,
    name,
    listUrl: PAGES.tag,
    manifest: _manifest,
    resourceType: "tag",
    createFn: async () => {
      await navigateTo(page, PAGES.tag, logger);

      // フォルダ選択
      if (folder) {
        const folderBtn = page.locator("button").filter({ hasText: folder }).first();
        if (await folderBtn.isVisible()) {
          await folderBtn.click();
          await page.waitForTimeout(2000);
        }
      }

      // 「新しいタグ」ボタン
      const newBtn = page.locator("button").filter({ hasText: "新しいタグ" }).first();
      await newBtn.click();
      await page.waitForTimeout(2000);
      await logger.screenshot(page, "tag_modal_opened");

      // モーダル内のinputにタグ名入力
      const modal = page.locator('[role="dialog"]');
      const nameInput = modal.locator("input").first();
      await nameInput.fill(name);
      await logger.screenshot(page, "tag_name_filled");

      // モーダル内の「作成」ボタン
      const createBtn = modal.locator("button").filter({ hasText: "作成" }).first();
      await createBtn.click();
      await page.waitForTimeout(3000);
      await logger.screenshot(page, `tag_created_${name}`);
    },
  });

  if (result.status === "skipped") {
    logger.warn("create_tag", `タグ「${name}」は既に存在（スキップ）`);
  } else if (result.status === "failed") {
    throw new Error(`タグ「${name}」作成失敗: ${result.reason}`);
  } else {
    logger.success("create_tag", `タグ「${name}」作成＆検証完了`);
  }
}
```

- [ ] **Step 2: 動作確認（テスト YAML で実行）**

テスト用 YAML を作成して実行:

```yaml
# workflows/audit/test-create-tag.yaml
name: "[AUDIT] タグ作成テスト"
steps:
  - name: "テストタグ作成"
    action: create_tag
    params:
      name: "[TEST][audit001] テストタグ"
  - name: "テストタグ削除"
    action: delete_tag
    params:
      name: "[TEST][audit001] テストタグ"
    continue_on_error: true
```

Run: `cd /Users/kimuratakuya/lstep-automation && LSTEP_HEADLESS=true node src/auto_run.js workflows/audit/test-create-tag.yaml`

Expected: pre-check → execute → post-check → reload確認 のログが出力される。2回目実行で「既に存在（スキップ）」が表示される。

- [ ] **Step 3: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/actions/create_tag.js workflows/audit/test-create-tag.yaml
git commit -m "feat: make create_tag idempotent with pre/post-check"
```

---

### Task 7: delete_tag を冪等化

**Files:**
- Modify: `src/actions/delete_tag.js`

- [ ] **Step 1: delete_tag.js の現状を確認して冪等化**

既存の delete_tag.js を読み、idempotentDelete を適用する。パターンは create_tag と同様:

```js
// src/actions/delete_tag.js — 冪等化対応版
import { PAGES, navigateTo } from "./helpers.js";
import { idempotentDelete } from "../idempotent.js";

export async function deleteTag(page, params, logger) {
  const { name, _manifest } = params;
  logger.info("delete_tag", `タグ削除: ${name}`);

  const result = await idempotentDelete({
    page,
    logger,
    name,
    listUrl: PAGES.tag,
    manifest: _manifest,
    deleteFn: async () => {
      await navigateTo(page, PAGES.tag, logger);

      // タグ名でチェックボックスを選択
      await page.evaluate((tagName) => {
        [...document.querySelectorAll("tr")].forEach((row) => {
          if (row.textContent.includes(tagName)) {
            const label = row.querySelector("label.tw-flex");
            const cb = label?.querySelector('input[type="checkbox"]');
            if (cb && !cb.checked) label.click();
          }
        });
      }, name);
      await page.waitForTimeout(1000);

      // 「一括操作」→「削除」
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button, a")].find(
          (b) => b.textContent.includes("一括操作") && b.offsetParent !== null
        );
        if (btn) btn.click();
      });
      await page.waitForTimeout(1000);

      await page.evaluate(() => {
        const del = [...document.querySelectorAll("a, button, li, div")].find(
          (i) => i.textContent.trim() === "削除"
        );
        if (del) del.click();
      });
      await page.waitForTimeout(2000);

      // 確認ダイアログ
      await page.evaluate(() => {
        const btn = document.querySelector(".swal2-confirm");
        if (btn) btn.click();
      });
      await page.waitForTimeout(3000);
      await logger.screenshot(page, `tag_deleted_${name}`);
    },
  });

  if (result.status === "skipped") {
    logger.warn("delete_tag", `タグ「${name}」は存在しない（スキップ）`);
  } else if (result.status === "failed") {
    throw new Error(`タグ「${name}」削除失敗: ${result.reason}`);
  } else {
    logger.success("delete_tag", `タグ「${name}」削除＆検証完了`);
  }
}
```

- [ ] **Step 2: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/actions/delete_tag.js
git commit -m "feat: make delete_tag idempotent with pre/post-check"
```

---

### Task 8: create_friend_field / rename_friend_field を冪等化（優先度2）

**Files:**
- Modify: `src/actions/create_friend_field.js`
- Modify: `src/actions/rename_friend_field.js`

- [ ] **Step 1: create_friend_field.js に冪等化を適用**

idempotentCreate でラップする。listUrl は `PAGES.friend_info`（`/line/var`）。既存のフォーム入力ロジック（name, type, default_value, folder）はそのまま createFn 内に移動。

```js
// src/actions/create_friend_field.js 冒頭に追加:
import { idempotentCreate } from "../idempotent.js";
import { PAGES } from "./helpers.js";

// createFriendField 関数を idempotentCreate でラップ:
// - listUrl: PAGES.friend_info
// - resourceType: "friend_field"
// - createFn: 既存の /line/var/new への遷移→フォーム入力→登録ボタンの処理
// - 最後に result.status で分岐（skipped / failed / success）
```

具体的な実装は create_tag と同パターン。createFn の中身は既存の L24-L87 をそのまま使う。

- [ ] **Step 2: rename_friend_field.js に冪等化を適用**

編集系は「変更前の値が期待通りか確認→変更→変更後の値を確認」の流れ。idempotentCreate は使わず、独自の pre-check / post-check を入れる。

- [ ] **Step 3: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/actions/create_friend_field.js src/actions/rename_friend_field.js
git commit -m "feat: make friend_field actions idempotent"
```

---

### Task 9: create_template を冪等化（優先度3）

**Files:**
- Modify: `src/actions/create_template.js`

- [ ] **Step 1: create_template.js に冪等化を適用**

idempotentCreate でラップ。listUrl は `PAGES.template`（`/line/template`）。既存のテンプレート作成ロジック（URL遷移→名前入力→フォルダ→メッセージ→保存）はそのまま createFn に移動。

```js
// src/actions/create_template.js 冒頭に追加:
import { idempotentCreate } from "../idempotent.js";
import { PAGES } from "./helpers.js";

// createTemplate 関数を idempotentCreate でラップ:
// - listUrl: PAGES.template
// - resourceType: "template"
// - createFn: 既存の L30-L112 をそのまま使う
// - result.status で分岐
```

- [ ] **Step 2: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/actions/create_template.js
git commit -m "feat: make create_template idempotent"
```

---

### Task 10: create_scenario / add_to_scenario を冪等化（優先度4）

**Files:**
- Modify: `src/actions/create_scenario.js`
- Modify: `src/actions/add_to_scenario.js`

- [ ] **Step 1: create_scenario.js に冪等化を適用**

idempotentCreate でラップ。listUrl は `PAGES.scenario`（`/line/content/group`）。

- [ ] **Step 2: add_to_scenario.js の現状確認と改善**

add_to_scenario はスキルに「headless でサイレント失敗する」と記載あり。冪等化に加えて、テンプレート追加後にシナリオ内のコンテンツ一覧を確認する post-check を追加。

- [ ] **Step 3: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/actions/create_scenario.js src/actions/add_to_scenario.js
git commit -m "feat: make scenario actions idempotent"
```

---

### Task 11: dry-run モード

**Files:**
- Create: `src/dry-run.js`
- Modify: `src/auto_run.js`

- [ ] **Step 1: src/dry-run.js を作成**

```js
// src/dry-run.js — YAML ワークフローを解析して変更サマリーを出力
import fs from "fs";
import path from "path";
import { parse } from "yaml";

const DANGEROUS_ACTIONS = new Set([
  "delete_tag", "delete_template", "delete_scenario",
]);
const CREATE_ACTIONS = new Set([
  "create_tag", "create_template", "create_scenario",
  "create_friend_field", "create_pack", "create_carousel",
  "create_auto_reply", "create_action", "create_conversion",
  "create_funnel", "create_cross_analysis",
]);
const EDIT_ACTIONS = new Set([
  "edit_scenario_message", "edit_auto_reply_action",
  "rename_friend_field", "set_action", "set_scenario_filter",
  "add_to_scenario", "copy_template",
]);

export function dryRun(workflowPath) {
  const raw = fs.readFileSync(workflowPath, "utf-8");
  const workflow = parse(raw);

  const summary = {
    workflow: workflow.name || path.basename(workflowPath),
    totalSteps: workflow.steps.length,
    create: [],
    edit: [],
    delete: [],
    other: [],
    hasTestData: false,
    hasProdData: false,
    dangerousCount: 0,
  };

  for (const step of workflow.steps) {
    const name = step.params?.name || step.name || step.action;
    const isTest = name.includes("[TEST]");

    if (isTest) summary.hasTestData = true;
    else summary.hasProdData = true;

    const entry = {
      action: step.action,
      name,
      isTest,
      continue_on_error: !!step.continue_on_error,
    };

    if (CREATE_ACTIONS.has(step.action)) {
      summary.create.push(entry);
    } else if (EDIT_ACTIONS.has(step.action)) {
      summary.edit.push(entry);
    } else if (DANGEROUS_ACTIONS.has(step.action)) {
      summary.delete.push(entry);
      summary.dangerousCount++;
    } else {
      summary.other.push(entry);
    }
  }

  return summary;
}

export function formatDryRun(summary) {
  const lines = [];
  lines.push(`\n📋 dry-run: ${summary.workflow}`);
  lines.push(`   ステップ数: ${summary.totalSteps}`);
  lines.push(`   create: ${summary.create.length}件`);
  lines.push(`   edit:   ${summary.edit.length}件`);
  lines.push(`   delete: ${summary.delete.length}件`);
  if (summary.dangerousCount > 0) {
    lines.push(`   ⚠️  危険操作: ${summary.dangerousCount}件`);
  }
  if (summary.hasProdData) {
    lines.push(`   ⚠️  本番データへの操作を含みます`);
  }
  lines.push("");

  const printEntries = (label, entries) => {
    if (entries.length === 0) return;
    lines.push(`   ${label}:`);
    entries.forEach((e) => {
      const tag = e.isTest ? "[TEST]" : "[PROD]";
      lines.push(`     ${tag} ${e.action}: ${e.name}`);
    });
  };

  printEntries("作成", summary.create);
  printEntries("編集", summary.edit);
  printEntries("削除", summary.delete);
  printEntries("その他", summary.other);

  return lines.join("\n");
}
```

- [ ] **Step 2: auto_run.js に --dry-run フラグを追加**

```js
// auto_run.js の main() 冒頭に追加:
if (process.argv.includes("--dry-run")) {
  const { dryRun, formatDryRun } = await import("./dry-run.js");
  const summary = dryRun(workflowPath);
  console.log(formatDryRun(summary));

  // diff-summary.json として保存
  const outDir = path.join(projectRoot, "runs", `dryrun-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "diff-summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\n📄 diff-summary: ${outDir}/diff-summary.json`);
  process.exit(0);
}
```

- [ ] **Step 3: 動作確認**

Run: `cd /Users/kimuratakuya/lstep-automation && node src/auto_run.js workflows/audit/test-create-tag.yaml --dry-run`

Expected: create 1件、delete 1件、[TEST] データと表示される。ブラウザは起動しない。

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/dry-run.js src/auto_run.js
git commit -m "feat: add dry-run mode with diff summary"
```

---

### Task 12: 棚卸しスクリプト

**Files:**
- Create: `src/audit.js`
- Create: `workflows/audit/` 内にアクション別テスト YAML

- [ ] **Step 1: src/audit.js を作成**

```js
// src/audit.js — 全アクション棚卸しスクリプト
//
// 使い方: node src/audit.js [--action create_tag] [--headless]
//
// 全アクション or 指定アクションのテスト YAML を実行し、
// 結果を audit-result.json にまとめる

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse, stringify } from "yaml";
import { listActions } from "./actions/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const auditDir = path.join(projectRoot, "workflows", "audit");

// テスト YAML テンプレート
const TEST_TEMPLATES = {
  create_tag: {
    name: "[AUDIT] create_tag",
    steps: [
      { action: "create_tag", params: { name: "[TEST][audit] テストタグ" }, continue_on_error: true },
      { action: "delete_tag", params: { name: "[TEST][audit] テストタグ" }, continue_on_error: true },
    ],
  },
  create_friend_field: {
    name: "[AUDIT] create_friend_field",
    steps: [
      { action: "create_friend_field", params: { name: "[TEST][audit] テスト情報欄" }, continue_on_error: true },
    ],
  },
  create_template: {
    name: "[AUDIT] create_template",
    steps: [
      {
        action: "create_template",
        params: {
          type: "standard",
          name: "[TEST][audit] テストテンプレ",
          messages: [{ kind: "text", content: "テスト本文" }],
        },
        continue_on_error: true,
      },
      { action: "delete_template", params: { name: "[TEST][audit] テストテンプレ" }, continue_on_error: true },
    ],
  },
  create_scenario: {
    name: "[AUDIT] create_scenario",
    steps: [
      { action: "create_scenario", params: { name: "[TEST][audit] テストシナリオ" }, continue_on_error: true },
      { action: "delete_scenario", params: { name: "[TEST][audit] テストシナリオ" }, continue_on_error: true },
    ],
  },
  navigate: {
    name: "[AUDIT] navigate",
    steps: [
      { action: "navigate", params: { url: "https://manager.linestep.net/line/tag" }, continue_on_error: true },
    ],
  },
};

function generateAuditYaml(actionName) {
  if (TEST_TEMPLATES[actionName]) {
    return TEST_TEMPLATES[actionName];
  }
  // テンプレートがないアクションは navigate + 画面確認だけ
  return {
    name: `[AUDIT] ${actionName} (stub)`,
    steps: [
      { action: "navigate", params: { url: "https://manager.linestep.net/" }, continue_on_error: true },
    ],
    _stub: true,
  };
}

async function main() {
  const targetAction = process.argv.find((a) => a.startsWith("--action="))?.split("=")[1];
  const actions = targetAction ? [targetAction] : listActions();

  fs.mkdirSync(auditDir, { recursive: true });

  const auditResult = {};
  for (const action of actions) {
    const workflow = generateAuditYaml(action);
    const yamlPath = path.join(auditDir, `audit-${action}.yaml`);
    fs.writeFileSync(yamlPath, stringify(workflow));

    if (workflow._stub) {
      auditResult[action] = { status: "untested", reason: "no test template" };
      continue;
    }

    auditResult[action] = { status: "pending", yamlPath };
  }

  // 結果を保存
  const resultPath = path.join(projectRoot, "audit-result.json");
  fs.writeFileSync(resultPath, JSON.stringify(auditResult, null, 2));
  console.log(`\n📋 棚卸し YAML 生成完了: ${auditDir}/`);
  console.log(`📄 棚卸し結果: ${resultPath}`);
  console.log(`\n各アクションのテスト実行:`);
  console.log(`  node src/auto_run.js workflows/audit/audit-create_tag.yaml`);
  console.log(`\n全アクション一括実行は audit-runner（別タスク）で対応`);
}

main();
```

- [ ] **Step 2: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/audit.js
git commit -m "feat: add audit script for action inventory"
```

---

### Task 13: runs/ ディレクトリ構造の整備

**Files:**
- Modify: `src/auto_run.js`

- [ ] **Step 1: ログ出力先を logs/ から runs/ に変更**

```js
// auto_run.js の logsDir を変更:
// 変更前:
const logsDir = path.join(projectRoot, "logs");
// 変更後:
const logsDir = path.join(projectRoot, "runs");
```

- [ ] **Step 2: screenshots/ サブディレクトリに整理**

Logger のスクリーンショット保存先を `screenshots/` サブディレクトリに変更:

```js
// logger.js の constructor に追加:
this.screenshotsDir = path.join(this.runDir, "screenshots");
fs.mkdirSync(this.screenshotsDir, { recursive: true });

// screenshot() と errorScreenshot() のパスを変更:
// path.join(this.runDir, filename) → path.join(this.screenshotsDir, filename)
```

- [ ] **Step 3: .gitignore に runs/ を追加**

```bash
echo "runs/" >> /Users/kimuratakuya/lstep-automation/.gitignore
```

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/auto_run.js src/logger.js .gitignore
git commit -m "refactor: reorganize output to runs/ with screenshots/ subdir"
```

---

### Task 14: auto_run.js に manifest 統合

**Files:**
- Modify: `src/auto_run.js`

- [ ] **Step 1: ResourceManifest を auto_run.js に統合**

```js
// auto_run.js の import に追加:
import { ResourceManifest } from "./manifest.js";

// main() 内、logger 初期化後に追加:
const manifest = new ResourceManifest(logger.runDir);

// 前回 run の残留データチェック:
const runsDir = path.join(projectRoot, "runs");
const previousPending = ResourceManifest.loadPrevious(runsDir);
if (previousPending) {
  logger.warn("runner", `前回 run (${previousPending.dir}) に未 cleanup のリソースが ${previousPending.pending.length} 件あります`);
  previousPending.pending.forEach(r => {
    logger.warn("runner", `  未cleanup: [${r.type}] ${r.name}`);
  });
}

// 各ステップ実行時に params._manifest = manifest を注入:
// step.params = { ...step.params, _manifest: manifest };
```

- [ ] **Step 2: コミット**

```bash
cd /Users/kimuratakuya/lstep-automation
git add src/auto_run.js
git commit -m "feat: integrate resource manifest into auto_run.js"
```

---

### Task 15: スキルファイル更新

**Files:**
- Modify: `/Users/kimuratakuya/.claude/skills/lstep-automation/skill.md`

- [ ] **Step 1: スキルにアクション動作ステータスセクションを追加**

棚卸し結果に基づいて、各アクションの status を記載するセクションを追加:

```markdown
## アクション動作ステータス（YYYY-MM-DD 時点）

| アクション | status | 冪等化 | 備考 |
|-----------|--------|--------|------|
| create_tag | verified | 済 | pre-check + post-check + reload 確認 |
| delete_tag | verified | 済 | 存在確認 → 削除 → 消失確認 |
| create_friend_field | verified | 済 | /line/var/new へ直接遷移 |
| rename_friend_field | verified | 済 | |
| create_template | verified | 済 | |
| create_scenario | verified | 済 | |
| ... | untested | 未 | |
```

- [ ] **Step 2: YAML テンプレートセクションを追加**

```markdown
## YAML テンプレート（コピペ用）

### タグ一括作成
\`\`\`yaml
name: タグ一括作成
steps:
  - action: create_tag
    params:
      name: "タグ名"
\`\`\`
```

- [ ] **Step 3: 認証セクションを storageState に更新**

既存の Cookie 認証パターンを storageState ベースに書き換え。

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/.claude/skills/lstep-automation
git add skill.md
git commit -m "docs: update lstep-automation skill with action status and templates"
```

---

### Task 16: 結合テスト

**Files:** なし（テスト実行のみ）

- [ ] **Step 1: Cookie / storageState の確認**

Run: `ls -la /Users/kimuratakuya/lstep-automation/lstep-cookies.json /Users/kimuratakuya/lstep-automation/lstep-storage-state.json 2>/dev/null`

storageState がなければ cookies.json からフォールバックされることを確認。

- [ ] **Step 2: dry-run テスト**

Run: `cd /Users/kimuratakuya/lstep-automation && node src/auto_run.js workflows/audit/test-create-tag.yaml --dry-run`

Expected: ブラウザを起動せず diff summary が表示される。

- [ ] **Step 3: 冪等タグ作成テスト**

Run: `cd /Users/kimuratakuya/lstep-automation && LSTEP_HEADLESS=true node src/auto_run.js workflows/audit/test-create-tag.yaml`

Expected:
1. storageState or cookies で認証
2. pre-check → 「[TEST][audit001] テストタグ」が存在しないことを確認
3. execute → タグ作成
4. post-check → 一覧に存在確認
5. reload 確認 → 再読込後も存在
6. delete → タグ削除 → 消失確認
7. runs/ 配下に trace.zip, console.jsonl, network-failures.json, screenshots/ が保存

- [ ] **Step 4: 2回目実行（冪等性テスト）**

1回目で削除が成功した場合、再実行で create → success, delete → success が再現するか確認。
1回目で削除が失敗した場合、再実行で create → skipped（既に存在）が表示されるか確認。

- [ ] **Step 5: 棚卸しスクリプト実行**

Run: `cd /Users/kimuratakuya/lstep-automation && node src/audit.js`

Expected: `workflows/audit/` に各アクションのテスト YAML が生成され、`audit-result.json` が作成される。
