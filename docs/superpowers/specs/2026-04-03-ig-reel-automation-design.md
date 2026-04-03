# IG リール自動化 - 仮説駆動パイプライン設計

## 概要

週7カルーセル(18:00) + 週7リール(12:00) = 計14本/週の自動投稿パイプライン。
各リールに仮説を付与し、1本単位で検証→学習する自走ループを構築する。

## リサーチに基づくバズフォーマット

| フォーマット | 例 | 主要KPI | 根拠 |
|---|---|---|---|
| ranking | バリ島カフェTOP5 | 保存率 | リスト形式は保存率最高、バズ継続型 |
| cost_appeal | 月3万円でバリ生活のリアル | DM共有 | コスパ訴求はDM共有を誘発 |
| before_after | 英語赤点→3ヶ月後 | コメント | 変化ストーリーが感情共鳴 |
| routine | バリ留学生の1日 | 視聴時間 | ルーティン系はリプレイ誘発 |
| relatable | バリ留学あるある5選 | コメント | 共感系はタグ付け誘発 |

初期配分: ranking 2本 / cost_appeal 2本 / before_after 1本 / routine 1本 / relatable 1本

## アーキテクチャ

### 1. DB変更 (0009_reel_hypothesis.sql)

```sql
-- リール仮説メタデータ（schedule_queueのab_test_metaを拡張）
-- ab_test_meta JSONに以下を追加:
-- {
--   "hypothesis": "コスパ訴求型 × 具体数字フックは保存率5%以上",
--   "reelFormat": "cost_appeal",
--   "hookStyle": "number_first",
--   "targetKpi": "saves",
--   "successThreshold": 0.05
-- }

-- フォーマット別パフォーマンス集計用ビュー
CREATE VIEW IF NOT EXISTS reel_format_performance AS
SELECT
  json_extract(ab_test_meta, '$.reelFormat') AS reel_format,
  COUNT(*) AS total_posts,
  AVG(CAST(json_extract(ab_test_meta, '$.saves') AS REAL) /
      NULLIF(CAST(json_extract(ab_test_meta, '$.reach') AS REAL), 0)) AS avg_save_rate,
  AVG(CAST(json_extract(ab_test_meta, '$.shares') AS REAL) /
      NULLIF(CAST(json_extract(ab_test_meta, '$.reach') AS REAL), 0)) AS avg_share_rate
FROM schedule_queue
WHERE content_type = 'reel' AND status = 'posted'
  AND json_extract(ab_test_meta, '$.reelFormat') IS NOT NULL
GROUP BY reel_format;
```

### 2. content-planner.ts 拡張

リール用プロンプト `buildPromptForReelPlan()` を追加。
- 入力: カテゴリ、ネタ、フォーマット(ranking/cost_appeal等)、hookスタイル
- 出力: `{ hookText, facts[], narrationTexts[], ctaText }`
- フォーマットごとにプロンプトテンプレートを分岐

### 3. reel-planner.ts (新規)

仮説駆動のリール週次プランナー。
- `planWeeklyReels(db, groqApiKey, neta)`:
  1. reel_format_performanceビューから過去実績を取得
  2. 勝ちフォーマットの配分を増やし、負けを減らす（初週はデフォルト配分）
  3. 各リールに仮説(hypothesis)を付与
  4. A/Bテスト: 同一フォーマット2本のうち1本をcontrol、1本をvariant（hookスタイル変更）
  5. 7本分のContentPlan(reel版)を返す

### 4. cron-poster.ts 拡張

```typescript
if (post.content_type === "reel") {
  const mediaUrls = JSON.parse(post.media_urls) as string[];
  const videoUrl = mediaUrls[0];
  if (videoUrl) {
    const igMediaId = await publishReel(videoUrl, post.caption, igAccessToken, igAccountId);
    await markPosted(db, post.id, igMediaId);
  }
}
```

### 5. scheduler.ts 拡張

- `enqueueWeeklyReels()`: リール7本をscheduled_time="12:00"で登録
- 既存の`enqueueWeekly()`はカルーセル用（scheduled_time="18:00"）のまま

### 6. Cron Trigger 追加 (index.ts)

- UTC 3:00 (バリ11:00) → リール投稿用cron
- 既存 UTC 9:00 (バリ17:00) → カルーセル投稿用（変更なし）

### 7. generate-reel.mjs (変更なし)

既存のパイプラインをそのまま使用。content_jsonの形式が合えば動く。

### 8. 週次学習ループ (insights.ts 拡張)

週次insights収集時にリール別の実績を集計:
1. format別の保存率/DM共有率/リーチを計算
2. 仮説の成否を判定（successThreshold vs 実績）
3. 次週のフォーマット配分を更新

## 動画素材

- Pexels Video API優先（searchPexelsVideos既存）
- 不足時はPexels写真のKen Burnsアニメーション（generate-reel.mjsに実装済み）

## A/Bテスト設計

- 既存ab_tests/ab_test_resultsテーブルを共用
- content_type="reel"で区別
- 初期テスト軸: hookスタイル（疑問形「知ってた？」vs 断定形「これが正解」）
- 同一フォーマット内で1本control/1本variantを配置
- 評価KPI: saves(保存率) + shares(DM共有率)

## アルゴリズム攻略ポイント（設計に反映済み）

- 冒頭3秒: hookTextを短く強く（generate-reel.mjsのDUR_HOOK=2秒）
- 投稿時間: 12:00（昼休みショート動画視聴層）
- 保存誘発: ランキング/リスト型を多めに配分
- DM共有誘発: コスパ訴求型で具体数字を入れる

## スコープ外

- トレンド音源の自動検出（手動でBGMフォルダに追加）
- 視聴完了率/リプレイ率のKPI（IG API未対応）
- カルーセルとリールのネタ重複排除（運用で様子見）
