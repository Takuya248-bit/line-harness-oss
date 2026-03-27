# Obsidian Vault ファイル整理 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1,162ファイルのObsidian Vaultをプロジェクト中心の構成に再編し、重複フォルダを統合、inboxをLLM自動分類して整理する。

**Architecture:** Vault（~/Documents/Obsidian Vault/）をgitでスナップショット保存後、フォルダ作成→重複統合→YouTube移動→ミーティング分類→inbox分類→リンク更新→空フォルダ削除の順で実行。分類はLLM（Claude subagent）で自動判定し、CSV出力でユーザー確認を挟む。

**Tech Stack:** bash（ファイル操作）、git（バックアップ/復元）、Claude subagent（LLM分類）

**Vault Path:** `~/Documents/Obsidian Vault/`（以下 `$VAULT` と表記）

---

### Task 1: git スナップショット保存

全操作の前に現状を復元可能な状態にする。

**Files:**
- Modify: `$VAULT/.git`（コミット追加）

- [ ] **Step 1: 未追跡ファイルを含めて全件ステージング**

```bash
cd ~/Documents/Obsidian\ Vault && git add -A
```

- [ ] **Step 2: スナップショットコミット**

```bash
cd ~/Documents/Obsidian\ Vault && git commit -m "snapshot: before vault restructure (2026-03-28)"
```

Expected: コミット成功。これが復元ポイントになる。

---

### Task 2: 新フォルダ構成の作成

整理先のフォルダを事前に作成する。

**Files:**
- Create: `$VAULT/櫻子/企画/`
- Create: `$VAULT/櫻子/meetings/`
- Create: `$VAULT/バリリンガル/コース/`
- Create: `$VAULT/バリリンガル/マーケティング/`
- Create: `$VAULT/Lカスタム/開発/`
- Create: `$VAULT/ideas/`
- Create: `$VAULT/meetings/`
- Create: `$VAULT/archive/`

- [ ] **Step 1: フォルダ一括作成**

```bash
cd ~/Documents/Obsidian\ Vault && mkdir -p \
  "櫻子/企画" \
  "櫻子/meetings" \
  "バリリンガル/コース" \
  "バリリンガル/マーケティング" \
  "Lカスタム/開発" \
  "ideas" \
  "meetings" \
  "archive"
```

- [ ] **Step 2: 作成確認**

```bash
cd ~/Documents/Obsidian\ Vault && ls -d 櫻子/企画 櫻子/meetings バリリンガル/コース バリリンガル/マーケティング Lカスタム/開発 ideas meetings archive
```

Expected: 8ディレクトリすべてが表示される。

---

### Task 3: 重複フォルダ統合

重複している5つのフォルダを統合先に移動する。

**Files:**
- Move: `$VAULT/アイディアメモ/*` → `$VAULT/ideas/`
- Move: `$VAULT/アイデア/*` → `$VAULT/ideas/`
- Move: `$VAULT/知識/*` → `$VAULT/knowledge/`
- Move: `$VAULT/開発・実装/*` → `$VAULT/Lカスタム/開発/`
- Move: `$VAULT/inbox/*` → `$VAULT/archive/`

- [ ] **Step 1: アイディアメモ → ideas**

```bash
cd ~/Documents/Obsidian\ Vault && mv アイディアメモ/* ideas/ && rmdir アイディアメモ
```

Expected: 2ファイル移動。アイディアメモ/が削除される。

- [ ] **Step 2: アイデア → ideas（サブフォルダ含む）**

```bash
cd ~/Documents/Obsidian\ Vault && mv アイデア/* ideas/ && rmdir アイデア
```

Expected: 20件（サブフォルダinboxchatgpt含む）移動。アイデア/が削除される。

- [ ] **Step 3: 知識 → knowledge**

```bash
cd ~/Documents/Obsidian\ Vault && mv 知識/* knowledge/ && rmdir 知識
```

Expected: 7件（サブフォルダ含む）移動。知識/が削除される。

