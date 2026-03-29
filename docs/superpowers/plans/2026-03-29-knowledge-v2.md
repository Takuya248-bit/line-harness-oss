# Knowledge DB v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 知識DBのカテゴリを8カテゴリ（知識の性質ベース）に再設計し、権威ソース14件からの二次情報自動収集を週次cronで実行する

**Architecture:** Phase A: D1マイグレーションで既存データを新カテゴリに移行し、全参照コード(IG/X/SEO)を更新。Phase B: GH Actionsで週次実行するNode.jsスクリプトがURLリストをfetch→Haikuで事実抽出→POST /api/knowledgeで投入

**Tech Stack:** Cloudflare D1, Node.js, Anthropic Haiku API, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-03-29-knowledge-v2-design.md`

---

## File Structure

```
ig-auto-poster/
├── migrations/
│   └── 0005_knowledge_v2.sql           # CREATE: カテゴリ移行+source_url追加
├── src/
│   ├── index.ts                         # MODIFY: POST /api/knowledge にsource_url追加
│   ├── knowledge.ts                     # 変更なし
│   └── content-generator.ts             # MODIFY: TYPE_CATEGORIES/TYPE_TAGSを新カテゴリに
├── scripts/
│   └── seed-knowledge-v2.sql            # CREATE: 既存データを新カテゴリにUPDATE

knowledge-collector/                      # CREATE: 新規プロジェクト（GH Actions用）
├── package.json
├── src/
│   ├── watchlist.json                   # CREATE: 定点観測URLリスト
│   ├── collect.js                       # CREATE: メイン収集スクリプト
│   └── extract.js                       # CREATE: Haiku抽出+投入
├── .github/
│   └── workflows/
│       └── collect-knowledge.yml        # CREATE: 週次cron workflow
└── .env.example

x-auto-poster/src/
└── knowledge.js                         # MODIFY: getKnowledgeCategories更新

apps/seo-writer/src/
└── knowledge.ts                         # MODIFY: fetchKnowledgeForSEO更新

.claude/rules/
└── knowledge-accumulation.md            # MODIFY: カテゴリ表を新8カテゴリに
```

---

### Task 1: D1マイグレーション（カテゴリ移行+source_url追加）

**Files:**
- Create: `ig-auto-poster/migrations/0005_knowledge_v2.sql`
- Create: `ig-auto-poster/scripts/seed-knowledge-v2.sql`

- [ ] **Step 1: マイグレーションSQL作成**

```sql
-- source_urlカラム追加
ALTER TABLE knowledge_entries ADD COLUMN source_url TEXT;
```

- [ ] **Step 2: 既存データのカテゴリ移行SQLを作成**

`ig-auto-poster/scripts/seed-knowledge-v2.sql`:

```sql
-- bali_area → locale
UPDATE knowledge_entries SET category = 'locale', subcategory = 'bali_' || subcategory WHERE category = 'bali_area';

-- study_faq → people
UPDATE knowledge_entries SET category = 'people', subcategory = 'barilingual_faq' WHERE category = 'study_faq';

-- barilingual → case (事例系) or people (顧客の声系)
UPDATE knowledge_entries SET category = 'people', subcategory = 'barilingual_student' WHERE category = 'barilingual' AND subcategory IN ('common_worries', 'student_types');
UPDATE knowledge_entries SET category = 'case', subcategory = 'barilingual' WHERE category = 'barilingual' AND subcategory NOT IN ('common_worries', 'student_types');

-- english_learning → method
UPDATE knowledge_entries SET category = 'method', subcategory = 'english_' || subcategory WHERE category = 'english_learning';

-- evidence → case
UPDATE knowledge_entries SET category = 'case', subcategory = 'barilingual_' || subcategory WHERE category = 'evidence';
```

- [ ] **Step 3: ローカルD1に適用**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --local --file=migrations/0005_knowledge_v2.sql && npx wrangler d1 execute ig-auto-poster-db --local --file=scripts/seed-knowledge-v2.sql`

- [ ] **Step 4: 移行確認**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --local --command="SELECT category, COUNT(*) as cnt FROM knowledge_entries GROUP BY category ORDER BY category"`
Expected: case, locale, method, people の4カテゴリに再分類されている

- [ ] **Step 5: ガードレールのplatformを確認（変更不要）**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --local --command="SELECT rule_type, platform, rule FROM content_guardrails"`
Expected: ガードレールはカテゴリに依存しないので変更不要

