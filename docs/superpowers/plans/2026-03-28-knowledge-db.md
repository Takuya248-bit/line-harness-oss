# Knowledge DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ig-auto-posterのD1にコンテンツ生成用の知識DBを追加し、投稿生成時に一次情報を参照して品質を安定させる

**Architecture:** ig-auto-poster-dbにテーブル3つ追加。content-generator.tsの生成フローにDB参照ステップを挿入。既存の~/.secretary/knowledge/から初期データを投入

**Tech Stack:** Cloudflare D1 (SQLite), TypeScript, Hono, Anthropic SDK

**Spec:** `docs/superpowers/specs/2026-03-28-knowledge-db-design.md`

---

## File Structure

```
ig-auto-poster/
├── migrations/
│   └── 0004_knowledge_db.sql      # CREATE: 3テーブル定義
├── src/
│   ├── knowledge.ts               # CREATE: DB検索・取得関数
│   ├── content-generator.ts       # MODIFY: 知識参照を追加
│   └── index.ts                   # 変更なし（env.DBそのまま）
└── scripts/
    └── seed-knowledge.ts          # CREATE: 初期データ投入スクリプト
```

---

### Task 1: D1マイグレーション作成

**Files:**
- Create: `ig-auto-poster/migrations/0004_knowledge_db.sql`

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- 知識エントリ（事実・観察・実例を1件ずつ格納）
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  subcategory TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  source TEXT DEFAULT 'firsthand',
  reliability TEXT DEFAULT 'verified',
  use_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_reliability ON knowledge_entries(reliability);

-- スタイル・ガードレール（文体と禁止事項）
CREATE TABLE IF NOT EXISTS content_guardrails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL,
  platform TEXT DEFAULT 'all',
  rule TEXT NOT NULL,
  example TEXT,
  priority INTEGER DEFAULT 5
);

-- テーマ-知識マッピング（定番の組み合わせ）
CREATE TABLE IF NOT EXISTS theme_knowledge_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme TEXT NOT NULL,
  knowledge_entry_id INTEGER NOT NULL,
  relevance INTEGER DEFAULT 5,
  FOREIGN KEY (knowledge_entry_id) REFERENCES knowledge_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_theme_map_theme ON theme_knowledge_map(theme);
```

- [ ] **Step 2: ローカルD1に適用して確認**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --local --file=migrations/0004_knowledge_db.sql`
Expected: テーブル3つが作成される

- [ ] **Step 3: コミット**

```bash
git add ig-auto-poster/migrations/0004_knowledge_db.sql
git commit -m "feat(knowledge-db): add migration for knowledge_entries, content_guardrails, theme_knowledge_map"
```

---

### Task 2: 知識DB検索モジュール作成

**Files:**
- Create: `ig-auto-poster/src/knowledge.ts`

- [ ] **Step 1: knowledge.tsを作成**

