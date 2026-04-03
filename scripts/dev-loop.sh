#!/bin/bash
# dev-loop.sh — 3モード開発ループ + 並列タスク管理（全自動パイプライン）
#
# ツール分担: Claude Code=設計・判断 / Cursor=実装・修正 / Codex=レビュー
#
# Usage (単一タスク):
#   ./scripts/dev-loop.sh quick  [repo-path]   # Claude Code直接編集後 → Codex review
#   ./scripts/dev-loop.sh normal [repo-path]   # 指示書→Cursor実装→Codex review
#   ./scripts/dev-loop.sh full   [repo-path]   # 指示書→Cursor→review→改善→修正（max 2回）
#   ./scripts/dev-loop.sh review [repo-path]   # Codex reviewのみ（手動Cursor後に使用）
#
# Usage (並列タスク管理):
#   ./scripts/dev-loop.sh board                # タスク状態一覧（経過時間付き）
#   ./scripts/dev-loop.sh ready                # 着手可能タスク一覧
#   ./scripts/dev-loop.sh start  T1 [assignee] # タスク開始→git snapshot→Cursorプロンプト生成
#   ./scripts/dev-loop.sh done   T1            # タスク完了→diff保存→Codexレビュー→progress.md追記
#   ./scripts/dev-loop.sh block  T1 "理由"     # タスクをblocked状態に
#   ./scripts/dev-loop.sh prompt T1            # Cursor用プロンプト再表示
#   ./scripts/dev-loop.sh reset                # state.json初期化（tasks.json再分解後に使用）
#   ./scripts/dev-loop.sh merge                # 全タスクreviewed確認→統合テスト→コミット
#
# 前提:
#   - cursor CLI インストール済み
#   - npx @openai/codex 利用可能
#   - claude CLI 利用可能（fullモードの改善指示生成）
#   - jq インストール済み（並列タスク管理）
#   - .dev-loop/task.md が存在（normal/fullモード）
#   - .dev-loop/tasks.json が存在（並列タスク管理）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:?Usage: dev-loop.sh <quick|normal|full|review|board|ready|start|done|wait|block|prompt|reset|merge> [args]}"
shift

# 並列タスク管理コマンドはrepo-pathではなくtask-idを取る
case "$MODE" in
  board|ready|reset|merge|start-all|status)
    REPO_PATH="$(pwd)"
    ;;
  start|done|block|prompt|wait)
    REPO_PATH="$(pwd)"
    ;;
  *)
    REPO_PATH="${1:-$(pwd)}"
    shift 2>/dev/null || true
    ;;
esac

cd "$REPO_PATH"
mkdir -p .dev-loop

TASKS_JSON=".dev-loop/tasks.json"
STATE_JSON=".dev-loop/state.json"
REVIEWS_DIR=".dev-loop/reviews"
DIFFS_DIR=".dev-loop/diffs"
PROGRESS_FILE=".company/secretary/notes/$(date +%Y-%m-%d)-progress.md"

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
  fi
  log "Cursor ${label}完了"
}

run_codex_review() {
  log "Codex レビュー開始"

  local review_flag="--commit HEAD"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    review_flag="--uncommitted"
  fi

  npx @openai/codex review $review_flag 2>&1 | tee .dev-loop/codex-raw.log || true
  cp .dev-loop/codex-raw.log .dev-loop/review.md

  log "レビュー結果: .dev-loop/review.md"
  echo "---"
  cat .dev-loop/review.md
  echo "---"
}

# タスク別Codexレビュー（diffを添えて実行、結果をタスク別保存）
run_codex_review_for_task() {
  local task_id="$1"
  mkdir -p "$REVIEWS_DIR"
  log "Codex レビュー開始: $task_id"

  local review_flag="--commit HEAD"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    review_flag="--uncommitted"
  fi

  npx @openai/codex review $review_flag 2>&1 | tee .dev-loop/codex-raw.log || true

  # タスク別に保存
  cp .dev-loop/codex-raw.log "$REVIEWS_DIR/${task_id}_review.md"
  cp .dev-loop/codex-raw.log .dev-loop/review.md

  log "レビュー結果: $REVIEWS_DIR/${task_id}_review.md"
  echo "---"
  cat "$REVIEWS_DIR/${task_id}_review.md"
  echo "---"
}