- [ ] **Step 4: 開発・実装 → Lカスタム/開発**

```bash
cd ~/Documents/Obsidian\ Vault && mv 開発・実装/* Lカスタム/開発/ && rmdir 開発・実装
```

Expected: 7件移動。開発・実装/が削除される。

注意: 開発・実装/内に.wranglerや_deployフォルダがある（git untracked）。これらも移動対象。

- [ ] **Step 5: inbox → archive**

```bash
cd ~/Documents/Obsidian\ Vault && mv inbox/* archive/ 2>/dev/null; rmdir inbox
```

Expected: queue-generatedフォルダがarchive/に移動。inbox/が削除される。

- [ ] **Step 6: 統合結果を確認**

```bash
cd ~/Documents/Obsidian\ Vault && echo "ideas:" && ls ideas/ | wc -l && echo "knowledge:" && ls knowledge/ | wc -l && echo "Lカスタム/開発:" && ls Lカスタム/開発/ | wc -l && echo "削除確認:" && ls -d アイディアメモ アイデア 知識 開発・実装 inbox 2>&1
```

Expected: 各フォルダにファイルあり。削除確認で「No such file or directory」が5つ。

- [ ] **Step 7: コミット**

```bash
cd ~/Documents/Obsidian\ Vault && git add -A && git commit -m "refactor: merge duplicate folders (ideas, knowledge, Lカスタム/開発)"
```

---

### Task 4: YouTube/ を 櫻子/YouTube/ に移動

516件の動画コンテキストを櫻子プロジェクト配下に移動する。

**Files:**
- Move: `$VAULT/YouTube/` → `$VAULT/櫻子/YouTube/`

- [ ] **Step 1: 移動前のファイル数を記録**

```bash
cd ~/Documents/Obsidian\ Vault && find YouTube -name "*.md" | wc -l
```

Expected: 516前後。

- [ ] **Step 2: YouTube/を丸ごと移動**

```bash
cd ~/Documents/Obsidian\ Vault && mv YouTube 櫻子/YouTube
```

- [ ] **Step 3: 移動後の確認**

```bash
cd ~/Documents/Obsidian\ Vault && find 櫻子/YouTube -name "*.md" | wc -l
```

Expected: Step 1と同じ数。

- [ ] **Step 4: コミット**

```bash
cd ~/Documents/Obsidian\ Vault && git add -A && git commit -m "refactor: move YouTube/ under 櫻子/"
```

---

### Task 5: ミーティング文字起こし分類（38件）

LLMで内容を判定し、バリリンガル/出資者会議/Lstep改善/その他に振り分ける。

**Files:**
- Read: `$VAULT/ミーティング文字起こし/*.md`（38件）
- Move: 各ファイルを分類先フォルダへ
- Create: `$VAULT/meeting-classification.csv`（分類結果、ユーザー確認用）

- [ ] **Step 1: ファイル一覧を取得**

```bash
cd ~/Documents/Obsidian\ Vault && ls ミーティング文字起こし/
```

- [ ] **Step 2: サブエージェントで分類実行**

サブエージェントに以下を依頼:
- `ミーティング文字起こし/` の全38ファイルのタイトルと冒頭200文字を読み取る
- 以下のカテゴリに分類:
  - `バリリンガル` → バリリンガル/（オンライン相談含む）
  - `出資者会議` → meetings/
  - `Lstep改善` → Lカスタム/
  - `その他` → meetings/
- CSV形式で出力: `ファイル名,カテゴリ,移動先,判定理由`
- CSVを `$VAULT/meeting-classification.csv` に保存

- [ ] **Step 3: ユーザーにCSV提示・確認を取る**

CSVの内容を表示し、ユーザーに確認を取る。修正があれば反映。

- [ ] **Step 4: 確認済みCSVに従ってファイル移動**

CSVの各行に従い、mvコマンドでファイルを移動先に移動する。