- [ ] **Step 6: コミット**

```bash
git add ig-auto-poster/migrations/0005_knowledge_v2.sql ig-auto-poster/scripts/seed-knowledge-v2.sql
git commit -m "feat(knowledge-db): v2 migration - category redesign + source_url column"
```

---

### Task 2: POST /api/knowledge にsource_url対応追加

**Files:**
- Modify: `ig-auto-poster/src/index.ts`

- [ ] **Step 1: POST /api/knowledge のbody型にsource_urlを追加**

index.tsのPOST /api/knowledgeハンドラーで、bodyの型定義を変更:

```typescript
      if (request.method === "POST" && url.pathname === "/api/knowledge") {
        const body = await request.json() as {
          category: string;
          subcategory?: string;
          title: string;
          content: string;
          tags?: string;
          source?: string;
          reliability?: string;
          source_url?: string;
        };

        if (!body.category || !body.title || !body.content) {
          return json({ error: "category, title, content are required" }, 400);
        }

        const result = await env.DB
          .prepare(
            `INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability, source_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            body.category,
            body.subcategory || null,
            body.title,
            body.content,
            body.tags || null,
            body.source || "auto",
            body.reliability || "unverified",
            body.source_url || null
          )
          .run();

        return json({ success: true, id: result.meta.last_row_id });
      }
```

- [ ] **Step 2: tsc確認**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: 0エラー

- [ ] **Step 3: コミット**

```bash
git add ig-auto-poster/src/index.ts
git commit -m "feat(knowledge-db): add source_url support to POST /api/knowledge"
```

---

### Task 3: content-generator.tsのカテゴリマッピング更新

**Files:**
- Modify: `ig-auto-poster/src/content-generator.ts`

- [ ] **Step 1: TYPE_CATEGORIESを新カテゴリに更新**

```typescript
const TYPE_CATEGORIES: Record<ContentType, string[]> = {
  list: ["method"],
  quiz: ["method"],
  before_after: ["method"],
  situation: ["method", "locale"],
  story: ["case", "people"],
  student_mistake: ["method", "case"],
  bali_report: ["locale", "case"],
};

const TYPE_TAGS: Record<ContentType, string[]> = {
  list: ["english_phrases", "english_vocabulary"],
  quiz: ["english_grammar", "english_vocabulary"],
  before_after: ["english_natural", "english_mistakes"],
  situation: ["english_speaking", "bali_cafe"],
  story: ["barilingual_student", "experience"],
  student_mistake: ["english_beginner", "common_errors"],
  bali_report: ["bali_area", "bali_cafe", "bali_lifestyle"],
};
```

- [ ] **Step 2: tsc確認**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: 0エラー

- [ ] **Step 3: コミット**

```bash
git add ig-auto-poster/src/content-generator.ts
git commit -m "feat(knowledge-db): update category mappings to v2 schema"
```

---

### Task 4: X auto-poster / SEO writer のカテゴリ更新

**Files:**
- Modify: `/Users/kimuratakuya/x-auto-poster/src/knowledge.js`
- Modify: `/Users/kimuratakuya/line-harness/apps/seo-writer/src/knowledge.ts`

- [ ] **Step 1: x-auto-poster のgetKnowledgeCategories更新**

```javascript
export function getKnowledgeCategories(accountConfig) {
  const handle = accountConfig.handle || "";

  if (handle.includes("bali") || handle.includes("lingirl")) {
    return ["locale", "method", "case", "people"];
  }

  if (handle.includes("linecustom") || handle.includes("eru")) {
    return ["technology", "method", "case"];
  }

  return [];
}
```

- [ ] **Step 2: seo-writer のfetchKnowledgeForSEO更新**

```typescript
export async function fetchKnowledgeForSEO(
  db: D1Database,
  keyword: string,
): Promise<{ entries: KnowledgeEntry[]; guardrails: Guardrail[] }> {
  const categories: string[] = [];
  const kw = keyword.toLowerCase();

  if (kw.includes("バリ") || kw.includes("留学") || kw.includes("英語")) {
    categories.push("locale", "method", "case", "people");
  }
  if (kw.includes("line") || kw.includes("公式") || kw.includes("crm")) {
    categories.push("technology", "method", "case");
  }

  if (categories.length === 0) {
    return { entries: [], guardrails: [] };
  }

  const unique = [...new Set(categories)];
  const placeholders = unique.map(() => "?").join(", ");
  const entries = await db
    .prepare(
      `SELECT id, category, subcategory, title, content, tags
       FROM knowledge_entries
       WHERE category IN (${placeholders})
       ORDER BY CASE reliability WHEN 'verified' THEN 0 ELSE 1 END, use_count ASC
       LIMIT 15`
    )
    .bind(...unique)
    .all<KnowledgeEntry>();

  const guardrails = await db
    .prepare(
      `SELECT rule_type, rule, example, priority
       FROM content_guardrails
       WHERE platform IN ('seo', 'all')
       ORDER BY priority DESC`
    )
    .all<Guardrail>();

  return {
    entries: entries.results,
    guardrails: guardrails.results,
  };
}
```

- [ ] **Step 3: 構文確認**

Run: `cd /Users/kimuratakuya/x-auto-poster && node -c src/knowledge.js`
Run: `cd /Users/kimuratakuya/line-harness/apps/seo-writer && npx tsc --noEmit`

- [ ] **Step 4: コミット（両リポジトリ）**

```bash
cd /Users/kimuratakuya/x-auto-poster && git add src/knowledge.js && git commit -m "feat: update knowledge categories to v2 schema"
cd /Users/kimuratakuya/line-harness && git add apps/seo-writer/src/knowledge.ts && git commit -m "feat(seo-writer): update knowledge categories to v2 schema"
```

---

### Task 5: knowledge-accumulation.mdのカテゴリ表更新

**Files:**
- Modify: `/Users/kimuratakuya/line-harness/.claude/rules/knowledge-accumulation.md`

- [ ] **Step 1: カテゴリ表を新8カテゴリに差し替え**

カテゴリ体系セクションを以下に置換:

```markdown
## カテゴリ体系（知識の性質ベース、事業非依存）

