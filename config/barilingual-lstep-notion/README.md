# Barilingual LSTEP Notion Seed

This directory contains seed data for the Notion source-of-truth databases.

## Files

- `seed/nodes.csv`: records for `Nodes` database
- `seed/transitions.csv`: records for `Transitions` database
- `seed/messages.csv`: records for `Messages` database
- `seed/runs_template.csv`: starter row for `Runs` database

## Regenerate Seed

```bash
node scripts/export-barilingual-notion-seed.mjs
```

Optional arguments:

```bash
node scripts/export-barilingual-notion-seed.mjs <source_html_path> <output_dir>
```

## Import Order in Notion

1. `Nodes`
2. `Transitions` (map relation by `node_id`)
3. `Messages` (map relation by `node_id`)
4. `Runs` (import template and duplicate per run)

### A/B・実験用カラム（Messages / Runs）

既存ワークスペースに列を足す場合（冪等）:

```bash
set -a && source /path/to/.env && set +a
node scripts/patch-barilingual-notion-schema.mjs
```

- **Messages**: `ab_variant`（select: `all` / `A` / `B`）— 同一 `day_index` で A用・B用の行を分けて編集する想定。共通文面は `all`。
- **Messages**: `variant_note` — 差分の意図メモ（例: 「CVブロックのみBで強め」）。
- **Runs**: `experiment_id` — 実験名（例: `S02_day4_cv_2026-04`）。
- **Runs**: `cohort`（select: `A` / `B` / `all` / `n/a`）。
- **Runs**: `metrics_note` — 日次のCV率・見積率などのメモまたは外部集計リンク。

### 部分インポート

```bash
node scripts/import-barilingual-notion-seed.mjs messages
node scripts/import-barilingual-notion-seed.mjs runs
# カスタムseedディレクトリ + messages のみ
node scripts/import-barilingual-notion-seed.mjs ./my-seed messages
```

### アーカイブしてから差し替え

```bash
node scripts/archive-notion-database.mjs "$NOTION_DB_MESSAGES_ID"
```

## Required Post-Import Checks

1. `Nodes.enabled=true` count is `17`
2. `Transitions.enabled=true` count matches seed（現行HTML由来は `22` 前後）
3. `Messages.enabled=true` count matches seed（`node scripts/validate-barilingual-notion-seed.mjs`）
4. root node is only `friend_add`
5. terminal node is only `s06`