```bash
# 例（実際のファイル名はCSVに基づく）
cd ~/Documents/Obsidian\ Vault
mv "ミーティング文字起こし/バリリンガル相談_xxx.md" "バリリンガル/"
mv "ミーティング文字起こし/出資者会議_xxx.md" "meetings/"
mv "ミーティング文字起こし/Lstep_xxx.md" "Lカスタム/"
```

- [ ] **Step 5: 元フォルダ削除・コミット**

```bash
cd ~/Documents/Obsidian\ Vault && rmdir ミーティング文字起こし 2>/dev/null; git add -A && git commit -m "refactor: classify and move meeting transcripts"
```

- [ ] **Step 6: 分類CSVを削除**

```bash
cd ~/Documents/Obsidian\ Vault && rm meeting-classification.csv && git add -A && git commit -m "chore: remove temporary classification CSV"
```

---

### Task 6: 00_inbox 自動分類（495件）

LLMでAI会話ログを分類し、価値あるものは適切なフォルダへ、低価値はarchiveへ。

**Files:**
- Read: `$VAULT/00_inbox/inboxchatgpt/`（87件）
- Read: `$VAULT/00_inbox/inboxgemi/`（212件）
- Read: `$VAULT/00_inbox/Perplexity/`（196件）
- Create: `$VAULT/inbox-classification.csv`（分類結果）
- Move: 各ファイルを分類先フォルダへ

- [ ] **Step 1: サブエージェント並行で分類（3バッチ）**

3つのサブエージェントを並行起動し、それぞれ担当フォルダを分類:

各サブエージェントの指示:
- 担当フォルダの全ファイルのタイトルと冒頭300文字を読み取る
- 各ファイルにカテゴリと価値スコア（1-5）を付与
  - カテゴリ: 櫻子 / バリリンガル / Lカスタム / AI副業 / knowledge / ideas / archive
  - スコア: 5=非常に有用 / 4=有用 / 3=まあまあ / 2=低価値 / 1=不要
- スコア3以上 → カテゴリのフォルダに振り分け
- スコア2以下 → archive
- CSV形式で出力: `ファイルパス,カテゴリ,スコア,移動先,判定理由`

サブエージェント1: `00_inbox/inboxchatgpt/`（87件）
サブエージェント2: `00_inbox/inboxgemi/`（212件）
サブエージェント3: `00_inbox/Perplexity/`（196件）

各サブエージェントはCSVパートを `$VAULT/inbox-classification-{source}.csv` に保存。

- [ ] **Step 2: CSV結合**

```bash
cd ~/Documents/Obsidian\ Vault && head -1 inbox-classification-inboxchatgpt.csv > inbox-classification.csv && tail -n +2 -q inbox-classification-*.csv >> inbox-classification.csv
```

- [ ] **Step 3: 分類サマリーをユーザーに提示**

```bash
cd ~/Documents/Obsidian\ Vault && echo "=== カテゴリ別件数 ===" && awk -F',' '{print $2}' inbox-classification.csv | sort | uniq -c | sort -rn && echo "=== スコア別件数 ===" && awk -F',' '{print $3}' inbox-classification.csv | sort | uniq -c | sort -rn
```

サマリーを表示し、ユーザーに確認を取る。必要なら個別ファイルも確認可能。

- [ ] **Step 4: 確認済みCSVに従ってファイル移動**

CSVの各行を読み、mvコマンドでファイルを移動先に移動する。サブフォルダ（Packs/、Sources/等）ごと移動。

```bash
# スクリプトで一括移動（CSVのmove_to列を使用）
cd ~/Documents/Obsidian\ Vault
while IFS=',' read -r filepath category score dest reason; do
  [ "$filepath" = "ファイルパス" ] && continue
  mkdir -p "$(dirname "$dest")"
  mv "$filepath" "$dest" 2>/dev/null
done < inbox-classification.csv
```

- [ ] **Step 5: 元フォルダ削除・コミット**

```bash
cd ~/Documents/Obsidian\ Vault && rm -rf 00_inbox && git add -A && git commit -m "refactor: classify and reorganize 495 inbox files"
```