| category | 何の知識か | subcategory例 |
|----------|-----------|---------------|
| market | 市場・統計・トレンド・業界動向 | study_abroad, line_market, ai_market, sns_trend |
| technology | 技術・ツール・API・PF仕様 | line_api, cloudflare, llm, lstep, playwright |
| method | ノウハウ・手法・ベストプラクティス | seo, english_speaking, line_automation, content_creation |
| case | 事例・実績・Before/After | barilingual_student, lcustom_client, competitor |
| locale | 地域・生活・文化・制度 | bali_area, bali_visa, bali_cost, bali_cafe |
| people | 顧客の声・FAQ・行動パターン | barilingual_student, lcustom_client, common_worry |
| ai_news | AI・LLM・自動化の最新動向 | model_release, api_pricing, use_case |
| regulation | 法律・規制・ガイドライン | tokushoho, keihin, privacy, platform_tos |
```

- [ ] **Step 2: コミット**

```bash
git add .claude/rules/knowledge-accumulation.md
git commit -m "docs: update knowledge-accumulation rule to v2 categories"
```

---

### Task 6: 本番D1適用 + 全デプロイ

- [ ] **Step 1: 本番D1にマイグレーション適用**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --file=migrations/0005_knowledge_v2.sql`

- [ ] **Step 2: 本番D1にカテゴリ移行適用**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --file=scripts/seed-knowledge-v2.sql`

- [ ] **Step 3: 本番データ確認**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --command="SELECT category, COUNT(*) as cnt FROM knowledge_entries GROUP BY category ORDER BY category"`

- [ ] **Step 4: ig-auto-poster Workerデプロイ**

Run: `cd ig-auto-poster && npx wrangler deploy`

- [ ] **Step 5: API確認**

Run: `curl -s https://ig-auto-poster.archbridge24.workers.dev/api/knowledge | python3 -m json.tool`
Expected: 新カテゴリ（case, locale, method, people）でカウントが返る

- [ ] **Step 6: 全push**

```bash
cd /Users/kimuratakuya/line-harness && git push origin main
cd /Users/kimuratakuya/x-auto-poster && git push origin main
```

---

### Task 7: 知識収集スクリプト作成

**Files:**
- Create: `knowledge-collector/package.json`
- Create: `knowledge-collector/src/watchlist.json`
- Create: `knowledge-collector/src/collect.js`
- Create: `knowledge-collector/src/extract.js`
- Create: `knowledge-collector/.env.example`

- [ ] **Step 1: プロジェクト初期化**

`knowledge-collector/package.json`:
```json
{
  "name": "knowledge-collector",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "collect": "node src/collect.js"
  }
}
```

