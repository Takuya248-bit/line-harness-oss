# ig-auto-poster 夜間自動生成パイプライン 設計書

作成日: 2026-04-04

## 概要

Windowsマシン（24時間稼働）をマスターとして、寝ている間にInstagramフィード・リール素材を大量生成し、朝にスマホブラウザで採用/非採用を選ぶ運用を実現する。Macは不要。

---

## 前提・環境

| 項目 | 内容 |
|------|------|
| Windows GPU | RTX 4060 (VRAM 8GB) |
| ComfyUI | localhost:8188（稼働中） |
| LLM | Ollama + Gemma 4（要インストール） |
| ネタ元DB | Cloudflare D1 + Notion |
| 既存システム | ig-auto-poster（拡張対象） |
| 確認UI | Cloudflare Pages（スマホ対応） |

---

## アーキテクチャ

```
[Windows Task Scheduler] 毎夜 23:00 起動
│
├─ Step 1: ネタ取得
│   ├─ Cloudflare D1 REST API からネタ候補取得
│   └─ Notion API からネタ候補取得
│   → 候補リストをローカルJSONに展開
│
├─ Step 2: パターン生成マトリクス
│   フォーマット(4) × ビジュアル(4) × ターゲット(3) = 48パターン
│   → ネタ × パターンの組み合わせを生成キューに積む
│
├─ Step 3: Ollama（Gemma 4）でテキスト生成 ※VRAM先行使用
│   └─ 各パターンに対して生成:
│       - キャプション
│       - 台本（リール用）
│       - ハッシュタグ
│       - 画像生成用プロンプト（ComfyUI向け）
│       - 動画生成用プロンプト（ComfyUI向け）
│
├─ Step 4: ComfyUI で画像・動画生成 ※テキスト完了後にVRAM引き継ぎ
│   ├─ フィード画像: 推定500〜900枚/夜
│   └─ リール動画（5〜15秒）: 推定60〜160本/夜
│
└─ Step 5: D1に保存
    status: pending
    payload: 画像/動画パス、キャプション、ハッシュタグ、パターンID

[朝] スマホブラウザ → Cloudflare Pages 確認UI
├─ 採用 → ig-auto-posterの投稿キューへ（status: approved）
├─ 非採用 → status: rejected（学習データとして保存）
└─ 保留 → status: pending のまま翌日以降

[週次学習ループ]
採用パターン集計 → 高スコアパターンの出現頻度を重みづけ
→ 次回生成時のパターン抽選確率を更新
→ Ollamaプロンプトテンプレートに成功事例を追記（RAG的参照）
```

---

## 生成パターンマトリクス

### フォーマット（4種）
- 教育系（Tips・How-to・数字で学ぶ）
- 感情系（共感・ストーリー・ビフォーアフター）
- 数字系（〇〇選・ランキング・統計）
- 日常系（Vlog風・舞台裏・リアル体験）

### ビジュアルスタイル（4種）
- 明るい・カラフル（旅行・バリ観光向け）
- シック・ミニマル（学習・スキル訴求向け）
- 手書き・温かみ（体験談・感情系向け）
- 映像的・ドラマチック（リール向け）

### ターゲット（3種）
- バリ留学検討者
- 英語学習者
- バリ旅行者

---

## コンポーネント詳細

### 1. ネタ取得モジュール（`batch/fetch-topics.ts`）
- D1 REST APIを叩いてネタ候補を取得
- Notion APIでネタ候補を取得
- 重複排除してローカルJSONに保存

### 2. パターン抽選モジュール（`batch/pattern-selector.ts`）
- 48パターンを学習重みに従って抽選
- ネタ × パターンの生成キューを作成
- 初期は均等確率、週次更新で重みが変わる

### 3. テキスト生成モジュール（`batch/text-generator.ts`）
- Ollama REST API（localhost:11434）を叩く
- プロンプトテンプレートは `batch/templates/` に管理
- 出力: caption, script, hashtags, image_prompt, video_prompt

### 4. ComfyUI生成モジュール（`batch/comfyui-generator.ts`）
- ComfyUI API（localhost:8188）にワークフローをPOST
- フィード用ワークフローとリール用ワークフローを切り替え
- 生成完了をポーリングして画像/動画パスを取得

### 5. D1保存モジュール（`batch/save-results.ts`）
- 生成物メタデータをD1のgenerated_contentテーブルに保存
- 画像/動画ファイルはR2またはWindowsローカルパスで管理

### 6. 確認UI（Cloudflare Pages）
- `/review` : pending一覧をカード表示
- 採用/非採用/保留ボタン → D1のstatusを更新
- スマホブラウザ対応（タップ操作）

### 7. 学習ループ（`batch/weekly-learn.ts`）
- 週次でapproved/rejectedの集計
- パターンIDごとの採用率を計算
- `batch/weights.json` を更新（次回抽選に反映）
- 採用率上位のキャプション例をプロンプトテンプレに追記

---

## D1テーブル設計（追加）

```sql
CREATE TABLE generated_content (
  id TEXT PRIMARY KEY,
  topic_id TEXT,
  pattern_id TEXT,           -- format_visual_target の組み合わせID
  content_type TEXT,         -- 'feed' | 'reel'
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'posted'
  caption TEXT,
  hashtags TEXT,
  script TEXT,
  image_path TEXT,
  video_path TEXT,
  created_at INTEGER,
  reviewed_at INTEGER,
  posted_at INTEGER
);

CREATE TABLE pattern_weights (
  pattern_id TEXT PRIMARY KEY,
  approved_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  weight REAL DEFAULT 1.0,
  updated_at INTEGER
);
```

---

## VRAMスケジューリング

```
23:00 - 01:00  Ollama（Gemma 4）テキスト生成
               ※ComfyUI停止中
01:00 - 07:00  ComfyUI 画像・動画生成
               ※Ollama停止中
07:00          生成完了 → D1保存 → 通知
```

---

## 実装ロードマップ

### Phase 1: 基盤構築（まず動かす）
1. Windowsに Ollama インストール + Gemma 4 モデル取得
2. D1に `generated_content` / `pattern_weights` テーブル追加
3. ネタ取得モジュール実装（D1 + Notion）
4. テキスト生成モジュール実装（Ollama API）
5. ComfyUI生成モジュール実装（フィード画像のみ）
6. Windows Task Scheduler でCronセットアップ
7. D1保存モジュール実装

### Phase 2: 確認UIと多様化
1. Cloudflare Pages に確認UI構築（pending一覧 + 採用/非採用ボタン）
2. パターン抽選モジュール実装（48パターン均等確率）
3. ig-auto-posterの投稿キューとの連携
4. リール動画生成をComfyUIに追加

### Phase 3: 学習ループ
1. 週次集計スクリプト実装
2. pattern_weights 更新ロジック
3. プロンプトテンプレートへの成功事例追記（RAG的参照）
4. 採用率ダッシュボード（確認UIに統合）

---

## 決定事項

- 生成画像/動画の保存先: Cloudflare R2（WindowsからアップロードしてPagesから直接表示）
- 確認UIの認証: Cloudflare Access（Googleアカウント認証、無料枠）
- ComfyUIのバリ風動画生成ワークフロー: Phase 1完了後にモデル確認して選定