```typescript
export interface KnowledgeEntry {
  id: number;
  category: string;
  subcategory: string | null;
  title: string;
  content: string;
  tags: string | null;
  source: string;
  reliability: string;
  use_count: number;
}

export interface Guardrail {
  rule_type: string;
  rule: string;
  example: string | null;
  priority: number;
}

/**
 * テーマに関連する知識エントリを取得する。
 * verified優先、use_count昇順（使用頻度が低いものを優先して重複防止）。
 */
export async function fetchKnowledge(
  db: D1Database,
  categories: string[],
  tags: string[],
  limit: number = 8,
): Promise<KnowledgeEntry[]> {
  if (categories.length === 0) return [];

  const placeholders = categories.map(() => "?").join(", ");
  let query = `
    SELECT id, category, subcategory, title, content, tags, source, reliability, use_count
    FROM knowledge_entries
    WHERE category IN (${placeholders})
    ORDER BY
      CASE reliability WHEN 'verified' THEN 0 WHEN 'anecdotal' THEN 1 ELSE 2 END,
      use_count ASC
    LIMIT ?
  `;
  const params: (string | number)[] = [...categories, limit];

  const result = await db.prepare(query).bind(...params).all<KnowledgeEntry>();

  // tagsフィルタ（SQLiteのLIKEでは複数タグのOR検索が煩雑なのでJS側で）
  if (tags.length > 0) {
    const filtered = result.results.filter((entry) =>
      tags.some((tag) => entry.tags?.includes(tag))
    );
    return filtered.length > 0 ? filtered : result.results;
  }

  return result.results;
}

/**
 * プラットフォーム向けのガードレールを取得する。
 */
export async function fetchGuardrails(
  db: D1Database,
  platform: string,
): Promise<Guardrail[]> {
  const result = await db
    .prepare(
      `SELECT rule_type, rule, example, priority
       FROM content_guardrails
       WHERE platform IN (?, 'all')
       ORDER BY priority DESC`
    )
    .bind(platform)
    .all<Guardrail>();
  return result.results;
}

/**
 * 使用したエントリのuse_countをインクリメントする。
 */
export async function incrementUseCount(
  db: D1Database,
  entryIds: number[],
): Promise<void> {
  for (const id of entryIds) {
    await db
      .prepare("UPDATE knowledge_entries SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?")
      .bind(id)
      .run();
  }
}

/**
 * 知識エントリとガードレールをプロンプト用テキストに整形する。
 */
export function formatKnowledgeForPrompt(
  entries: KnowledgeEntry[],
  guardrails: Guardrail[],
): string {
  if (entries.length === 0 && guardrails.length === 0) return "";

  const parts: string[] = [];

  if (entries.length > 0) {
    parts.push("【参考情報（一次情報・事実ベース）】");
    for (const e of entries) {
      parts.push(`- [${e.category}/${e.subcategory ?? "general"}] ${e.title}: ${e.content}`);
    }
  }

  if (guardrails.length > 0) {
    parts.push("\n【表現ルール】");
    for (const g of guardrails) {
      const ex = g.example ? `（例: ${g.example}）` : "";
      parts.push(`- [${g.rule_type}] ${g.rule}${ex}`);
    }
  }

  return parts.join("\n");
}
```

- [ ] **Step 2: tsc確認**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: 0エラー

- [ ] **Step 3: コミット**

```bash
git add ig-auto-poster/src/knowledge.ts
git commit -m "feat(knowledge-db): add knowledge query and formatting module"
```

---

### Task 3: content-generator.tsに知識DB参照を統合

**Files:**
- Modify: `ig-auto-poster/src/content-generator.ts`

- [ ] **Step 1: importを追加**

ファイル先頭に追加:

```typescript
import { fetchKnowledge, fetchGuardrails, incrementUseCount, formatKnowledgeForPrompt } from "./knowledge";
```

- [ ] **Step 2: テンプレタイプ→カテゴリのマッピングを追加**

`SYSTEM_PROMPT` の下に追加:

```typescript
/** テンプレタイプに関連するknowledge_entriesのcategoryをマッピング */
const TYPE_CATEGORIES: Record<ContentType, string[]> = {
  list: ["english_learning"],
  quiz: ["english_learning"],
  before_after: ["english_learning"],
  situation: ["english_learning", "bali_area"],
  story: ["barilingual", "evidence"],
  student_mistake: ["english_learning", "evidence"],
  bali_report: ["bali_area", "barilingual"],
};

const TYPE_TAGS: Record<ContentType, string[]> = {
  list: ["phrases", "vocabulary"],
  quiz: ["grammar", "vocabulary"],
  before_after: ["natural_english", "mistakes"],
  situation: ["speaking", "real_scene"],
  story: ["student_change", "experience"],
  student_mistake: ["beginner_mistakes", "common_errors"],
  bali_report: ["cafe", "lifestyle", "location"],
};
```

- [ ] **Step 3: generateContent関数を修正**

`generateContent`関数内、`const prompt = buildPromptForType(...)` の直前に知識取得を追加し、システムプロンプトに注入:

```typescript
export async function generateContent(
  apiKey: string,
  db: D1Database,
): Promise<{ content: ContentItem; caption: string }> {
  const client = new Anthropic({ apiKey });

  const templateType = TEMPLATE_TYPES[Math.floor(Math.random() * TEMPLATE_TYPES.length)];

  const pastRows = await db
    .prepare("SELECT json_extract(content_json, '$.title') as title FROM generated_content ORDER BY id DESC LIMIT 50")
    .all<{ title: string }>();
  const pastThemes = pastRows.results.map((r) => r.title).filter(Boolean);

  const maxIdRow = await db
    .prepare("SELECT COALESCE(MAX(id), 1000) + 1 as next_id FROM generated_content")
    .first<{ next_id: number }>();
  const nextId = maxIdRow?.next_id ?? 1001;

  // 知識DB参照
  const categories = TYPE_CATEGORIES[templateType] ?? [];
  const tags = TYPE_TAGS[templateType] ?? [];
  const entries = await fetchKnowledge(db, categories, tags);
  const guardrails = await fetchGuardrails(db, "ig");
  const knowledgeContext = formatKnowledgeForPrompt(entries, guardrails);

  const systemPrompt = knowledgeContext
    ? `${SYSTEM_PROMPT}\n\n${knowledgeContext}`
    : SYSTEM_PROMPT;

  const prompt = buildPromptForType(templateType, pastThemes);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude API returned no text content");
  }

  const raw = JSON.parse(textBlock.text);
  const content = parseResponse(templateType, raw, nextId);
  const caption = generateCaption(content.title);

  await db
    .prepare("INSERT INTO generated_content (template_type, content_json, caption, status) VALUES (?, ?, ?, 'pending_review')")
    .bind(templateType, JSON.stringify(content), caption)
    .run();

  // 使用したエントリのカウントをインクリメント
  if (entries.length > 0) {
    await incrementUseCount(db, entries.map((e) => e.id));
  }

  return { content, caption };
}
```

- [ ] **Step 4: tsc確認**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: 0エラー

- [ ] **Step 5: コミット**

```bash
git add ig-auto-poster/src/content-generator.ts
git commit -m "feat(knowledge-db): integrate knowledge DB into content generation flow"
```

---

### Task 4: 初期データ投入スクリプト作成

**Files:**
- Create: `ig-auto-poster/scripts/seed-knowledge.ts`

- [ ] **Step 1: シードスクリプトを作成**

`~/.secretary/knowledge/` と既存の一次情報から、knowledge_entries と content_guardrails にINSERTするSQLを生成するスクリプト。

```typescript
/**
 * 初期データ投入スクリプト
 * 実行: npx wrangler d1 execute ig-auto-poster-db --local --file=scripts/seed-knowledge.sql
 * 本番: npx wrangler d1 execute ig-auto-poster-db --file=scripts/seed-knowledge.sql
 */

// このファイルはSQLを直接生成する代わりに、seed-knowledge.sqlを手動で作成する際のリファレンス

// === カテゴリ体系 ===
// bali_area: バリ島エリア情報（subcategory: canggu, ubud, seminyak, kuta, kerobokan）
// study_faq: バリ留学FAQ（subcategory: beginner_ok, one_week, dorm_life, making_friends）
// barilingual: バリリンガル固有（subcategory: mantooman, dorm, teachers, student_types, common_worries）
// english_learning: 英語学習（subcategory: beginner_mistakes, speaking, aizuchi, paraphrase, natural_english）
// evidence: 実例・エピソード（subcategory: first_3days, one_week_change, real_scene, outside_class）
```

- [ ] **Step 2: seed SQLファイルを作成**

`ig-auto-poster/scripts/seed-knowledge.sql` に初期データを作成。
`~/.secretary/knowledge/firsthand-materials-lcustom.md` と既存知識を分解してエントリ化する。

以下は初期データの骨格（実行時にオーナーの一次情報で拡充する）:

