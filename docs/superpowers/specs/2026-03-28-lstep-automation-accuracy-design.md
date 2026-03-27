# lstep-automation 実行精度改善 設計書 v2.1

## 概要

Lステップの設定作業全般（タグ、テンプレート、シナリオ、リッチメニュー等）を Claude Code に自然言語で依頼して自動実行できるようにする。

ただし本プロジェクトの最優先は「自動実行できること」ではなく、誤成功・重複作成・誤更新を防いだうえで、再現性高く実行できることとする。元案の「棚卸し→修復→共通基盤」という順番は維持するが、全フェーズで以下を必須原則とする。

## 必須原則

1. 作成系は冪等に扱う（pre-check → execute → post-check → 再読込確認 → 詳細確認）
2. 成功判定は一覧確認だけで終えない（詳細画面まで開いて値を検証）
3. テストデータは run_id 単位で隔離する
4. 認証は cookies 単体ではなく storageState を基準にする
5. スクリーンショットだけでなく trace / console / network を残す
6. 自然言語からの即実行前に dry-run と diff 確認を挟む

## フェーズ1: 棚卸し

### 分類基準

- OK: headless で実行 → 成功判定パス（実際に Lステップに反映される）
- NG: 実行はされるがサイレント失敗 or セレクターエラー
- 未実装: スキルに知見はあるがスクリプトが存在しない

### 棚卸し手順

1. `lstep-automation/src/actions/` の全アクションファイルをリストアップ
2. 各アクションに対してテスト用 YAML を自動生成（テスト用ダミーデータで実行）
3. storageState で認証状態を復元し、ログイン済み判定を実行。未ログインなら即 AUTH_FAILURE とする
4. 各アクションを1つずつ実行し、以下を保存:
   - trace.zip（Playwright Trace Viewer 用）
   - log.jsonl
   - console.jsonl
   - network-failures.json
   - before / after / error スクリーンショット
   - DOM snapshot / diagnosis.json
5. 結果を `audit-result.json` にまとめる
6. cleanup 失敗時は `quarantine.json` に残し、次回開始前に先に検出する

### テストデータの扱い

すべてのテストデータ名に `[TEST][run_id]` を付与する。同名データを再作成しない。

- 作成系: `[TEST][run_id][action]` プレフィックス付きで作成
- 編集系: `[TEST][run_id]` 専用コピーに対してのみ実行
- 削除系: `[TEST][run_id]` データに対してのみ実行
- 本番データへの直接編集は禁止
- 作成したオブジェクトの ID を `resource-manifest.json` に記録し、cleanup 時に照合する

### 成功判定の統一基準

#### 作成系
- 作成後に一覧画面で対象が存在するか DOM 確認
- 詳細画面を開いて入力値が反映されているか検証
- 一覧再読込後も存在するか確認

#### 編集系
- 編集後に詳細画面で値が反映されているか検証
- 一覧画面で変更が表示されるか確認

#### 削除系
- 削除後に一覧画面から消えているか DOM 確認
- 検索しても対象がヒットしないことを確認

#### 共通条件
- エラーダイアログ不在
- console error / pageerror が致命的でない
- 失敗した request が閾値以下
- 最終的な URL / 画面コンテキストが想定どおり

## フェーズ2: 修復・共通基盤

### 修復の優先順位

1. タグ作成 / 削除（シナリオ分岐の前提）
2. 友だち情報欄作成 / リネーム（データ管理の前提）
3. テンプレート作成 / 編集（配信の中身）
4. シナリオ作成 / メッセージ追加（ステップ配信の本体）
5. リッチメニュー作成（ユーザー導線）
6. 自動応答 / アクション設定（自動化ロジック）
7. コンバージョン / ファネル / クロス分析（計測系）

### 共通基盤の導入ルール

#### 1. 冪等化

作成系では、いきなり create を打たない。必ず以下の順で実行する:

```
pre-check（既存確認）→ execute → post-check → 再読込確認 → 詳細確認
```

post-check が曖昧なら、再試行ではなく存在確認を先に行う。

#### 2. リトライ方針

- 作成系: 同じ create をそのまま再送しない。失敗時は再読込 → 存在確認 → 未作成なら再実行
- 編集系: 失敗時は現在値を取得 → 差分があれば再実行
- 削除系: 失敗時は存在確認 → まだ存在すれば再実行
- 共通: 最大3回、段階的待機（10s → 30s → 60s）

