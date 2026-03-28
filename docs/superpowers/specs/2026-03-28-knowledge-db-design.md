# 知識DB設計仕様書

## 概要

コンテンツ生成（X投稿、IG投稿、SEO記事、CS返信）の品質を安定させるための共有知識データベース。
毎回のAPI調査コストを抑えつつ、一次情報（事実・観察・実例）の層を厚くする。

## 課題

- 生成モデルに渡す素材が薄く、ふわっとした投稿になる
- 似た情報が散在: `~/.secretary/knowledge/`（18ファイル）、`.company/cs/`（料金表）、各Workerのシステムプロンプト（直書き）
- リサーチAPIを毎回呼ぶとコストが膨らむ

## 方針

- "リサーチAPIの代わり"ではなく、"生成品質を安定させる中核"として構築
- 貯めるのは「事実・数字・観察・実例・禁止事項」。きれいな文章は貯めない
- 1エントリ = 1つの事実/観察（粒度を細かく）
- 手動追加より「日常タスクの副産物として自動蓄積」を主軸にする

## ストレージ

既存のCloudflare D1（LINE Harness本体の42テーブルと同じDB）にテーブル追加。
理由: IG/X/SEO全WorkerからSQLで直接アクセス可能。別DBを管理する必要なし。

## テーブル設計

### knowledge_entries（知識エントリ）

レイヤー1〜3を統合した1テーブル。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | 自動採番 |
| category | TEXT NOT NULL | 'bali_area', 'study_faq', 'barilingual', 'english_learning', 'evidence' |
| subcategory | TEXT | 'canggu', 'ubud', 'speaking', 'student_change' 等 |
| title | TEXT NOT NULL | 検索用の短いタイトル |
| content | TEXT NOT NULL | 事実・観察・比較・実例（文章ではなく素材） |
| tags | TEXT | カンマ区切り。生成時のフィルタ用 |
| source | TEXT | 'firsthand', 'student_feedback', 'observation', 'research', 'auto' |
| reliability | TEXT DEFAULT 'verified' | 'verified', 'anecdotal', 'unverified' |
| use_count | INTEGER DEFAULT 0 | 投稿生成で使用された回数（重複防止・人気度） |
| created_at | TEXT | datetime('now') |
| updated_at | TEXT | datetime('now') |

### content_guardrails（スタイル・ガードレール）

レイヤー4: 文体と禁止事項。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | 自動採番 |
| rule_type | TEXT NOT NULL | 'tone', 'prohibition', 'caution', 'expression' |
| platform | TEXT | 'x', 'ig', 'seo', 'line', 'all' |
| rule | TEXT NOT NULL | ルール内容 |
| example | TEXT | 良い例・悪い例 |
| priority | INTEGER DEFAULT 5 | 1-10。高いほど厳守 |

### theme_knowledge_map（テーマ-知識マッピング）

定番の組み合わせを定義。任意利用。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | 自動採番 |
| theme | TEXT NOT NULL | 'bali_cafe_study', 'first_week_change' 等 |
| knowledge_entry_id | INTEGER FK | knowledge_entries.id |
| relevance | INTEGER DEFAULT 5 | 1-10 |

## カテゴリ体系

### category 一覧

| category | 内容 | subcategory例 |
|----------|------|---------------|
| bali_area | バリ島エリア情報 | canggu, ubud, seminyak, kuta, kerobokan |
| study_faq | バリ留学FAQ | beginner_ok, one_week, dorm_life, making_friends |
| barilingual | バリリンガル固有情報 | mantooman, dorm, teachers, student_types, common_worries |
| english_learning | 英語学習ナレッジ | beginner_mistakes, speaking, aizuchi, paraphrase, natural_english |
| evidence | 実例・エピソード | first_3days, one_week_change, real_scene, outside_class |

### subcategory: bali_area の属性

各エリアについて以下の観点でエントリを作成:
- 生活感・雰囲気
- 向いてる人
- 学習向きか
- カフェ事情
- 移動事情

### source 値

| 値 | 意味 | reliability初期値 |
|----|------|-------------------|
| firsthand | オーナー自身の体験・観察 | verified |
| student_feedback | 生徒の声・フィードバック | verified |
| observation | 現地での観察 | verified |
| research | サブエージェントの調査結果 | unverified |
| auto | 自動蓄積（エンゲージメント逆引き等） | unverified |

## 自動蓄積の仕組み

手動追加に頼らず、日常タスクの副産物として知識が溜まる設計。

### 蓄積ポイント