```sql
-- === バリ島エリア情報 ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('bali_area', 'canggu', 'チャングーの雰囲気', 'サーファーとデジタルノマドが多い。おしゃれなカフェが密集。欧米人が多く英語環境が自然にできる', 'lifestyle,cafe,nomad', 'firsthand', 'verified'),
('bali_area', 'canggu', 'チャングーのカフェ学習環境', 'WiFi・電源完備のカフェが徒歩圏に10軒以上。Crate Cafe、Satu Satu等。授業後の自習に最適', 'cafe,study,wifi', 'firsthand', 'verified'),
('bali_area', 'ubud', 'ウブドの雰囲気', '田んぼとアートの街。静かで集中しやすい。ヨガリトリートが多く、自己成長志向の人が集まる', 'lifestyle,quiet,art', 'firsthand', 'verified'),
('bali_area', 'seminyak', 'スミニャックの特徴', 'ビーチクラブとショッピングの街。夜遊びスポットが多く、学習集中には向かないが週末の息抜きに最適', 'nightlife,shopping,beach', 'firsthand', 'verified');

-- === バリ留学FAQ ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('study_faq', 'beginner_ok', '英語初心者でも大丈夫か', '生徒の7割が初心者スタート。マンツーマンなので自分のペースで進められる。先生が日本人の苦手ポイントを熟知している', 'beginner,mantooman', 'firsthand', 'verified'),
('study_faq', 'one_week', '1週間で意味があるか', '1週間でも「英語で話す恐怖心がなくなった」という声が最多。完璧な英語力ではなく「話す自信」が最大の成果', 'short_term,confidence', 'student_feedback', 'verified'),
('study_faq', 'dorm_life', '寮生活はどうか', '個室あり。食事は朝昼付き。他の生徒と自然に交流できる環境。夜は自由時間で自習やバリ散策', 'dorm,food,community', 'firsthand', 'verified'),
('study_faq', 'making_friends', '友達はできるか', '少人数制なので生徒同士の距離が近い。共通の「英語を学びたい」目標があるので打ち解けやすい', 'community,friends', 'student_feedback', 'verified');

-- === バリリンガル固有情報 ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('barilingual', 'mantooman', 'マンツーマン授業の特徴', '1日5時間のマンツーマン。グループ授業なし。自分の弱点に集中できる。先生の変更も柔軟に対応', 'mantooman,curriculum', 'firsthand', 'verified'),
('barilingual', 'teachers', '講師の特徴', 'バリ人講師。日本人の英語の癖を理解している。フレンドリーで質問しやすい雰囲気', 'teachers,friendly', 'firsthand', 'verified'),
('barilingual', 'common_worries', 'よくある不安: 治安', 'バリ島は東南アジアの中でも治安が良い観光地。学校周辺は特に安全。ただし夜道の一人歩きは避ける', 'safety,worry', 'firsthand', 'verified'),
('barilingual', 'student_types', '生徒の年齢層', '20-40代が中心。社会人の転職前・リフレッシュ休暇が多い。大学生の春休み・夏休みも', 'demographics,age', 'firsthand', 'verified');

-- === 英語学習ナレッジ ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('english_learning', 'beginner_mistakes', '日本人の典型的ミス: 直訳', '"I am boring"（退屈させる人）と"I am bored"（退屈している）の混同。感情の-ed/-ing形容詞は最頻出ミス', 'grammar,mistakes,common_errors', 'firsthand', 'verified'),
('english_learning', 'speaking', 'スピーキング上達のコツ', '完璧な文法より「伝わる英語」を優先。短い文で区切る。相手の表現を真似る（シャドーイング的会話）', 'speaking,tips,natural_english', 'firsthand', 'verified'),
('english_learning', 'aizuchi', '英語の相づち', '"I see" "That makes sense" "Right" "Exactly"。日本語の「うんうん」に相当。相づちがあると会話が自然に続く', 'aizuchi,conversation,phrases', 'firsthand', 'verified'),
('english_learning', 'paraphrase', '言い換えテクニック', '知らない単語は説明で乗り切る。"refrigerator"が出なければ"the cold box in the kitchen"。これが実践英語', 'paraphrase,speaking,vocabulary', 'firsthand', 'verified'),
('english_learning', 'natural_english', '自然な英語表現', '"How are you?"への返答は"I am fine"より"Pretty good!" "Not bad!"が自然。教科書英語と実際の乖離が多い', 'natural_english,phrases,real', 'firsthand', 'verified');

-- === 実例・エピソード ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('evidence', 'first_3days', '最初の3日間あるある', '初日は緊張で単語も出ない。2日目は先生のペースに慣れ始める。3日目に「あれ、少し聞き取れてる」と気づく', 'experience,beginner,student_change', 'student_feedback', 'verified'),
('evidence', 'one_week_change', '1週間後の変化', 'カフェで注文を英語でする自信がつく。"Can I get..."が自然に出る。先生以外の外国人にも話しかけられるようになる', 'change,confidence,real_scene', 'student_feedback', 'verified'),
('evidence', 'real_scene', 'バリで英語を使う場面', 'カフェ注文、タクシー交渉、サーフィンレッスン、レストランでの会話。日常が全て英語の実践場', 'real_scene,daily,practice', 'firsthand', 'verified'),
('evidence', 'outside_class', '授業外での変化', '寮で他の生徒と英語で雑談。ビーチで外国人と友達になる。インスタのDMを英語で返せるようになった', 'outside_class,community,growth', 'student_feedback', 'verified');

-- === ガードレール（IG用） ===
INSERT INTO content_guardrails (rule_type, platform, rule, example, priority) VALUES
('tone', 'ig', '柔らかく親しみやすい口調。断定しすぎない', '良: 「〜かも！」「〜してみて」 悪: 「〜すべき」「〜しなさい」', 9),
('prohibition', 'ig', '"ネイティブは〜"を多用しない。地域・個人差がある', '悪: 「ネイティブは絶対こう言います」', 8),
('prohibition', 'ig', '文化を主語大きくしすぎない', '悪: 「外国人は全員〜」「日本人は〜できない」', 8),
('caution', 'ig', 'エビデンスが弱い主張を断定しない', '悪: 「1週間で英語がペラペラに」 良: 「1週間で英語を話す自信がつく」', 9),
('tone', 'ig', 'テンプレ感を避け、具体的な場所名・シチュエーションを入れる', '良: 「チャングーのカフェで注文するとき」 悪: 「海外のお店で」', 7),
('expression', 'ig', '誇大表現を避ける。数字は根拠のあるものだけ使う', '悪: 「受講者の99%が満足」（根拠なし）', 9),
('prohibition', 'all', 'LINE登録の直接的なCTAは入れない。コメント誘導のみ', '良: 「好きな英単語をコメントで教えてね」', 10);
```