#### 3. SPA 状態リセット

各アクション開始時にナビゲーションリセットを必ず挟む。

#### 4. 固定 waitForTimeout の置き換え

```
waitForTimeout(3000)
  ↓
waitForSelector() / waitForURL() / waitForResponse() のいずれか適切なもの
  + タイムアウト上限 10秒
  + フォールバックとして固定待機を残す
```

#### 5. スクリーンショット証跡

アクション実行前・実行後・エラー時の3点を自動保存。

### 修復済みアクションの管理

各アクションファイルの先頭にメタデータコメント:

```js
// @status: verified  (verified / broken / untested)
// @last-tested: 2026-03-28
// @success-check: DOM検証 + 詳細画面確認
```

### 認証基盤

- `~/lstep-automation/lstep-storage-state.json` に storageState を保存する
- 各 run はその storageState を読み込んだ新規 context で開始する
- 実行冒頭でログイン済み判定を行い、未ログインなら即 AUTH_FAILURE とする
- auth 失敗は個別 action failure と混同しない

## フェーズ3: 実行インターフェース

### Claude Code からの呼び出しフロー

```
ユーザー: 自然言語で依頼
  ↓
Claude Code: YAML ワークフローを生成
  ↓
dry-run を実行（実際の操作はしない）
  ↓
変更対象の diff を表示:
  - create / edit / delete 件数
  - 変更対象名一覧
  - [TEST] データか本番データか
  ↓
ユーザー確認（危険操作は件数を明示）
  ↓
実行
  ↓
結果・証跡・失敗分類を保存
```

### lstep-automation スキルの役割強化

現在の「知見の蓄積」に加えて:

- 各アクションの動作ステータス（verified / broken / untested）
- アクション呼び出し時の YAML テンプレート
- 既知の罠と回避策（修復時に発見したものを随時追記）

Claude Code が「何ができて何ができないか」をスキルを読むだけで判断できる状態にする。

### エラー時のフロー

```
アクション失敗
  ↓ 冪等リトライ（作成系は存在確認→未作成なら再実行）
  ↓ 最大3回、段階的待機
  ↓ それでも失敗
  ↓ diagnosePage() で DOM 状態をキャプチャ
  ↓ trace.zip + スクリーンショット + diagnosis.json を保存
  ↓ Claude Code が診断結果を読んで原因判断
  ↓ セレクター修正 or UI 変更への対応 → 再実行
```

### 実行結果の保存先

```
lstep-automation/
  runs/
    YYYY-MM-DD-HHMMSS/
      workflow.yaml
      diff-summary.json
      log.jsonl
      console.jsonl
      network-failures.json
      diagnosis.json
      resource-manifest.json
      quarantine.json
      audit-result.json
      traces/
        trace.zip
      screenshots/
        before.png
        after.png
        error.png
```

## スコープ

### やること

1. 棚卸し: 全アクションの動作確認 → OK / NG / 未実装に分類
2. 修復: 優先順位順に NG アクションを修復、共通基盤を段階的に導入
3. 共通基盤整備: 冪等化、storageState 認証、trace 収集、dry-run
4. スキル / マニフェスト整備: 動作ステータスと YAML テンプレートをスキルに反映

### やらないこと

- auto_run.js の全面書き直し（動く部分はそのまま使う）
- YAML スキーマの全面再設計（既存構文を維持）
- Lステップ → LINE Harness 移行（別プロジェクト）
- 新規アクション大量追加（既存の修復が先）

## 成功基準

### 最低成功基準

- 棚卸し完了: 全アクションに status が付いている
- 優先度 1-4 が headless で通る
- 自然言語 → YAML → dry-run → 実行 → 結果保存のフローが通る

### 品質成功基準

- create / edit / delete それぞれで10回連続実行して誤成功・重複作成・誤削除がゼロ
- 全 run で trace.zip が保存され、Trace Viewer で追跡可能

## 前提条件

- lstep-storage-state.json が有効（セッション切れ時はユーザーが login_save.mjs 実行）
- Lステップの管理画面 UI が大きく変わらない（変わった場合はセレクター修正）
