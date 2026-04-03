# nightbatch（Windows セットアップ）

Instagram 自動投稿用のナイトバッチ。ローカルで Ollama（テキスト・レビュー）と ComfyUI（画像・動画）を叩き、Cloudflare D1 / R2・Notion と連携します。

---

## 前提

- Windows 10 / 11
- [Node.js](https://nodejs.org/) 20 以上（`--env-file` に必須）
- [pnpm](https://pnpm.io/) 9 以上（推奨。`batch` 直下でビルドする場合）
- 同一マシンで常時起動: Ollama、ComfyUI（本番スケジュール実行時）

---

## 1. Ollama のインストール

1. [Ollama Windows](https://ollama.com/download/windows) からインストールし、インストーラの指示に従う。
2. モデルを取得する（推奨）:

   ```powershell
   ollama pull gemma3:12b
   ```

3. 既定では `OLLAMA_MODEL` は `gemma3:12b`（`main.ts` のデフォルトと一致）。別モデルを使う場合のみ `.env` で上書きする。

注意:

- `gemma3:12b` を推奨する。12B クラスでもVRAM・RAMをある程度使う。
- `gemma3:27b` など大規模モデルは、一般向けWindows PCのVRAMでは常時運用しづらい。VRAM不足で読み込み失敗や極端な低速化になるため、この手順書の想定対象外（NG）とする。

---

## 2. 必須環境変数（`main.js` / 通常ナイトバッチ）

| 変数名 | 説明 |
|--------|------|
| `CF_ACCOUNT_ID` | Cloudflare アカウント ID |
| `CF_API_TOKEN` | D1 / R2 API 用トークン（必要な権限を付与） |
| `D1_DATABASE_ID` | 対象 D1 データベース ID |
| `NOTION_API_KEY` | Notion インテグレーションシークレット |
| `NOTION_DATABASE_ID` | トピック取得元の Notion データベース ID |

画像・動画を R2 に上げて完了まで行う場合、`R2_BUCKET_NAME` も実バケット名を設定すること（未設定のままだと R2 PUT が失敗する）。

---

## 3. 必須環境変数（`weekly-learn.js`）

週次学習ジョブは D1 のみ参照する。以下のみ必須。

| 変数名 | 説明 |
|--------|------|
| `CF_ACCOUNT_ID` | 同上 |
| `CF_API_TOKEN` | 同上 |
| `D1_DATABASE_ID` | 同上 |

---

## 4. 任意環境変数（両方共通で利用可能なもの）

| 変数名 | 既定値 | 説明 |
|--------|--------|------|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama API のベース URL |
| `OLLAMA_MODEL` | `gemma3:12b` | 利用モデル名（`ollama list` と一致） |
| `COMFYUI_BASE_URL` | `http://127.0.0.1:8188` | ComfyUI サーバー |
| `R2_BUCKET_NAME` | （空） | R2 バケット名。本番生成保存時は必須に近い |
| `NIGHTBATCH_TOPICS_PER_RUN` | `5` | 1 実行あたりのトピック数 |
| `NIGHTBATCH_PATTERNS_PER_TOPIC` | `3` | トピックあたりのパターン数 |

---

## 5. `.env` テンプレート

`ig-auto-poster/batch/nightbatch/.env` に保存することを想定（Git にコミットしない）。

```env
# Cloudflare（必須）
CF_ACCOUNT_ID=
CF_API_TOKEN=
D1_DATABASE_ID=
R2_BUCKET_NAME=

# Notion（main のみ必須）
NOTION_API_KEY=
NOTION_DATABASE_ID=

# Ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:12b

# ComfyUI
COMFYUI_BASE_URL=http://127.0.0.1:8188

# 任意
# NIGHTBATCH_TOPICS_PER_RUN=5
# NIGHTBATCH_PATTERNS_PER_TOPIC=3
```

---

## 6. ビルドと手動テスト

TypeScript の出力は `dist/nightbatch/` にあり、`main.js` は `../d1-rest.js` を参照するため、実行時のカレントディレクトリは `dist/nightbatch` にする。

`ig-auto-poster/batch` で:

```powershell
pnpm install
pnpm exec tsc -p nightbatch/tsconfig.json
```

手動実行（`.env` を `nightbatch` フォルダに置いた場合）:

```powershell
cd path\to\ig-auto-poster\batch\nightbatch\dist\nightbatch
node --env-file=..\..\.env main.js
```

同一フォルダに `.env` をコピーする運用なら、要件どおり次でも可:

```powershell
cd path\to\ig-auto-poster\batch\nightbatch\dist\nightbatch
node --env-file=.env main.js
```

週次学習の手動テスト:

```powershell
node --env-file=..\..\.env weekly-learn.js
```

開発時は `tsx` でソース直実行も可能（例: `batch` で `pnpm exec tsx nightbatch/main.ts`。`--env-file` は Node 20+ の `node` 経由が確実）。

---

## 7. Windows Task Scheduler（PowerShell）

パスは環境に合わせて置き換える。以下では例として `NIGHTBATCH_ROOT` を `nightbatch` フォルダの絶対パスとする。

```powershell
# 例: リポジトリを C:\dev\line-harness にクローンした場合
$NIGHTBATCH_ROOT = "C:\dev\line-harness\ig-auto-poster\batch\nightbatch"
$WORK = Join-Path $NIGHTBATCH_ROOT "dist\nightbatch"
$NODE = (Get-Command node.exe).Source
$ENVFILE = Join-Path $NIGHTBATCH_ROOT ".env"

# 毎日 23:00 — main.js（ナイトバッチ）
$actDaily = New-ScheduledTaskAction -Execute $NODE -Argument "--env-file=`"$ENVFILE`" `"$WORK\main.js`"" -WorkingDirectory $WORK
$trigDaily = New-ScheduledTaskTrigger -Daily -At "23:00"
Register-ScheduledTask -TaskName "IG-Nightbatch-Main" -Action $actDaily -Trigger $trigDaily -Description "IG nightbatch main.js"

# 毎週月曜 06:00 — weekly-learn.js
$actWeekly = New-ScheduledTaskAction -Execute $NODE -Argument "--env-file=`"$ENVFILE`" `"$WORK\weekly-learn.js`"" -WorkingDirectory $WORK
$trigWeekly = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "06:00"
Register-ScheduledTask -TaskName "IG-Nightbatch-WeeklyLearn" -Action $actWeekly -Trigger $trigWeekly -Description "IG nightbatch weekly-learn.js"
```

ノードのパスが通っていない PC では、`$NODE` を `C:\Program Files\nodejs\node.exe` などフルパスに変える。

タスク設定の補足:

- 条件で「AC 電源のみ」を外すと、ノート PC の夜間実行に有利なことがある。
- 失敗時ログはタスク スケジューラの履歴、またはスクリプト側でリダイレクトを追加して確認する。

---

## 8. ComfyUI の checkpoint 名

コード内で固定定数として参照している。ComfyUI の「CheckpointLoaderSimple」に渡すファイル名は、`ComfyUI` の `models/checkpoints` にある実ファイル名と一致させる必要がある。

- 変更場所: リポジトリ内 `comfyui-generator.ts` の `CHECKPOINT_NAME`（コメント: Windows 等で UI 表示名と実ファイル名が違う場合に合わせる）。
- 変更後は `pnpm exec tsc -p nightbatch/tsconfig.json` を `batch` で再実行し、`dist` を更新する。

---

## TODO（リポジトリ側の既知事項）

- `fetch-topics.ts`: D1 の `used_in_nightbatch` など未マイグレーション時はクエリが失敗しうる（該当 TODO コメント参照）。