`knowledge-collector/.env.example`:
```
ANTHROPIC_API_KEY=sk-ant-...
KNOWLEDGE_API_URL=https://ig-auto-poster.archbridge24.workers.dev/api/knowledge
```

- [ ] **Step 2: watchlist.json作成**

`knowledge-collector/src/watchlist.json`:
```json
[
  {
    "url": "https://www.linebiz.com/jp/news/",
    "category": "technology",
    "subcategory": "line_api",
    "extract": "LINE公式アカウントの新機能・料金変更・仕様変更"
  },
  {
    "url": "https://developers.line.biz/ja/news/",
    "category": "technology",
    "subcategory": "line_api",
    "extract": "Messaging APIの変更点・新機能"
  },
  {
    "url": "https://blog.google/technology/ai/",
    "category": "ai_news",
    "subcategory": "model_release",
    "extract": "Google AI/Geminiの新モデル・機能リリース"
  },
  {
    "url": "https://www.anthropic.com/news",
    "category": "ai_news",
    "subcategory": "model_release",
    "extract": "Claude/Anthropicの新モデル・API変更・料金"
  },
  {
    "url": "https://openai.com/blog",
    "category": "ai_news",
    "subcategory": "model_release",
    "extract": "OpenAI/GPTの新モデル・機能・料金"
  },
  {
    "url": "https://developers.googleblog.com/en/search/",
    "category": "method",
    "subcategory": "seo",
    "extract": "Google検索アルゴリズム変更・SEOガイドライン"
  },
  {
    "url": "https://about.instagram.com/blog",
    "category": "market",
    "subcategory": "sns_trend",
    "extract": "Instagram機能変更・アルゴリズム・トレンド"
  },
  {
    "url": "https://blog.twitter.com/",
    "category": "market",
    "subcategory": "sns_trend",
    "extract": "X/Twitter機能変更・ポリシー"
  },
  {
    "url": "https://www.bali.go.id/en",
    "category": "locale",
    "subcategory": "bali_visa",
    "extract": "バリ島ビザ・入国規制・観光政策の変更"
  },
  {
    "url": "https://www.id.emb-japan.go.jp/itpr_ja/consular_dps.html",
    "category": "locale",
    "subcategory": "bali_visa",
    "extract": "在デンパサル総領事館の安全情報・渡航注意"
  },
  {
    "url": "https://jaos.or.jp/data/",
    "category": "market",
    "subcategory": "study_abroad",
    "extract": "日本人の留学者数推移・人気国・トレンド"
  },
  {
    "url": "https://www.ef.com/wwen/epi/",
    "category": "market",
    "subcategory": "study_abroad",
    "extract": "EF EPI 各国英語力ランキング・日本の順位"
  },
  {
    "url": "https://linestep.net/news",
    "category": "technology",
    "subcategory": "lstep",
    "extract": "Lstepの新機能・仕様変更・料金改定"
  },
  {
    "url": "https://blog.cloudflare.com/",
    "category": "technology",
    "subcategory": "cloudflare",
    "extract": "Workers/D1/R2の新機能・料金変更"
  }
]
```

- [ ] **Step 3: extract.js作成（Haiku抽出+投入）**

`knowledge-collector/src/extract.js`:
```javascript
/**
 * extract.js - Haiku で事実を抽出し、知識DBに投入する
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KNOWLEDGE_API_URL = process.env.KNOWLEDGE_API_URL || "https://ig-auto-poster.archbridge24.workers.dev/api/knowledge";

/**
 * Haiku にWebページ内容から事実を抽出させる
 */
export async function extractFacts(pageContent, extractInstruction) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `以下のWebページから事実・数字・変更点を抽出してください。
抽出対象: ${extractInstruction}

ルール:
- 事実と数字のみ。意見・推測は除外
- 日付がある情報は日付を含める
- 新しい情報・変更があったものだけ抽出
- 抽出するものがなければ空配列を返す
- JSON配列で返す（JSON以外のテキスト不要）: [{"title": "短いタイトル", "content": "事実の説明", "tags": "tag1,tag2"}]

Webページ内容:
${pageContent.slice(0, 4000)}`
      }],
    }),
  });

  if (!response.ok) {
    console.error(`[extract] Haiku API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const text = data.content[0].text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    return JSON.parse(match[0]);
  } catch {
    console.error("[extract] JSON parse error");
    return [];
  }
}

/**
 * 知識DBに投入（重複チェック付き）
 */
