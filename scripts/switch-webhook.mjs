#!/usr/bin/env node
// LINE Webhook URL 安全切替スクリプト
// Usage:
//   node scripts/switch-webhook.mjs --token $TOKEN --new-url https://...
//   node scripts/switch-webhook.mjs --token $TOKEN --new-url https://... --dry-run
//   node scripts/switch-webhook.mjs --token $TOKEN --rollback
//   --yes フラグで確認プロンプトを省略

import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const LINE_API = "https://api.line.me/v2/bot/channel/webhook";
const BACKUP_DIR = join(homedir(), ".secretary", "inbox");

// --- Arg parsing ---
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
const hasFlag = (name) => args.includes(name);

const token = getArg("--token");
const newUrl = getArg("--new-url");
const dryRun = hasFlag("--dry-run");
const rollback = hasFlag("--rollback");
const skipConfirm = hasFlag("--yes");

if (!token) {
  console.error("[ERROR] --token は必須です");
  process.exit(1);
}
if (!newUrl && !rollback) {
  console.error("[ERROR] --new-url または --rollback を指定してください");
  process.exit(1);
}

// --- Helpers ---
function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function confirm(message) {
  if (skipConfirm) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

async function apiGet() {
  const res = await fetch(`${LINE_API}/endpoint`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET endpoint failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiPut(endpoint) {
  const res = await fetch(`${LINE_API}/endpoint`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error(`PUT endpoint failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiTest() {
  const res = await fetch(`${LINE_API}/test`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`POST test failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function saveBackup(data) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(BACKUP_DIR, `webhook-backup-${date}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  log(`バックアップ保存: ${file}`);
  return file;
}

function loadLatestBackup() {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("webhook-backup-") && f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length === 0) throw new Error("バックアップが見つかりません");
    const file = join(BACKUP_DIR, files[0]);
    const data = JSON.parse(readFileSync(file, "utf-8"));
    log(`最新バックアップ読込: ${file}`);
    return data;
  } catch (e) {
    throw new Error(`バックアップ読込失敗: ${e.message}`);
  }
}

// --- Main ---
async function main() {
  try {
    // 1. 現在のURL取得
    log("現在のWebhook URL取得中...");
    const current = await apiGet();
    const currentUrl = current.endpoint;
    log(`現在のURL: ${currentUrl}`);
    log(`アクティブ: ${current.active}`);

    // バックアップ保存
    saveBackup({ endpoint: currentUrl, active: current.active, savedAt: new Date().toISOString() });

    // --- ロールバックモード ---
    if (rollback) {
      const backup = loadLatestBackup();
      log(`ロールバック先: ${backup.endpoint}`);
      const ok = await confirm("ロールバックを実行しますか？");
      if (!ok) { log("キャンセルしました"); return; }

      log("ロールバック実行中...");
      await apiPut(backup.endpoint);
      log("ロールバック完了");

      log("テストWebhook送信中...");
      const test = await apiTest();
      log(`テスト結果: success=${test.success}, status=${test.statusCode}`);
      return;
    }

    // --- ドライランモード ---
    if (dryRun) {
      log("--- ドライラン ---");
      log(`切替先: ${newUrl}`);
      log(`ロールバック先: ${currentUrl}`);
      log("実際の切替は行いません");
      return;
    }

    // --- 切替実行 ---
    log(`切替先: ${newUrl}`);
    const ok = await confirm("Webhook URLを切り替えますか？");
    if (!ok) { log("キャンセルしました"); return; }

    log("Webhook URL切替中...");
    await apiPut(newUrl);
    log("URL切替完了");

    // テスト送信
    log("テストWebhook送信中...");
    const test = await apiTest();
    log(`テスト結果: success=${test.success}, status=${test.statusCode}`);

    if (!test.success) {
      // 自動ロールバック
      log("[WARN] テスト失敗 - 自動ロールバック開始");
      await apiPut(currentUrl);
      log("ロールバック完了 - 元のURLに復元しました");

      // エラーレポート出力
      const report = {
        error: "テストWebhook失敗",
        newUrl,
        rollbackTo: currentUrl,
        testResult: test,
        timestamp: new Date().toISOString(),
      };
      const reportFile = join(BACKUP_DIR, `webhook-error-${new Date().toISOString().slice(0, 10)}.json`);
      writeFileSync(reportFile, JSON.stringify(report, null, 2));
      log(`エラーレポート: ${reportFile}`);
      process.exit(1);
    }

    log("切替完了 - 新しいWebhook URLが正常に動作しています");
  } catch (e) {
    log(`[ERROR] ${e.message}`);
    process.exit(1);
  }
}

main();