- [ ] **Step 6: 分類CSVを削除**

```bash
cd ~/Documents/Obsidian\ Vault && rm inbox-classification*.csv && git add -A && git commit -m "chore: remove temporary classification CSVs"
```

---

### Task 7: 内部リンク更新

移動したファイルへの `[[]]` リンクを更新する。62ファイルに内部リンクが存在。

**Files:**
- Modify: 内部リンクを含む全mdファイル（62件）

- [ ] **Step 1: 壊れたリンクを検出**

```bash
cd ~/Documents/Obsidian\ Vault && grep -roh '\[\[[^]]*\]\]' --include="*.md" | sed 's/\[\[//;s/\]\]//;s/|.*//' | sort -u | while read link; do
  # .md拡張子がない場合は追加して検索
  target="$link"
  [ ! -f "$target" ] && [ ! -f "$target.md" ] && echo "BROKEN: $link"
done
```

- [ ] **Step 2: 壊れたリンクのパスを更新**

主な更新パターン:
- `[[00_inbox/...]]` → 移動先パスに更新
- `[[YouTube/...]]` → `[[櫻子/YouTube/...]]` に更新
- `[[開発・実装/...]]` → `[[Lカスタム/開発/...]]` に更新
- `[[知識/...]]` → `[[knowledge/...]]` に更新
- `[[アイデア/...]]` → `[[ideas/...]]` に更新

```bash
cd ~/Documents/Obsidian\ Vault
# YouTube → 櫻子/YouTube
find . -name "*.md" -exec sed -i '' 's|\[\[YouTube/|\[\[櫻子/YouTube/|g' {} +
# 開発・実装 → Lカスタム/開発
find . -name "*.md" -exec sed -i '' 's|\[\[開発・実装/|\[\[Lカスタム/開発/|g' {} +
# 知識/ → knowledge/
find . -name "*.md" -exec sed -i '' 's|\[\[知識/|\[\[knowledge/|g' {} +
# アイデア/ → ideas/
find . -name "*.md" -exec sed -i '' 's|\[\[アイデア/|\[\[ideas/|g' {} +
# アイディアメモ/ → ideas/
find . -name "*.md" -exec sed -i '' 's|\[\[アイディアメモ/|\[\[ideas/|g' {} +
```

00_inboxからの移動分は、分類CSVの旧パス→新パスのマッピングを使って更新する。

- [ ] **Step 3: 更新後に壊れたリンクが残っていないか再確認**

Step 1と同じコマンドで再チェック。残っていれば個別対応。

- [ ] **Step 4: コミット**

```bash
cd ~/Documents/Obsidian\ Vault && git add -A && git commit -m "fix: update internal links after folder restructure"
```

---

### Task 8: クリーンアップと最終確認

空フォルダ削除、最終構造の確認。

**Files:**
- Delete: 空になったフォルダすべて

- [ ] **Step 1: 空フォルダを検出・削除**

```bash
cd ~/Documents/Obsidian\ Vault && find . -type d -empty -not -path './.git/*' -not -path './.obsidian/*' -print -delete
```

- [ ] **Step 2: 最終フォルダ構成を確認**

```bash
cd ~/Documents/Obsidian\ Vault && echo "=== トップレベル ===" && ls -d */ && echo "=== ファイル数 ===" && for dir in */; do [ "$dir" = ".git/" ] || [ "$dir" = ".obsidian/" ] && continue; count=$(find "$dir" -name "*.md" 2>/dev/null | wc -l); echo "$count $dir"; done | sort -rn
```

Expected: specの構成通りになっていること。

- [ ] **Step 3: 最終コミット**

```bash
cd ~/Documents/Obsidian\ Vault && git add -A && git commit -m "chore: remove empty folders after vault restructure"
```

- [ ] **Step 4: 整理結果サマリーをユーザーに報告**

以下を報告:
- 整理前後のフォルダ構成比較
- 移動ファイル数
- archiveに移動した件数
- 壊れたリンクの修正数