- [ ] **Step 3: ローカルD1に投入して確認**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --local --file=scripts/seed-knowledge.sql`
Expected: INSERT成功

- [ ] **Step 4: データ確認**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --local --command="SELECT category, COUNT(*) as cnt FROM knowledge_entries GROUP BY category"`
Expected: bali_area 4, study_faq 4, barilingual 4, english_learning 5, evidence 4 = 計21件

- [ ] **Step 5: コミット**

```bash
git add ig-auto-poster/scripts/
git commit -m "feat(knowledge-db): add seed data script with 21 knowledge entries and 7 guardrails"
```

---

### Task 5: 本番D1に適用

- [ ] **Step 1: マイグレーションを本番に適用**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --file=migrations/0004_knowledge_db.sql`

- [ ] **Step 2: シードデータを本番に投入**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --file=scripts/seed-knowledge.sql`

- [ ] **Step 3: 本番データ確認**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --command="SELECT category, COUNT(*) as cnt FROM knowledge_entries GROUP BY category"`

- [ ] **Step 4: Workerをデプロイ**

Run: `cd ig-auto-poster && npx wrangler deploy`
Expected: デプロイ成功、knowledge.tsが含まれる

- [ ] **Step 5: push**

```bash
git push origin main
```

---

### Task 6: 動作確認

- [ ] **Step 1: ローカルでコンテンツ生成テスト**

Run: `cd ig-auto-poster && npx wrangler dev`
Cronトリガーを手動実行して、生成されたコンテンツのシステムプロンプトに知識DB情報が含まれていることを確認。

- [ ] **Step 2: ログで知識注入を確認**

生成されたコンテンツが以前より具体的な情報（エリア名、具体的なシチュエーション等）を含んでいることを目視確認。

- [ ] **Step 3: use_countの更新確認**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --local --command="SELECT id, title, use_count FROM knowledge_entries WHERE use_count > 0"`
Expected: 生成に使用されたエントリのuse_countが1以上