has_critical_issues() {
  if grep -qi "critical" .dev-loop/review.md 2>/dev/null; then
    return 0
  fi
  if grep -qi "LGTM" .dev-loop/review.md 2>/dev/null; then
    return 1
  fi
  if grep -qi "warning" .dev-loop/review.md 2>/dev/null; then
    return 0
  fi
  return 1
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

# progress.mdにタスク完了ログを追記
append_progress() {
  local task_id="$1" title="$2" diff_file="$3" review_file="$4"
  mkdir -p "$(dirname "$PROGRESS_FILE")"

  local now
  now="$(date +%H:%M)"
  local review_summary="レビュー結果なし"
  if [ -f "$review_file" ]; then
    if grep -qi "LGTM" "$review_file" 2>/dev/null; then
      review_summary="LGTM"
    elif grep -qi "critical" "$review_file" 2>/dev/null; then
      review_summary="critical issue あり"
    elif grep -qi "warning" "$review_file" 2>/dev/null; then
      review_summary="warning あり"
    fi
  fi

  local changed_files="不明"
  if [ -f "$diff_file" ]; then
    changed_files=$(grep -c '^diff --git' "$diff_file" 2>/dev/null || echo "0")
    changed_files="${changed_files}ファイル"
  fi

  cat >> "$PROGRESS_FILE" << EOF

## ${now} [dev-loop/parallel]
- 作業内容: ${task_id} ${title} 完了+レビュー
- 対象: ${changed_files}変更
- 結果: 完了
- 変更点: diff → .dev-loop/diffs/${task_id}_diff.patch
- レビュー: ${review_summary} → .dev-loop/reviews/${task_id}_review.md
- 備考: なし
EOF

  log "progress.md 追記完了"
}

# ── 並列タスク管理関数 ──

ensure_tasks() {
  if [ ! -f "$TASKS_JSON" ]; then
    echo "ERROR: $TASKS_JSON が見つかりません"
    echo "Claude Codeでタスク分解を実行してください"
    echo ""
    echo "テンプレ: 「このタスクをCursor並列実装用に分解して .dev-loop/tasks.json に出力して」"
    exit 1
  fi
  if [ ! -f "$STATE_JSON" ]; then
    jq '[.tasks[].id] | map({(.): {status: "pending", assignee: "-", started: null, finished: null, git_snapshot: null}}) | add' \
      "$TASKS_JSON" > "$STATE_JSON"
  fi
}

get_state() {
  local task_id="$1"
  jq -r --arg id "$task_id" '.[$id].status // "unknown"' "$STATE_JSON"
}

set_state() {
  local task_id="$1" status="$2" assignee="${3:-}" note="${4:-}"
  local now
  now="$(date +%H:%M)"
  local tmp
  tmp=$(mktemp)
  if [ "$status" = "in_progress" ]; then
    local git_sha
    git_sha=$(git rev-parse HEAD 2>/dev/null || echo "none")
    jq --arg id "$task_id" --arg s "$status" --arg a "$assignee" --arg t "$now" --arg g "$git_sha" \
      '.[$id].status = $s | .[$id].assignee = $a | .[$id].started = $t | .[$id].git_snapshot = $g' "$STATE_JSON" > "$tmp"
  elif [ "$status" = "done" ] || [ "$status" = "reviewed" ]; then
    jq --arg id "$task_id" --arg s "$status" --arg t "$now" \
      '.[$id].status = $s | .[$id].finished = $t' "$STATE_JSON" > "$tmp"
  else
    jq --arg id "$task_id" --arg s "$status" --arg n "$note" \
      '.[$id].status = $s | .[$id].note = $n' "$STATE_JSON" > "$tmp"
  fi
  mv "$tmp" "$STATE_JSON"
}

# 経過時間を計算（HH:MM形式の差分）
calc_elapsed() {
  local started="$1" finished="$2"
  if [ "$started" = "null" ] || [ -z "$started" ]; then
    echo "-"
    return
  fi
  local start_h start_m end_h end_m
  start_h=$(echo "$started" | cut -d: -f1 | sed 's/^0//')
  start_m=$(echo "$started" | cut -d: -f2 | sed 's/^0//')
  if [ "$finished" = "null" ] || [ -z "$finished" ]; then
    # 進行中 → 現在時刻との差
    end_h=$(date +%-H)
    end_m=$(date +%-M)
  else
    end_h=$(echo "$finished" | cut -d: -f1 | sed 's/^0//')
    end_m=$(echo "$finished" | cut -d: -f2 | sed 's/^0//')
  fi
  local diff_m=$(( (end_h * 60 + end_m) - (start_h * 60 + start_m) ))
  if [ $diff_m -lt 0 ]; then
    diff_m=$((diff_m + 1440))
  fi
  echo "${diff_m}m"
}

show_board() {
  ensure_tasks
  local project
  project=$(jq -r '.project' "$TASKS_JSON")
  echo "=== $project ==="
  echo ""
  printf "%-6s | %-12s | %-10s | %-6s | %s\n" "ID" "STATUS" "ASSIGNEE" "TIME" "TITLE"
  echo "-------|--------------|------------|--------|------"
  jq -r '.tasks[] | .id' "$TASKS_JSON" | while read -r tid; do
    local status assignee title started finished elapsed
    status=$(jq -r --arg id "$tid" '.[$id].status' "$STATE_JSON" 2>/dev/null || echo "pending")
    assignee=$(jq -r --arg id "$tid" '.[$id].assignee // "-"' "$STATE_JSON" 2>/dev/null || echo "-")
    started=$(jq -r --arg id "$tid" '.[$id].started // "null"' "$STATE_JSON" 2>/dev/null || echo "null")
    finished=$(jq -r --arg id "$tid" '.[$id].finished // "null"' "$STATE_JSON" 2>/dev/null || echo "null")
    title=$(jq -r --arg id "$tid" '.tasks[] | select(.id == $id) | .title' "$TASKS_JSON")
    elapsed=$(calc_elapsed "$started" "$finished")
    printf "%-6s | %-12s | %-10s | %-6s | %s\n" "$tid" "$status" "$assignee" "$elapsed" "$title"
  done
  echo ""
  echo "ready: $(list_ready_ids | tr '\n' ' ')"
}

list_ready_ids() {
  ensure_tasks
  jq -r '.tasks[] | .id' "$TASKS_JSON" | while read -r tid; do
    local status
    status=$(jq -r --arg id "$tid" '.[$id].status' "$STATE_JSON" 2>/dev/null || echo "pending")
    [ "$status" != "pending" ] && continue
    local deps_met=true
    for dep in $(jq -r --arg id "$tid" '.tasks[] | select(.id == $id) | .depends_on[]' "$TASKS_JSON" 2>/dev/null); do
      local dep_status
      dep_status=$(jq -r --arg id "$dep" '.[$id].status' "$STATE_JSON" 2>/dev/null || echo "pending")
      if [ "$dep_status" != "done" ] && [ "$dep_status" != "reviewed" ]; then
        deps_met=false
        break
      fi
    done
    [ "$deps_met" = true ] && echo "$tid"
  done
}

# タスクブランチの作成（並列時のコンフリクト回避）
create_task_branch() {
  local task_id="$1"
  local base_branch
  base_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  local task_branch="dev-loop/${task_id}"

  # 既にタスクブランチがあればそこへ
  if git rev-parse --verify "$task_branch" >/dev/null 2>&1; then
    git checkout "$task_branch" 2>/dev/null
    log "$task_id 既存ブランチ: $task_branch"
  else
    git checkout -b "$task_branch" 2>/dev/null
    log "$task_id ブランチ作成: $task_branch (from $base_branch)"
  fi

  # ベースブランチをstate.jsonに記録
  local tmp
  tmp=$(mktemp)
  jq --arg id "$task_id" --arg b "$base_branch" \
    '.[$id].base_branch = $b' "$STATE_JSON" > "$tmp"
  mv "$tmp" "$STATE_JSON"
}

# タスクブランチからメインへマージ
merge_task_branch() {
  local task_id="$1"
  local base_branch
  base_branch=$(jq -r --arg id "$task_id" '.[$id].base_branch // "main"' "$STATE_JSON" 2>/dev/null || echo "main")
  local task_branch="dev-loop/${task_id}"

  if ! git rev-parse --verify "$task_branch" >/dev/null 2>&1; then
    log "$task_id ブランチなし — スキップ"
    return 0
  fi

  # ベースブランチに戻ってマージ
  git checkout "$base_branch" 2>/dev/null
  if git merge --no-edit "$task_branch" 2>/dev/null; then
    log "$task_id ブランチマージ成功: $task_branch → $base_branch"
    git branch -d "$task_branch" 2>/dev/null || true
  else
    log "WARNING: $task_id マージコンフリクト! 手動解決が必要です"
    git merge --abort 2>/dev/null || true
    git checkout "$task_branch" 2>/dev/null
    return 1
  fi
}

# タスク完了時にgit diffを保存
save_task_diff() {
  local task_id="$1"
  mkdir -p "$DIFFS_DIR"
  local snapshot_sha
  snapshot_sha=$(jq -r --arg id "$task_id" '.[$id].git_snapshot // "none"' "$STATE_JSON" 2>/dev/null || echo "none")

  if [ "$snapshot_sha" = "none" ] || [ "$snapshot_sha" = "null" ]; then
    git diff > "$DIFFS_DIR/${task_id}_diff.patch" 2>/dev/null || true
    git diff --cached >> "$DIFFS_DIR/${task_id}_diff.patch" 2>/dev/null || true
  else
    git diff "$snapshot_sha" > "$DIFFS_DIR/${task_id}_diff.patch" 2>/dev/null || true
  fi

  local line_count
  line_count=$(wc -l < "$DIFFS_DIR/${task_id}_diff.patch" 2>/dev/null || echo "0")
  log "$task_id diff保存: $DIFFS_DIR/${task_id}_diff.patch (${line_count}行)"
}

# 依存チェーン自動継続: 新たにreadyになったタスクを--autoで起動
auto_continue_chain() {
  local ready_ids
  ready_ids=$(list_ready_ids)
  if [ -z "$ready_ids" ]; then
    return
  fi
  echo "$ready_ids" | while read -r tid; do
    _t=$(jq -r --arg id "$tid" '.tasks[] | select(.id == $id) | .title' "$TASKS_JSON")
    log "依存解決 → $tid ($_t) を自動起動"
    "$0" start "$tid" "Cursor" "--auto"
  done
}

# macOS通知
notify() {
  local title="$1" message="$2"
  osascript -e "display notification \"$message\" with title \"$title\"" 2>/dev/null || true
}

generate_cursor_prompt_for_task() {
  local task_id="$1"
  ensure_tasks
  local task_json
  task_json=$(jq --arg id "$task_id" '.tasks[] | select(.id == $id)' "$TASKS_JSON")
  if [ -z "$task_json" ]; then
    echo "ERROR: タスク $task_id が見つかりません"
    exit 1
  fi

  local title goal scope dod hint
  title=$(echo "$task_json" | jq -r '.title')
  goal=$(echo "$task_json" | jq -r '.goal')
  scope=$(echo "$task_json" | jq -r '.scope | join(", ")')
  dod=$(echo "$task_json" | jq -r '.definition_of_done | map("- " + .) | join("\n")')
  hint=$(echo "$task_json" | jq -r '.prompt_hint // empty')

  local prompt_file=".dev-loop/tasks/${task_id}_prompt.md"
  mkdir -p .dev-loop/tasks

  cat > "$prompt_file" << PROMPT
# ${task_id}: ${title}

## 目的
${goal}

## 対象範囲
${scope}

## 完了条件
${dod}
PROMPT

  if [ -n "$hint" ]; then
    cat >> "$prompt_file" << PROMPT

## ヒント
${hint}
PROMPT
  fi

  cat >> "$prompt_file" << 'PROMPT'

## 制約
- このタスク以外には手を広げない
- 影響範囲を最小化する
- 実装後に変更ファイル一覧を出す
- 必要なら TODO を明記する

## 実装後に必ず出すこと
1. 変更したファイル一覧
2. 実装した内容の要約
3. 残っている懸念点
4. テストすべき観点
PROMPT

  echo "$prompt_file"
}

# 全タスクがreviewedか確認
all_reviewed() {
  ensure_tasks
  local all_done=true
  jq -r '.tasks[] | .id' "$TASKS_JSON" | while read -r tid; do
    local status
    status=$(jq -r --arg id "$tid" '.[$id].status' "$STATE_JSON" 2>/dev/null || echo "pending")
    if [ "$status" != "reviewed" ]; then
      echo "false"
      return
    fi
  done
  echo "true"
}

# ── モード実行 ──

case "$MODE" in

  # ── 並列タスク管理 ──

  board)
    show_board
    ;;

  ready)
    ensure_tasks
    echo "=== 着手可能タスク ==="
    list_ready_ids | while read -r tid; do
      _title=$(jq -r --arg id "$tid" '.tasks[] | select(.id == $id) | .title' "$TASKS_JSON")
      echo "  $tid: $_title"
    done
    ;;

  start)
    TASK_ID="${1:?Usage: dev-loop.sh start <task-id> [assignee] [--bg|--manual]}"
    ASSIGNEE="${2:-Cursor}"
    RUN_MODE="${3:-}"
    ensure_tasks
    current=$(get_state "$TASK_ID")
    if [ "$current" != "pending" ]; then
      echo "WARNING: $TASK_ID は現在 $current です"
    fi
    prompt_file=$(generate_cursor_prompt_for_task "$TASK_ID")
    set_state "$TASK_ID" "in_progress" "$ASSIGNEE"

    # 並列タスクのコンフリクト回避: タスクブランチで隔離
    _in_progress_count=$(jq '[to_entries[] | select(.value.status == "in_progress")] | length' "$STATE_JSON")
    if [ "$_in_progress_count" -gt 1 ] || [ "$RUN_MODE" = "--bg" ] || [ "$RUN_MODE" = "--auto" ]; then
      create_task_branch "$TASK_ID"
    fi

    log "$TASK_ID 開始 (assignee: $ASSIGNEE)"

    if [ "$RUN_MODE" = "--manual" ]; then
      # 手動モード: プロンプト表示のみ
      echo ""
      echo "=== Cursor用プロンプト: $prompt_file ==="
      echo ""
      cat "$prompt_file"
      echo ""
      echo "---"
      echo "このプロンプトをCursorに貼り付けて実装してください"
      echo "完了後: ./scripts/dev-loop.sh done $TASK_ID"
    elif [ "$RUN_MODE" = "--bg" ]; then
      # バックグラウンド実行: 並列タスク向け
      mkdir -p .dev-loop/logs
      log "$TASK_ID cursor-agent バックグラウンド起動"
      cursor-agent --yolo -p "$(cat "$prompt_file")" \
        --output-format text \
        > ".dev-loop/logs/${TASK_ID}_cursor.log" 2>&1 &
      echo "$!" > ".dev-loop/logs/${TASK_ID}.pid"
      log "$TASK_ID PID: $(cat ".dev-loop/logs/${TASK_ID}.pid")"
      echo "完了確認: ./scripts/dev-loop.sh status"
      echo "ログ: .dev-loop/logs/${TASK_ID}_cursor.log"
    elif [ "$RUN_MODE" = "--auto" ]; then
      # 完全自動: cursor → done → review → 依存チェーン自動継続
      mkdir -p .dev-loop/logs
      log "$TASK_ID 完全自動モード開始"
      (
        cursor-agent --yolo -p "$(cat "$prompt_file")" \
          --output-format text \
          > ".dev-loop/logs/${TASK_ID}_cursor.log" 2>&1
        _cursor_exit=$?

        if [ "$_cursor_exit" -ne 0 ]; then
          # cursor-agent失敗 → blockに変更
          "$0" block "$TASK_ID" "cursor-agent failed (exit=$_cursor_exit)"
          notify "dev-loop" "$TASK_ID cursor-agent失敗 (exit=$_cursor_exit)"
        else
          # cursor成功 → done（diff保存+レビュー+progress追記）
          "$0" done "$TASK_ID"
          notify "dev-loop" "$TASK_ID 完了+レビュー済み"
          # 依存チェーン自動継続
          cd "$REPO_PATH"
          auto_continue_chain
        fi
      ) &
      echo "$!" > ".dev-loop/logs/${TASK_ID}.pid"
      log "$TASK_ID PID: $(cat ".dev-loop/logs/${TASK_ID}.pid") (auto: cursor→done→review→chain)"
      echo "完了確認: ./scripts/dev-loop.sh status"
    else
      # デフォルト: フォアグラウンドで自動実行
      log "$TASK_ID cursor-agent 実行中..."
      mkdir -p .dev-loop/logs
      cursor-agent --yolo -p "$(cat "$prompt_file")" \
        --output-format text \
        2>&1 | tee ".dev-loop/logs/${TASK_ID}_cursor.log"
      _exit=${PIPESTATUS[0]}
      if [ "$_exit" -ne 0 ]; then
        log "WARNING: cursor-agent 非ゼロ終了 (code=$_exit)"
      fi
      log "$TASK_ID cursor-agent 完了"
      echo "次: ./scripts/dev-loop.sh done $TASK_ID"
    fi
    ;;

  wait)
    TASK_ID="${1:?Usage: dev-loop.sh wait <task-id>}"
    PID_FILE=".dev-loop/logs/${TASK_ID}.pid"
    if [ ! -f "$PID_FILE" ]; then
      echo "ERROR: $TASK_ID のバックグラウンドプロセスが見つかりません"
      exit 1
    fi
    _pid=$(cat "$PID_FILE")
    if kill -0 "$_pid" 2>/dev/null; then
      log "$TASK_ID (PID: $_pid) 実行中... 完了を待機"
      wait "$_pid" 2>/dev/null || true
      log "$TASK_ID 完了"
    else
      log "$TASK_ID は既に終了しています"
    fi
    rm -f "$PID_FILE"
    echo "ログ: .dev-loop/logs/${TASK_ID}_cursor.log"
    echo "次: ./scripts/dev-loop.sh done $TASK_ID"
    ;;

  done)
    TASK_ID="${1:?Usage: dev-loop.sh done <task-id>}"
    ensure_tasks

    # 1. diff保存 + コミット（タスクブランチ上）
    save_task_diff "$TASK_ID"
    # タスクブランチにいる場合はコミットしてからマージ
    _current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if [ "$_current_branch" = "dev-loop/${TASK_ID}" ]; then
      _title_for_commit=$(jq -r --arg id "$TASK_ID" '.tasks[] | select(.id == $id) | .title' "$TASKS_JSON")
      git add -A 2>/dev/null || true
      git commit -m "feat(${TASK_ID}): ${_title_for_commit}" --allow-empty 2>/dev/null || true
      log "$TASK_ID タスクブランチにコミット"
      # メインブランチへマージ
      if ! merge_task_branch "$TASK_ID"; then
        set_state "$TASK_ID" "blocked" "" "merge conflict"
        notify "dev-loop" "$TASK_ID マージコンフリクト! 手動解決が必要"
        log "WARNING: $TASK_ID マージコンフリクト。手動で解決してから done を再実行してください"
        exit 1
      fi
    fi
    set_state "$TASK_ID" "done"

    # 2. タスク別Codexレビュー
    _title=$(jq -r --arg id "$TASK_ID" '.tasks[] | select(.id == $id) | .title' "$TASKS_JSON")
    run_codex_review_for_task "$TASK_ID"
    set_state "$TASK_ID" "reviewed"

    # 3. progress.md追記
    append_progress "$TASK_ID" "$_title" "$DIFFS_DIR/${TASK_ID}_diff.patch" "$REVIEWS_DIR/${TASK_ID}_review.md"

    log "$TASK_ID 完了 → レビュー済み → progress.md追記済み"

    # 3.5 粒度フィードバック
    _started=$(jq -r --arg id "$TASK_ID" '.[$id].started // "null"' "$STATE_JSON")
    _finished=$(jq -r --arg id "$TASK_ID" '.[$id].finished // "null"' "$STATE_JSON")
    _elapsed_m=$(calc_elapsed "$_started" "$_finished" | sed 's/m//')
    if [ "$_elapsed_m" != "-" ] 2>/dev/null; then
      if [ "$_elapsed_m" -gt 40 ] 2>/dev/null; then
        echo ""
        log "WARNING: ${_elapsed_m}分かかりました。タスク粒度が大きすぎる可能性があります（目安: 20-40分）"
      elif [ "$_elapsed_m" -lt 5 ] 2>/dev/null; then
        echo ""
        log "NOTE: ${_elapsed_m}分で完了。分解が細かすぎる可能性があります"
      fi
    fi

    # macOS通知
    notify "dev-loop" "$TASK_ID $_title レビュー済み"

    # 4. 次に着手可能なタスクを表示
    echo ""
    echo "=== 次に着手可能 ==="
    _has_ready=false
    list_ready_ids | while read -r tid; do
      _t=$(jq -r --arg id "$tid" '.tasks[] | select(.id == $id) | .title' "$TASKS_JSON")
      echo "  $tid: $_t"
      _has_ready=true
    done

    # 5. 全タスク完了チェック
    _remaining=$(jq -r '.tasks[] | .id' "$TASKS_JSON" | while read -r tid; do
      _s=$(jq -r --arg id "$tid" '.[$id].status' "$STATE_JSON" 2>/dev/null || echo "pending")
      [ "$_s" != "reviewed" ] && echo "$tid"
    done)
    if [ -z "$_remaining" ]; then
      echo ""
      log "全タスク完了! → ./scripts/dev-loop.sh merge で統合"
    fi
    ;;

  block)
    TASK_ID="${1:?Usage: dev-loop.sh block <task-id> [reason]}"
    REASON="${2:-blocked}"
    ensure_tasks
    set_state "$TASK_ID" "blocked" "" "$REASON"
    log "$TASK_ID blocked: $REASON"
    ;;

  prompt)
    TASK_ID="${1:?Usage: dev-loop.sh prompt <task-id>}"
    ensure_tasks
    prompt_file=$(generate_cursor_prompt_for_task "$TASK_ID")
    cat "$prompt_file"
    ;;

  start-all)
    _mode="${1:---auto}"  # デフォルトは--auto（完全自動）
    ensure_tasks
    _started=0
    list_ready_ids | while read -r tid; do
      _title=$(jq -r --arg id "$tid" '.tasks[] | select(.id == $id) | .title' "$TASKS_JSON")
      log "起動: $tid — $_title ($_mode)"
      "$0" start "$tid" "Cursor" "$_mode"
      _started=$((_started + 1))
    done
    if [ "$_started" -eq 0 ]; then
      echo "着手可能なタスクがありません"
    fi
    echo ""
    show_board
    ;;

  status)
    ensure_tasks
    echo "=== バックグラウンドタスク状態 ==="
    _any=false
    jq -r '.tasks[] | .id' "$TASKS_JSON" | while read -r tid; do
      _s=$(jq -r --arg id "$tid" '.[$id].status' "$STATE_JSON" 2>/dev/null || echo "pending")
      [ "$_s" != "in_progress" ] && continue
      _pid_file=".dev-loop/logs/${tid}.pid"
      if [ -f "$_pid_file" ]; then
        _pid=$(cat "$_pid_file")
        if kill -0 "$_pid" 2>/dev/null; then
          _elapsed=$(calc_elapsed "$(jq -r --arg id "$tid" '.[$id].started' "$STATE_JSON")" "null")
          echo "  $tid: 実行中 (PID: $_pid, ${_elapsed}経過)"
        else
          echo "  $tid: cursor完了 → ./scripts/dev-loop.sh done $tid"
          rm -f "$_pid_file"
        fi
      else
        echo "  $tid: in_progress (PIDなし — 手動実行中?)"
      fi
      _any=true
    done
    echo ""
    show_board
    ;;

  reset)
    ensure_tasks
    rm -f "$STATE_JSON"
    rm -rf "$REVIEWS_DIR" "$DIFFS_DIR" .dev-loop/tasks/ .dev-loop/logs/
    jq '[.tasks[].id] | map({(.): {status: "pending", assignee: "-", started: null, finished: null, git_snapshot: null}}) | add' \
      "$TASKS_JSON" > "$STATE_JSON"
    log "state.json 初期化完了"
    show_board
    ;;

  merge)
    ensure_tasks
    echo "=== 統合チェック ==="

    # 未完了タスク確認
    _not_reviewed=""
    jq -r '.tasks[] | .id' "$TASKS_JSON" | while read -r tid; do
      _s=$(jq -r --arg id "$tid" '.[$id].status' "$STATE_JSON" 2>/dev/null || echo "pending")
      if [ "$_s" != "reviewed" ]; then
        _t=$(jq -r --arg id "$tid" '.tasks[] | select(.id == $id) | .title' "$TASKS_JSON")
        echo "  未完了: $tid ($_s) — $_t"
      fi
    done

    # reviewed以外があれば警告
    _count_not_done=$(jq '[to_entries[] | select(.value.status != "reviewed")] | length' "$STATE_JSON")
    if [ "$_count_not_done" -gt 0 ]; then
      echo ""
      echo "WARNING: ${_count_not_done}件の未完了タスクがあります"
      echo "全タスク完了後に再度 merge を実行してください"
      exit 1
    fi

    echo "全タスク reviewed — 統合準備完了"
    echo ""

    # 残存タスクブランチのクリーンアップ
    _remaining_branches=$(git branch --list 'dev-loop/*' 2>/dev/null || true)
    if [ -n "$_remaining_branches" ]; then
      log "残存タスクブランチをクリーンアップ中..."
      echo "$_remaining_branches" | while read -r _br; do
        _br=$(echo "$_br" | tr -d ' *')
        git branch -d "$_br" 2>/dev/null && log "  削除: $_br" || log "  スキップ: $_br (未マージ)"
      done
    fi

    # 統合テスト（tsc）
    log "統合テスト: tsc --noEmit"
    if npx tsc --noEmit 2>&1; then
      log "tsc OK"
    else
      log "WARNING: tsc エラーあり。修正後に再度 merge してください"
      exit 1
    fi

    # レビューサマリ表示
    echo ""
    echo "=== レビューサマリ ==="
    for review_file in "$REVIEWS_DIR"/*_review.md; do
      [ -f "$review_file" ] || continue
      _tid=$(basename "$review_file" | sed 's/_review\.md//')
      _verdict="OK"
      grep -qi "critical" "$review_file" 2>/dev/null && _verdict="CRITICAL"
      grep -qi "warning" "$review_file" 2>/dev/null && [ "$_verdict" = "OK" ] && _verdict="WARNING"
      grep -qi "LGTM" "$review_file" 2>/dev/null && _verdict="LGTM"
      printf "  %-6s: %s\n" "$_tid" "$_verdict"
    done

    echo ""
    log "統合テスト通過。コミット可能です"
    echo ""
    echo "次のステップ:"
    echo "  git add -A && git commit -m 'feat: [プロジェクト名]'"
    echo "  または Claude Code に「コミットして」と依頼"
    ;;

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

      generate_fix_instructions $round
      run_cursor .dev-loop/fix-instructions.md "修正(round $round)"
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
    echo "Usage: dev-loop.sh <command> [args]"
    echo ""
    echo "単一タスク:"
    echo "  quick  [repo-path]        小修正後のCodexレビュー"
    echo "  normal [repo-path]        指示書→Cursor実装→Codexレビュー"
    echo "  full   [repo-path]        指示書→Cursor→レビュー→改善→修正（max 2回）"
    echo "  review [repo-path]        Codexレビューのみ"
    echo ""
    echo "並列タスク管理:"
    echo "  board                     タスク状態一覧（経過時間付き）"
    echo "  ready                     着手可能タスク一覧"
    echo "  start  <id> [assignee] [--bg|--auto|--manual]"
    echo "                            タスク開始→cursor-agent自動実行"
    echo "                            --bg: バックグラウンド実行（並列向け）"
    echo "                            --auto: 完全自動（cursor→done→reviewまで無人）"
    echo "                            --manual: プロンプト表示のみ（手動コピペ）"
    echo "  start-all [--auto|--bg]   readyタスクを一括起動（デフォルト: --auto）"
    echo "  status                    バックグラウンドタスクの生死確認"
    echo "  wait   <id>              バックグラウンドタスクの完了待ち"
    echo "  done   <id>              タスク完了→diff保存→Codexレビュー→progress追記"
    echo "  block  <id> [reason]     タスクをblocked状態に"
    echo "  prompt <id>              Cursor用プロンプト再表示"
    echo "  reset                     state初期化（タスク再分解後に使用）"
    echo "  merge                     全タスク統合→テスト→コミット準備"
    echo ""
    echo "Files:"
    echo "  .dev-loop/task.md              単一タスク指示書"
    echo "  .dev-loop/tasks.json           並列タスク定義（Claude Code生成）"
    echo "  .dev-loop/state.json           タスク状態（自動管理）"
    echo "  .dev-loop/tasks/*_prompt.md    Cursor用プロンプト（自動生成）"
    echo "  .dev-loop/diffs/*_diff.patch   タスク別差分（自動保存）"
    echo "  .dev-loop/reviews/*_review.md  タスク別レビュー結果（自動保存）"
    echo "  .dev-loop/review.md            最新Codexレビュー結果"
    exit 1
    ;;
esac
