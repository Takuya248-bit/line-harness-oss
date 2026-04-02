#!/bin/bash
# dev-loop.sh — 3モード開発ループ（全自動パイプライン）
#
# ツール分担: Claude Code=設計・判断 / Cursor=実装・修正 / Codex=レビュー
#
# Usage:
#   ./scripts/dev-loop.sh quick  [repo-path]   # Claude Code直接編集後 → Codex review
#   ./scripts/dev-loop.sh normal [repo-path]   # 指示書→Cursor実装→Codex review
#   ./scripts/dev-loop.sh full   [repo-path]   # 指示書→Cursor→review→改善→修正（max 2回）
#   ./scripts/dev-loop.sh review [repo-path]   # Codex reviewのみ（手動Cursor後に使用）
#
# 前提:
#   - cursor-agent CLI インストール済み
#   - npx @openai/codex 利用可能
#   - claude CLI 利用可能（fullモードの改善指示生成）
#   - .dev-loop/task.md が存在（normal/fullモード）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:?Usage: dev-loop.sh <quick|normal|full|review> [repo-path]}"
shift
REPO_PATH="${1:-$(pwd)}"
cd "$REPO_PATH"
mkdir -p .dev-loop

# ── 共通関数 ──

log() { echo "$(date +%H:%M:%S) [dev-loop] $*"; }

check_task_md() {
  if [ ! -f .dev-loop/task.md ]; then
    echo "ERROR: .dev-loop/task.md が見つかりません"
    echo "Claude Codeで指示書を作成してください"
    exit 1
  fi
}

run_cursor() {
  local instruction_file="$1"
  local label="${2:-実装}"
  log "Cursor ${label}開始: ${instruction_file}"

  # cursor-agent で非インタラクティブ実行（-p = print mode, --yolo = auto-approve）
  cursor-agent --yolo -p "$(cat "$instruction_file")" \
    --output-format text \
    2>&1 | tee .dev-loop/cursor-output.log

  local exit_code=${PIPESTATUS[0]}
  if [ $exit_code -ne 0 ]; then
    log "WARNING: Cursor が非ゼロ終了 (code=$exit_code)"
    # 致命的ではない場合もあるので続行
  fi
  log "Cursor ${label}完了"
}

run_codex_review() {
  log "Codex レビュー開始"

  # uncommitted変更があればそれをレビュー、なければ直近コミットをレビュー
  local review_flag="--commit HEAD"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    review_flag="--uncommitted"
  fi

  npx @openai/codex review $review_flag 2>&1 | tee .dev-loop/codex-raw.log || true

  # raw出力をreview.mdにコピー
  cp .dev-loop/codex-raw.log .dev-loop/review.md

  log "レビュー結果: .dev-loop/review.md"
  echo "---"
  cat .dev-loop/review.md
  echo "---"
}

has_critical_issues() {
  # review.mdにcritical issueがあるか判定
  if grep -qi "critical" .dev-loop/review.md 2>/dev/null; then
    return 0  # critical あり
  fi
  if grep -qi "LGTM" .dev-loop/review.md 2>/dev/null; then
    return 1  # LGTM
  fi
  # warningのみの場合もissueありとして扱う
  if grep -qi "warning" .dev-loop/review.md 2>/dev/null; then
    return 0
  fi
  return 1  # issue なし
}

generate_fix_instructions() {
  local round="$1"
  log "Claude Code: 改善指示生成 (round $round)"

  claude -p "あなたはコードレビュー結果を解釈して修正指示を書くシニアエンジニアです。

以下のCodexレビュー結果を読んで、Cursorへの修正指示書を作成してください。

## レビュー結果
$(cat .dev-loop/review.md)

## 元の実装指示
$(cat .dev-loop/task.md)

## 指示書フォーマット
以下の形式で .dev-loop/fix-instructions.md に書く内容だけを出力してください:

# 修正指示 (Round $round)

## 修正対象
- \`path/to/file.ts\` — [何を修正するか]

## 修正内容
[具体的な修正内容]

## Done when
- [ ] [検証可能な完了条件]

注意:
- criticalとwarningのみ対応。infoは無視
- 最小限の変更で修正する
- 新しい機能を追加しない" \
    --output-format text \
    > .dev-loop/fix-instructions.md 2>&1

  log "修正指示: .dev-loop/fix-instructions.md"
}

# ── モード実行 ──

case "$MODE" in

  # ── quick: 小修正（Claude Code直接編集済み）→ Codex review ──
  quick)
    log "=== quick mode ==="
    run_codex_review
    log "=== quick 完了 ==="
    ;;

  # ── review: Codex reviewのみ（手動Cursor実装後に使用） ──
  review)
    log "=== review mode ==="
    run_codex_review
    log "=== review 完了 ==="
    ;;

  # ── normal: 指示書 → Cursor実装 → Codex review ──
  normal)
    log "=== normal mode ==="
    check_task_md

    # Step 1: Cursor実装
    run_cursor .dev-loop/task.md "実装"

    # Step 2: Codex review
    run_codex_review

    log "=== normal 完了 ==="
    ;;

  # ── full: 指示書 → Cursor → review → 改善 → 修正（max 2回） ──
  full)
    log "=== full mode ==="
    check_task_md

    # Step 1: Cursor実装
    run_cursor .dev-loop/task.md "実装"

    # Step 2: Codex review
    run_codex_review

    # Step 3-5: 修正ループ（max 2ラウンド）
    MAX_ROUNDS=2
    round=1
    while [ $round -le $MAX_ROUNDS ]; do
      if ! has_critical_issues; then
        log "レビューOK — 修正ループ不要"
        break
      fi

      log "=== 修正ラウンド $round/$MAX_ROUNDS ==="

      # Claude Codeで改善指示生成
      generate_fix_instructions $round

      # Cursorで修正
      run_cursor .dev-loop/fix-instructions.md "修正(round $round)"

      # 再レビュー
      run_codex_review

      round=$((round + 1))
    done

    if [ $round -gt $MAX_ROUNDS ] && has_critical_issues; then
      log "WARNING: ${MAX_ROUNDS}ラウンド修正後もissue残存。手動確認が必要です"
      log "レビュー結果: .dev-loop/review.md"
    fi

    log "=== full 完了 ==="
    ;;

  *)
    echo "Usage: dev-loop.sh <quick|normal|full|review> [repo-path]"
    echo ""
    echo "Modes:"
    echo "  quick   小修正後のCodexレビュー"
    echo "  normal  指示書→Cursor実装→Codexレビュー"
    echo "  full    指示書→Cursor→レビュー→改善→修正（max 2回）"
    echo "  review  Codexレビューのみ（手動Cursor後に使用）"
    echo ""
    echo "Files:"
    echo "  .dev-loop/task.md              実装指示書（Claude Codeが作成）"
    echo "  .dev-loop/review.md            Codexレビュー結果"
    echo "  .dev-loop/fix-instructions.md  修正指示書（fullモード時）"
    echo "  .dev-loop/cursor-output.log    Cursor実行ログ"
    exit 1
    ;;
esac