| トリガー | 何が溜まるか | source | reliability |
|---------|-------------|--------|-------------|
| リサーチ系サブエージェント完了時 | 調査で得た事実・数字 | research | unverified |
| X/IG投稿の高エンゲージメント検出時 | その投稿で使った素材を逆引き保存 | auto | unverified |
| CS対応完了時 | 新しいFAQ・よくある質問パターン | auto | unverified |
| 会話中にオーナーが一次情報を共有 | 体験談・観察・数字 | firsthand | verified |
| 生徒フィードバック入力時 | 変化・感想・つまずき | student_feedback | verified |

### リサーチ系サブエージェントの蓄積フロー

```
リサーチ実行
  |
  v
結論をメインに返す（既存フロー）
  |
  v
[追加] 事実・数字をknowledge_entriesにINSERT
  - source: 'research'
  - reliability: 'unverified'
  - category/subcategory: テーマから自動判定
```

### reliability昇格

- 自動蓄積分は `unverified` で入る
- オーナーが確認 or 週次レビューで妥当性チェック → `verified` に昇格
- 生成時は `verified` 優先。`unverified` は補助的に使用

### 週次メンテナンス（週次レビューに組み込み）

- 重複エントリの統合
- 古い・不正確なエントリの削除候補提示
- `unverified` エントリのレビュー → 昇格 or 削除
- use_count が0のエントリの棚卸し

## 投稿生成時の利用フロー

```
投稿テーマ決定
  |
  v
1. category + tags で knowledge_entries を検索（5-10件）
   WHERE category = ? AND tags LIKE ? AND reliability = 'verified'
   ORDER BY use_count ASC  -- 使用頻度が低いものを優先（重複防止）
  |
  v
2. platform で content_guardrails を取得
   WHERE platform IN (?, 'all') ORDER BY priority DESC
  |
  v
3. 取得した素材 + ガードレールをシステムプロンプトに注入
  |
  v
4. Haiku/Sonnet で生成
  |
  v
5. 使用したエントリの use_count をインクリメント
```

## 既存部署との連携

知識DBは部署ではなく、全部署が読み書きする共有インフラ。

| 部署 | 関係 | 具体的な連携 |
|------|------|-------------|
| research | 生産者 | 調査結果の事実・数字をDBに書き込む |
| marketing | 消費者 | X/IG/SEO投稿生成時にDBから素材を引く |
| cs | 消費者 | 返信作成時にFAQ・料金・体験談を参照 |
| secretary | 管理者 | 週次レビューでDB品質をチェック |

### 既存データの統合

| 現在の場所 | 移行先 |
|-----------|--------|
| `~/.secretary/knowledge/` 18ファイル | knowledge_entries に分解してINSERT |
| `.company/cs/` 料金表・FAQ | knowledge_entries (category: 'barilingual') |
| 各Workerのシステムプロンプト内の直書き情報 | knowledge_entries + content_guardrails |

移行後も既存ファイルは参照用に残す。DBが正とし、ファイルは読み取り専用のバックアップ扱い。

## コスト設計

| 項目 | コスト |
|------|--------|
| D1ストレージ | 無料枠内（5GB） |
| D1読み取り | 無料枠内（500万行/日） |
| 生成時のトークン増加 | 素材5-10件 = 約500-1000トークン追加/生成 |
| Prompt Caching | ガードレール部分は固定 → キャッシュ対象 |

毎回リサーチAPIを呼ぶ場合と比較して、月間コストは大幅に削減。

## 手動追加の口

自動蓄積が主軸だが、手動追加も可能:

1. Claude Code経由: 「○○をDBに追加して」→ サブエージェントがINSERT
2. 管理画面（将来）: Next.js adminにフォーム追加

## 実装スコープ

### Phase 1（最小構成）
- D1にテーブル3つ作成
- 既存knowledge/ファイルを分解してINSERT（初期データ投入）
- IG Auto-Posterの生成時にDB参照を追加

### Phase 2（自動蓄積）
- リサーチ系サブエージェントの蓄積フロー追加
- 会話中の一次情報検出 → 自動INSERT
- use_countインクリメント

### Phase 3（拡張）
- X Auto-Poster、SEO Writerへの展開
- CS返信での参照
- 管理画面UI
- 週次メンテナンスの自動化

## 制約・注意事項

- content には文章を貯めない。事実・数字・観察のみ
- 1エントリ = 1つの事実（粒度を細かく保つ）
- 生成時にDB全体を食わせない。テーマに応じて必要分だけ取得
- verified優先。unverifiedは補助的利用
- 既存のdecisions.mdの決定事項（料金、ブランド名等）と矛盾するエントリは入れない