export async function insertKnowledge(entry, category, subcategory, sourceUrl) {
  const response = await fetch(KNOWLEDGE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category,
      subcategory,
      title: entry.title,
      content: entry.content,
      tags: entry.tags || "",
      source: "research",
      reliability: "unverified",
      source_url: sourceUrl,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[insert] API error: ${err}`);
    return false;
  }
  return true;
}
```

- [ ] **Step 4: collect.js作成（メイン収集スクリプト）**

`knowledge-collector/src/collect.js`:
```javascript
/**
 * collect.js - 定点観測URLリストからWebページを取得し、事実を抽出・投入する
 *
 * 使い方: ANTHROPIC_API_KEY=... node src/collect.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractFacts, insertKnowledge } from "./extract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watchlist = JSON.parse(fs.readFileSync(path.join(__dirname, "watchlist.json"), "utf-8"));

async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KnowledgeCollector/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.log(`[fetch] ${url} → ${response.status}`);
      return null;
    }
    const html = await response.text();
    // 簡易HTMLテキスト抽出（タグ除去）
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
               .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
               .replace(/<[^>]+>/g, " ")
               .replace(/\s+/g, " ")
               .trim();
  } catch (err) {
    console.log(`[fetch] ${url} → ${err.message}`);
    return null;
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required");
    process.exit(1);
  }

  console.log(`[collect] ${watchlist.length} URLs to process`);
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const item of watchlist) {
    console.log(`[collect] ${item.url}`);
    const content = await fetchPage(item.url);
    if (!content) {
      console.log(`[collect] → スキップ（取得失敗）`);
      totalSkipped++;
      continue;
    }

    const facts = await extractFacts(content, item.extract);
    if (facts.length === 0) {
      console.log(`[collect] → 新規情報なし`);
      continue;
    }

    for (const fact of facts) {
      const ok = await insertKnowledge(fact, item.category, item.subcategory, item.url);
      if (ok) {
        console.log(`[collect] → 追加: ${fact.title}`);
        totalInserted++;
      }
    }

    // Rate limit対策
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[collect] 完了: ${totalInserted}件追加, ${totalSkipped}件スキップ`);
}

main().catch(console.error);
```

- [ ] **Step 5: 構文確認**

Run: `cd /Users/kimuratakuya/line-harness/knowledge-collector && node -c src/collect.js && node -c src/extract.js`

- [ ] **Step 6: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add knowledge-collector/
git commit -m "feat(knowledge-collector): add automated secondary info collection from 14 authoritative sources"
```

---

### Task 8: GH Actions workflow作成

**Files:**
- Create: `knowledge-collector/.github/workflows/collect-knowledge.yml`

- [ ] **Step 1: workflow作成**

```yaml
name: Weekly Knowledge Collection
on:
  schedule:
    # 毎週月曜 バリ時間9:00 (UTC 1:00)
    - cron: '0 1 * * 1'
  workflow_dispatch: {}

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Collect knowledge from watchlist
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          KNOWLEDGE_API_URL: https://ig-auto-poster.archbridge24.workers.dev/api/knowledge
        run: node src/collect.js
        working-directory: knowledge-collector
```

- [ ] **Step 2: コミット**

```bash
git add knowledge-collector/.github/
git commit -m "ci(knowledge-collector): add weekly cron workflow for knowledge collection"
```

---

### Task 9: 全push + 動作確認

- [ ] **Step 1: 全push**

```bash
cd /Users/kimuratakuya/line-harness && git push origin main
cd /Users/kimuratakuya/x-auto-poster && git push origin main
```

- [ ] **Step 2: 本番API確認（新カテゴリ）**

Run: `curl -s https://ig-auto-poster.archbridge24.workers.dev/api/knowledge`
Expected: case, locale, method, people の4カテゴリでカウント

- [ ] **Step 3: 収集スクリプトのドライラン（1URLのみ）**

Run: `cd /Users/kimuratakuya/line-harness/knowledge-collector && ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY /Users/kimuratakuya/line-harness/ig-auto-poster/.dev.vars 2>/dev/null | cut -d= -f2) node -e "
import { extractFacts } from './src/extract.js';
const res = await fetch('https://www.anthropic.com/news');
const html = await res.text();
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000);
const facts = await extractFacts(text, 'Claude/Anthropicの新モデル・API変更・料金');
console.log(JSON.stringify(facts, null, 2));
"`
Expected: Anthropicの最新ニュースから事実が抽出される
