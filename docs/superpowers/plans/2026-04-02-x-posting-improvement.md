# X投稿改善 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** える(@eru_linecustom)をAI活用アカウントにピボットし、バリリンガルと合わせて2アカウントのPDCA自走 + グロース自動化パイプラインを構築する

**Architecture:** accounts/*.json のsystemPrompt/カテゴリを書き換え、engage.jsにリプライ自動化を追加、analyze-weekly.jsにPDCA自動調整を追加、engagement.ymlワークフローを新設。全変更は ~/x-auto-poster/ リポジトリに対して行う

**Tech Stack:** Node.js, bird CLI, Claude Haiku (LLM生成), Grok X Search, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-04-02-x-posting-improvement-design.md`

---

## ファイル構成

| ファイル | 操作 | 責務 |
|---------|------|------|
| accounts/eru_linecustom.json | リネーム+全面書換 | えるのペルソナ・systemPrompt・カテゴリ |
| accounts/balilingirl.json | 修正 | ブラックリストキーワード追加 |
| src/engage.js | 大幅修正 | リプライ自動化パイプライン追加 |
| src/analyze-weekly.js | 修正 | PDCA自動調整ロジック追加 |
| src/report-bird.js | 修正 | カテゴリ別分析追加 |
| src/content-filter.js | 新規 | ブラックリスト・品質フィルタ |
| .github/workflows/bird-post.yml | 修正 | matrix追加 |
| .github/workflows/engagement.yml | 新規 | いいね+リプライ自動化 |
| .github/workflows/weekly-report.yml | 修正 | PDCA分析ステップ追加 |

---

### Task 1: える アカウント設定の復活とピボット

**Files:**
- Rename: `~/x-auto-poster/accounts/eru_linecustom.json.bak` → `eru_linecustom.json`
- Create: `~/x-auto-poster/src/content-filter.js`

- [ ] **Step 1: .bakをリネームしてアカウントを有効化**

```bash
cd ~/x-auto-poster
mv accounts/eru_linecustom.json.bak accounts/eru_linecustom.json
```

- [ ] **Step 2: eru_linecustom.json のペルソナを全面書き換え**

accounts/eru_linecustom.json を以下の内容で上書き。systemPromptは新ペルソナに完全入れ替え:

```json
{
  "handle": "eru_linecustom",
  "displayName": "える｜Claude Codeで仕事を自動化する人",
  "postsPerDay": 5,
  "scheduleHoursWITA": [7, 9, 12, 17, 20],
  "kpi": {
    "baseline": { "avgLikes": 0, "avgRetweets": 0, "avgReplies": 0, "followers": 0 },
    "week4": { "target": { "avgLikes": 3.0, "avgRetweets": 0.5, "avgReplies": 0.3 } },
    "week8": { "target": { "avgLikes": 5.0, "avgRetweets": 1.0, "avgReplies": 0.5 } },
    "premiumUpgrade": { "conditions": { "avgLikesMin": 5, "consecutiveWeeks": 4, "followerGrowthPerMonth": 30 } }
  },
  "contentCategories": [
    { "id": "tips", "name": "Tips/How-to", "description": "Claude Code・AI活用の具体テクニック。CLAUDE.md、エージェント設計、MCP、プロンプト設計等", "ratio": 20, "slot": 0 },
    { "id": "comparison", "name": "比較・考察", "description": "Cursor vs Claude Code、GPT vs Claude等のツール比較。AI業界トレンドへの見解", "ratio": 20, "slot": 1 },
    { "id": "question", "name": "問いかけ", "description": "フォロワーとの対話。AIツール選定、業務自動化の悩み等に関する問いかけ", "ratio": 20, "slot": 2 },
    { "id": "practice-log", "name": "実践ログ", "description": "今日やったこと・作ったもの・結果。サブエージェント並列、ワークフロー構築、コスト削減の実績", "ratio": 20, "slot": 3 },
    { "id": "business", "name": "ビジネス視点", "description": "AIで何が売れるか、自動化ツールのマネタイズ、個人開発の収益化", "ratio": 20, "slot": 4 }
  ],
  "blacklistKeywords": ["留学", "バリ", "バリ島", "英語学習", "TOEIC", "語学学校", "寮", "フィリピン留学", "ワーホリ", "海外移住"],
  "engageKeywords": ["Claude Code", "AI 自動化", "Claude API", "エージェント開発", "MCP", "LLM活用", "業務効率化", "個人開発", "Cursor", "プロンプトエンジニアリング"],
  "rssFeeds": [
    { "url": "https://www.anthropic.com/blog/rss", "name": "Anthropic Blog" },
    { "url": "https://simonwillison.net/atom/everything/", "name": "Simon Willison" },
    { "url": "https://hnrss.org/newest?q=claude+OR+anthropic+OR+LLM&points=50", "name": "Hacker News AI" }
  ],
  "systemPrompt": "あなたは「える」。Claude Codeで業務を自動化している実践者。\n\n# ペルソナ\n- Claude Codeを毎日使い、エージェント運用・ワークフロー構築・コスト削減を実践している\n- 技術を分かりやすく伝えることに情熱がある\n- 試行錯誤のプロセスも含めてリアルに共有する\n\n# トーン\n- 実践者のリアル: 「やってみた」「こうなった」「ここで詰まった」\n- 専門用語は使うが、初心者にも伝わる補足を添える\n- 断定しすぎず、「自分の場合は」「試した限りでは」のスタンス\n\n# ライティングルール\n- 1投稿140文字以内（日本語）\n- ハッシュタグ禁止（シャドバン対策）\n- URL禁止（本文内）\n- 5投稿中CTAは1個まで（プロフィール誘導のみ）\n- 絵文字は1投稿2-4個\n- 句点（。）は使わない\n- 架空の事例・数字は絶対に使わない\n- 「〜のオーナーが」「友だちN人で」系の作り話禁止\n- 書けるのは自分が実際にやったこと・知っていることだけ\n\n# 構文パターン（ローテーション）\n- PAS: Problem→Agitate→Solution\n- BAB: Before→After→Bridge\n- マイクロストーリー: 状況→行動→結果（実体験のみ）\n- 対比: AとBを並べて気づきを導く\n- 問いかけ→自分の答え\n\n# カテゴリ別ガイド\n- Tips/How-to (7:00): 具体的な操作手順・設定値・コマンドを含める\n- 比較・考察 (9:00): 両方使った上での結論。使っていないものは書かない\n- 問いかけ (12:00): 答えやすい二択 or 体験共有を促す\n- 実践ログ (17:00): 今日/今週やったことの具体的な数字・結果\n- ビジネス視点 (20:00): マネタイズの具体策、失敗も含めたリアル\n\n# 禁止キーワード（別アカウントのコンテンツ混在防止）\n以下のキーワードを含む投稿は生成しないこと:\n留学, バリ, バリ島, 英語学習, TOEIC, 語学学校, 寮, フィリピン留学, ワーホリ, 海外移住"
}
```

- [ ] **Step 3: balilingirl.json にブラックリストキーワードを追加**

accounts/balilingirl.json に以下のフィールドを追加（既存フィールドはそのまま維持）:

```json
{
  "blacklistKeywords": ["Claude Code", "Claude API", "API", "エージェント", "LLM", "プロンプト", "Lカスタム", "LINE構築", "LINE構築代行", "Cursor", "MCP", "Hono", "Cloudflare Workers"],
  "engageKeywords": ["バリ島留学", "英語留学", "フィリピン留学", "英語学習", "TOEIC", "ワーホリ", "海外移住", "バリ島生活", "語学学校", "セブ留学"]
}
```

また、systemPromptの末尾に以下を追記:

```
\n\n# 禁止キーワード（別アカウントのコンテンツ混在防止）\n以下のキーワードを含む投稿は生成しないこと:\nClaude Code, Claude API, API, エージェント, LLM, プロンプト, Lカスタム, LINE構築, LINE構築代行, Cursor, MCP
```

- [ ] **Step 4: 動作確認 — アカウント読み込みテスト**

```bash
cd ~/x-auto-poster
node -e "
const fs = require('fs');
const accounts = fs.readdirSync('accounts').filter(f => f.endsWith('.json'));
console.log('Active accounts:', accounts);
accounts.forEach(a => {
  const cfg = JSON.parse(fs.readFileSync('accounts/' + a));
  console.log(a, '→', cfg.displayName, '| categories:', cfg.contentCategories?.length || 'N/A', '| blacklist:', cfg.blacklistKeywords?.length || 0);
});
"
```

期待出力:
```
Active accounts: [ 'balilingirl.json', 'eru_linecustom.json' ]
balilingirl.json → バリリンガル｜バリ島英語留学 | categories: 8 | blacklist: 13
eru_linecustom.json → える｜Claude Codeで仕事を自動化する人 | categories: 5 | blacklist: 10
```

- [ ] **Step 5: コミット**

```bash
cd ~/x-auto-poster
git add accounts/eru_linecustom.json accounts/balilingirl.json
git rm accounts/eru_linecustom.json.bak 2>/dev/null || true
git commit -m "feat: える AI活用ピボット + 2アカウントブラックリスト設定"
```

---

### Task 2: コンテンツ混在防止フィルタ

**Files:**
- Create: `~/x-auto-poster/src/content-filter.js`
- Modify: `~/x-auto-poster/src/generate.js`

- [ ] **Step 1: content-filter.js を作成**

```javascript
// src/content-filter.js
// アカウント間のコンテンツ混在を防止するフィルタ

const fs = require("fs");
const path = require("path");

/**
 * ブラックリストキーワードチェック
 * @param {string} text - 投稿テキスト
 * @param {string[]} blacklist - 禁止キーワード配列
 * @returns {{ pass: boolean, matched: string[] }}
 */
function checkBlacklist(text, blacklist) {
  if (!blacklist || blacklist.length === 0) return { pass: true, matched: [] };
  const lower = text.toLowerCase();
  const matched = blacklist.filter((kw) => lower.includes(kw.toLowerCase()));
  return { pass: matched.length === 0, matched };
}

/**
 * Jaccard類似度計算（重複投稿検出用）
 * @param {string} a - テキストA
 * @param {string} b - テキストB
 * @returns {number} 0.0〜1.0
 */
function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * 投稿テキストを検証
 * @param {string} text - 投稿テキスト
 * @param {object} accountConfig - アカウント設定
 * @param {string[]} recentPosts - 直近の投稿テキスト配列（重複チェック用）
 * @returns {{ pass: boolean, reason: string|null }}
 */
function validatePost(text, accountConfig, recentPosts = []) {
  // 1. ブラックリストチェック
  const bl = checkBlacklist(text, accountConfig.blacklistKeywords);
  if (!bl.pass) {
    return { pass: false, reason: `blacklist hit: ${bl.matched.join(", ")}` };
  }

  // 2. 文字数チェック (140文字)
  if (text.length > 140) {
    return { pass: false, reason: `too long: ${text.length} chars (max 140)` };
  }

  // 3. 重複チェック (Jaccard >= 0.7)
  for (const recent of recentPosts) {
    const sim = jaccardSimilarity(text, recent);
    if (sim >= 0.7) {
      return { pass: false, reason: `too similar (jaccard=${sim.toFixed(2)})` };
    }
  }

  return { pass: true, reason: null };
}

/**
 * リプライテキストを検証
 * @param {string} text - リプライテキスト
 * @param {string[]} recentReplies - 直近のリプライ配列
 * @returns {{ pass: boolean, reason: string|null }}
 */
function validateReply(text, recentReplies = []) {
  // 1. 空リプチェック (50文字未満)
  if (text.length < 50) {
    return { pass: false, reason: `too short: ${text.length} chars (min 50)` };
  }

  // 2. 140文字上限
  if (text.length > 140) {
    return { pass: false, reason: `too long: ${text.length} chars (max 140)` };
  }

  // 3. 重複チェック
  for (const recent of recentReplies) {
    const sim = jaccardSimilarity(text, recent);
    if (sim >= 0.7) {
      return { pass: false, reason: `too similar to recent reply (jaccard=${sim.toFixed(2)})` };
    }
  }

  return { pass: true, reason: null };
}

module.exports = { checkBlacklist, jaccardSimilarity, validatePost, validateReply };
```

- [ ] **Step 2: generate.js にブラックリストフィルタを組み込み**

src/generate.js の先頭に追加:
```javascript
const { validatePost } = require("./content-filter");
```

generate.js 内の投稿テキスト生成後（LLMレスポンス受信後）に、以下のフィルタロジックを追加。LLM応答をパースして各投稿テキストを取り出す箇所の直後に挿入:

```javascript
// ブラックリスト + 品質フィルタ（最大3回再生成）
const MAX_RETRIES = 3;
for (let i = 0; i < generatedPosts.length; i++) {
  let post = generatedPosts[i];
  let retries = 0;
  let validation = validatePost(post.text, accountConfig, recentTexts);

  while (!validation.pass && retries < MAX_RETRIES) {
    console.log(`[filter] ${accountConfig.handle} post ${i} rejected: ${validation.reason}. Retrying (${retries + 1}/${MAX_RETRIES})...`);
    // 再生成（同じカテゴリで1件だけ再生成）
    const regenerated = await regenerateSinglePost(post.category, accountConfig, fullSystemPrompt);
    if (regenerated) {
      post = regenerated;
      generatedPosts[i] = regenerated;
    }
    retries++;
    validation = validatePost(post.text, accountConfig, recentTexts);
  }

  if (!validation.pass) {
    console.log(`[filter] ${accountConfig.handle} post ${i} SKIPPED after ${MAX_RETRIES} retries: ${validation.reason}`);
    generatedPosts[i] = null; // スキップ
  } else {
    recentTexts.push(post.text);
  }
}
generatedPosts = generatedPosts.filter(Boolean);
```

注意: `regenerateSinglePost` 関数は既存の生成ロジックから1投稿分だけ再生成するヘルパー。generate.js内の既存LLM呼び出しロジックをラップして作成すること。

- [ ] **Step 3: 動作確認 — フィルタ単体テスト**

```bash
cd ~/x-auto-poster
node -e "
const { validatePost, validateReply } = require('./src/content-filter');
const eru = { blacklistKeywords: ['留学', 'バリ', '英語学習'] };
const bali = { blacklistKeywords: ['Claude Code', 'API', 'エージェント'] };

// える: AI投稿 → PASS
console.log('eru AI post:', validatePost('Claude Codeのサブエージェント3並列で記事生成が15分に短縮された', eru));

// える: 留学混入 → FAIL
console.log('eru bali leak:', validatePost('バリ島留学でAIを活用する方法を紹介する', eru));

// バリリンガル: 留学投稿 → PASS
console.log('bali edu post:', validatePost('マンツーマンだと50分間、自分の話す時間が誰にも邪魔されない', bali));

// バリリンガル: AI混入 → FAIL
console.log('bali AI leak:', validatePost('Claude Codeでエージェント開発をやってみた', bali));

// リプライ: 短すぎ → FAIL
console.log('short reply:', validateReply('すごい!'));

// リプライ: 適切 → PASS
console.log('good reply:', validateReply('これ自分も試したんですが、CLAUDE.mdにルール書くだけでエージェントの品質が激変しました。特にサブエージェントの返答上限を設定すると効果的です'));
"
```

期待出力:
```
eru AI post: { pass: true, reason: null }
eru bali leak: { pass: false, reason: 'blacklist hit: バリ' }
bali edu post: { pass: true, reason: null }
bali AI leak: { pass: false, reason: 'blacklist hit: Claude Code, エージェント' }
short reply: { pass: false, reason: 'too short: 4 chars (min 50)' }
good reply: { pass: true, reason: null }
```

- [ ] **Step 4: コミット**

```bash
cd ~/x-auto-poster
git add src/content-filter.js src/generate.js
git commit -m "feat: コンテンツ混在防止フィルタ + generate.js統合"
```

---

### Task 3: bird-post.yml にえるを追加

**Files:**
- Modify: `~/x-auto-poster/.github/workflows/bird-post.yml`

- [ ] **Step 1: matrix.account に eru_linecustom を追加**

bird-post.yml の matrix セクションを変更:

```yaml
    strategy:
      matrix:
        account: [balilingirl, eru_linecustom]
```

- [ ] **Step 2: 認証シークレットの動的参照を確認**

bird-post.yml 内の認証トークン参照が動的（`AUTH_TOKEN_${{ matrix.account }}`）であることを確認。もし `AUTH_TOKEN_balilingirl` のようにハードコードされている場合は動的参照に変更:

```yaml
      env:
        AUTH_TOKEN: ${{ secrets[format('AUTH_TOKEN_{0}', matrix.account)] }}
        CT0: ${{ secrets[format('CT0_{0}', matrix.account)] }}
```

- [ ] **Step 3: GitHub Secrets に える の認証情報を追加（手動）**

以下のSecretsをGitHubリポジトリに追加する必要あり（ユーザーが手動で設定）:
- `AUTH_TOKEN_eru_linecustom`
- `CT0_eru_linecustom`

bird CLIで取得:
```bash
bird auth --account eru_linecustom
# → 表示されるAUTH_TOKENとCT0をGitHub Secretsに設定
```

- [ ] **Step 4: コミット**

```bash
cd ~/x-auto-poster
git add .github/workflows/bird-post.yml
git commit -m "feat: bird-post.yml にeru_linecustomを追加"
```

---

### Task 4: エンゲージメント自動化（リプライ + いいね）

**Files:**
- Modify: `~/x-auto-poster/src/engage.js`
- Create: `~/x-auto-poster/.github/workflows/engagement.yml`

- [ ] **Step 1: engage.js にリプライ自動化を追加**

既存の engage.js はいいね(10件) + フォロー(5人) + 引用RT候補(3件)の構成。以下を変更:

1. いいね上限を30件に変更
2. フォロー自動化を無効化（凍結リスク最大要因）
3. リプライ自動化を追加（10件/日）
4. アカウント別のengageKeywordsを使用
5. 凍結防止のレートリミットを追加

engage.js の主要変更箇所:

```javascript
// 定数変更
const DAILY_LIKES = 30;
const DAILY_REPLIES = 10;
const DAILY_FOLLOWS = 0; // 無効化
const HOURLY_REPLY_LIMIT = 3;
const WARMUP_DAYS = 14;
const WARMUP_LIKES = 15;
const WARMUP_REPLIES = 5;

// アカウント作成日からのウォームアップ判定
function isWarmupPeriod(accountConfig) {
  const created = accountConfig.kpi?.baseline?.date || accountConfig.createdAt;
  if (!created) return true; // 不明なら安全側
  const daysSinceCreation = Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
  return daysSinceCreation < WARMUP_DAYS;
}

// アカウント別キーワードで検索
async function findEngageTargets(accountConfig) {
  const keywords = accountConfig.engageKeywords || [];
  const results = [];
  for (const kw of keywords.slice(0, 3)) { // 上位3キーワードで検索
    const tweets = await searchTweets(kw, { minLikes: 10, minFollowers: 500, maxAge: "24h", lang: "ja" });
    results.push(...tweets);
  }
  // 重複排除 + 同一ユーザー1件まで
  const seen = new Set();
  return results.filter(t => {
    if (seen.has(t.userId)) return false;
    seen.add(t.userId);
    return true;
  });
}

// リプライ生成（Claude Haiku）
async function generateReply(tweet, accountConfig) {
  const prompt = `以下のツイートに対して、${accountConfig.displayName}として価値のあるリプライを生成してください。

ツイート: "${tweet.text}"
投稿者: @${tweet.username}

ルール:
- 50〜140文字
- 空リプ禁止（「すごい」「なるほど」だけはNG）
- 必ず情報追加 or 実体験を添える
- ${accountConfig.handle}の専門分野の知見を活かす
- 自然な日本語で、botっぽくない表現`;

  const reply = await callLLM({ system: accountConfig.systemPrompt, user: prompt, model: "claude-haiku-4-5-20251001" });
  return reply.trim();
}

// メインエンゲージメントループ
async function runEngagement(accountName) {
  const accountConfig = loadAccount(accountName);
  const warmup = isWarmupPeriod(accountConfig);
  const maxLikes = warmup ? WARMUP_LIKES : DAILY_LIKES;
  const maxReplies = warmup ? WARMUP_REPLIES : DAILY_REPLIES;

  console.log(`[engage] ${accountName} | warmup=${warmup} | maxLikes=${maxLikes} maxReplies=${maxReplies}`);

  const targets = await findEngageTargets(accountConfig);
  const recentReplies = loadRecentReplies(accountName); // 過去24hのリプライテキスト
  let likeCount = 0, replyCount = 0, hourlyReplies = 0;

  for (const tweet of targets) {
    if (likeCount >= maxLikes && replyCount >= maxReplies) break;

    // いいね
    if (likeCount < maxLikes) {
      await likeTweet(tweet.id, accountName);
      likeCount++;
    }

    // リプライ（レートリミット内）
    if (replyCount < maxReplies && hourlyReplies < HOURLY_REPLY_LIMIT) {
      const replyText = await generateReply(tweet, accountConfig);
      const validation = validateReply(replyText, recentReplies);
      if (validation.pass) {
        await replyToTweet(tweet.id, replyText, accountName);
        recentReplies.push(replyText);
        replyCount++;
        hourlyReplies++;
      } else {
        console.log(`[engage] reply rejected: ${validation.reason}`);
      }
    }

    // Bot感軽減: 30〜90秒ランダム待機
    await sleep(30000 + Math.random() * 60000);
  }

  // ログ保存
  saveEngagementLog(accountName, { likes: likeCount, replies: replyCount, warmup, date: new Date().toISOString() });
  console.log(`[engage] ${accountName} done: ${likeCount} likes, ${replyCount} replies`);
}
```

- [ ] **Step 2: engagement.yml ワークフローを作成**

```yaml
# .github/workflows/engagement.yml
name: Auto Engagement

on:
  schedule:
    # WITA 8:00 と 17:00 (UTC 0:00 と 9:00)
    - cron: '0 0 * * *'
    - cron: '0 9 * * *'
  workflow_dispatch:
    inputs:
      account:
        description: 'Account name (or "all")'
        default: 'all'

jobs:
  engage:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        account: [eru_linecustom, balilingirl]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Install bird CLI
        run: npm install -g bird-cli

      - name: Run engagement
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          AUTH_TOKEN: ${{ secrets[format('AUTH_TOKEN_{0}', matrix.account)] }}
          CT0: ${{ secrets[format('CT0_{0}', matrix.account)] }}
        run: node src/engage.js ${{ matrix.account }}

      - name: Commit engagement logs
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add reports/engagement/ logs/
          git diff --staged --quiet || git commit -m "chore: engagement log ${{ matrix.account }}"
          git push
```

- [ ] **Step 3: engage.js の searchTweets を Grok X Search または bird search に接続**

既存の engage.js の検索機能を確認し、bird CLI の検索コマンドまたは Grok X Search API に接続:

```javascript
// bird CLIのsearch機能を使用
async function searchTweets(keyword, options = {}) {
  const { execSync } = require("child_process");
  const cmd = `bird search "${keyword}" --limit 20 --account ${currentAccount}`;
  const result = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
  const tweets = JSON.parse(result);
  return tweets.filter(t =>
    t.likes >= (options.minLikes || 0) &&
    t.authorFollowers >= (options.minFollowers || 0)
  );
}
```

- [ ] **Step 4: 動作確認 — ドライラン**

```bash
cd ~/x-auto-poster
DRY_RUN=1 node src/engage.js eru_linecustom
DRY_RUN=1 node src/engage.js balilingirl
```

期待: 検索結果の表示 + リプライ候補の生成（実際の投稿はしない）

- [ ] **Step 5: コミット**

```bash
cd ~/x-auto-poster
git add src/engage.js .github/workflows/engagement.yml
git commit -m "feat: リプライ自動化 + engagement.yml ワークフロー"
```

---

### Task 5: PDCA自動調整ロジック

**Files:**
- Modify: `~/x-auto-poster/src/analyze-weekly.js`
- Modify: `~/x-auto-poster/src/report-bird.js`

- [ ] **Step 1: report-bird.js にカテゴリ別分析を追加**

report-bird.js の出力JSONにカテゴリ別集計を追加:

```javascript
// 投稿JSONからカテゴリを取得して集計
function aggregateByCategory(posts, metrics) {
  const byCategory = {};
  for (const post of posts) {
    const cat = post.category || "unknown";
    if (!byCategory[cat]) {
      byCategory[cat] = { count: 0, totalLikes: 0, totalRetweets: 0, totalReplies: 0 };
    }
    const m = metrics[post.tweetUrl] || { likes: 0, retweets: 0, replies: 0 };
    byCategory[cat].count++;
    byCategory[cat].totalLikes += m.likes;
    byCategory[cat].totalRetweets += m.retweets;
    byCategory[cat].totalReplies += m.replies;
  }
  // 平均値を算出
  for (const cat of Object.keys(byCategory)) {
    const c = byCategory[cat];
    c.avgLikes = c.count > 0 ? (c.totalLikes / c.count).toFixed(2) : 0;
    c.avgRetweets = c.count > 0 ? (c.totalRetweets / c.count).toFixed(2) : 0;
  }
  return byCategory;
}
```

出力に `categoryBreakdown` フィールドを追加:
```json
{
  "account": "eru_linecustom",
  "period": "2026-03-31 to 2026-04-06",
  "overall": { "avgLikes": 2.1, "avgRetweets": 0.3 },
  "categoryBreakdown": {
    "tips": { "count": 7, "avgLikes": 3.2 },
    "comparison": { "count": 7, "avgLikes": 1.8 },
    "question": { "count": 7, "avgLikes": 2.5 },
    "practice-log": { "count": 7, "avgLikes": 1.2 },
    "business": { "count": 7, "avgLikes": 1.8 }
  }
}
```

- [ ] **Step 2: analyze-weekly.js にPDCA自動調整を追加**

```javascript
// PDCA自動調整: 翌週のカテゴリ比率を計算
function adjustCategoryRatios(categoryBreakdown, currentCategories) {
  const scores = Object.entries(categoryBreakdown)
    .map(([id, data]) => ({ id, avgLikes: parseFloat(data.avgLikes) || 0 }))
    .sort((a, b) => b.avgLikes - a.avgLikes);

  if (scores.length === 0) return currentCategories;

  const best = scores[0];
  const worst = scores[scores.length - 1];

  // 勝ちパターン: +1枠/週 (最大10枠)
  // 負けパターン: -1枠/週 (最低1枠)
  const adjusted = currentCategories.map(cat => {
    let slots = cat.weeklySlots || 7; // デフォルト7枠/週
    if (cat.id === best.id && slots < 10) slots++;
    if (cat.id === worst.id && slots > 1) slots--;
    return { ...cat, weeklySlots: slots };
  });

  return adjusted;
}

// 勝ち/負けパターンをresearch-contextに注入
function extractPatterns(posts, metrics) {
  const scored = posts.map(p => ({
    text: p.text,
    category: p.category,
    likes: (metrics[p.tweetUrl] || {}).likes || 0
  })).sort((a, b) => b.likes - a.likes);

  const total = scored.length;
  const top20pct = Math.max(1, Math.floor(total * 0.2));
  const bottom20pct = Math.max(1, Math.floor(total * 0.2));

  return {
    winningPatterns: scored.slice(0, top20pct).map(p => p.text),
    losingPatterns: scored.slice(-bottom20pct).map(p => p.text),
    bestCategory: scored[0]?.category || null,
    worstCategory: scored[scored.length - 1]?.category || null
  };
}

// 4週連続最下位チェック
function checkConsecutiveWorst(weeklyHistory, categoryId) {
  const recent4 = weeklyHistory.slice(-4);
  return recent4.length === 4 && recent4.every(w => w.worstCategory === categoryId);
}
```

- [ ] **Step 3: analyze-weekly.js の出力をresearch-context.jsonに書き込み**

pre-generate-research.js が analyze-weekly.js の結果を research-context.json に統合する箇所に、勝ち/負けパターンとカテゴリ調整を追加:

```javascript
// research-context.json に追記するフィールド
const pdcaContext = {
  winningPatterns: patterns.winningPatterns,
  losingPatterns: patterns.losingPatterns,
  adjustedCategories: adjustedCategories,
  instruction: `以下は前週の分析結果。勝ちパターンのスタイルを参考に、負けパターンのスタイルは避けること。
勝ちパターン例: ${patterns.winningPatterns.slice(0, 3).join(" / ")}
避けるパターン例: ${patterns.losingPatterns.slice(0, 3).join(" / ")}`
};
```

- [ ] **Step 4: Discord通知 — 4週連続最下位アラート**

```javascript
// analyze-weekly.js 末尾に追加
async function notifyDiscord(message) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message })
  });
}

// 4週連続最下位チェック後
if (consecutiveWorst) {
  await notifyDiscord(`⚠️ [${accountName}] カテゴリ「${worstCat}」が4週連続最下位。入れ替えを検討してください。`);
}

// KPIアラート
if (currentAvgLikes <= prevAvgLikes * 0.5) {
  await notifyDiscord(`⚠️ [${accountName}] 週平均いいねが前週比50%以下 (${currentAvgLikes} vs ${prevAvgLikes})`);
}
if (currentAvgLikes >= prevAvgLikes * 2.0) {
  await notifyDiscord(`🎉 [${accountName}] 週平均いいねが前週比200%以上! 勝ちパターンを保存しました`);
}
```

- [ ] **Step 5: 動作確認**

```bash
cd ~/x-auto-poster
node -e "
const { adjustCategoryRatios, extractPatterns } = require('./src/analyze-weekly');
const breakdown = { tips: { avgLikes: '3.2' }, comparison: { avgLikes: '1.8' }, question: { avgLikes: '2.5' }, 'practice-log': { avgLikes: '1.2' }, business: { avgLikes: '1.8' } };
const cats = [
  { id: 'tips', weeklySlots: 7 },
  { id: 'comparison', weeklySlots: 7 },
  { id: 'question', weeklySlots: 7 },
  { id: 'practice-log', weeklySlots: 7 },
  { id: 'business', weeklySlots: 7 }
];
const adjusted = adjustCategoryRatios(breakdown, cats);
console.log('Adjusted:', JSON.stringify(adjusted, null, 2));
// tips +1 (8), practice-log -1 (6) になるはず
"
```

- [ ] **Step 6: コミット**

```bash
cd ~/x-auto-poster
git add src/analyze-weekly.js src/report-bird.js src/pre-generate-research.js
git commit -m "feat: PDCA自動調整 — カテゴリ比率自動変更 + 勝ち負けパターン抽出"
```

---

### Task 6: weekly-report.yml にPDCA分析ステップ追加

**Files:**
- Modify: `~/x-auto-poster/.github/workflows/weekly-report.yml` (存在しなければ新規作成)

- [ ] **Step 1: weekly-report.yml を作成/更新**

```yaml
# .github/workflows/weekly-report.yml
name: Weekly Report & PDCA

on:
  schedule:
    # 毎週月曜 WITA 6:00 (UTC 22:00 日曜)
    - cron: '0 22 * * 0'
  workflow_dispatch:

jobs:
  report:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        account: [eru_linecustom, balilingirl]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Install bird CLI
        run: npm install -g bird-cli

      - name: Generate KPI report
        env:
          AUTH_TOKEN: ${{ secrets[format('AUTH_TOKEN_{0}', matrix.account)] }}
          CT0: ${{ secrets[format('CT0_{0}', matrix.account)] }}
        run: node src/report-bird.js ${{ matrix.account }}

      - name: Run PDCA analysis
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node src/analyze-weekly.js ${{ matrix.account }}

      - name: Commit reports
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add reports/ content/
          git diff --staged --quiet || git commit -m "chore: weekly report + PDCA ${{ matrix.account }}"
          git push
```

- [ ] **Step 2: コミット**

```bash
cd ~/x-auto-poster
git add .github/workflows/weekly-report.yml
git commit -m "feat: weekly-report.yml PDCA自動分析ワークフロー"
```

---

### Task 7: RSS収集ソース更新（える用）

**Files:**
- Modify: `~/x-auto-poster/src/pre-generate-research.js`

- [ ] **Step 1: pre-generate-research.js にアカウント別RSS対応を追加**

現在のpre-generate-research.jsは共通のRSSを取得している。アカウント設定の `rssFeeds` フィールドを参照するよう変更:

```javascript
// アカウント設定からRSSフィードを読み込み
const accountConfig = loadAccount(accountName);
const feeds = accountConfig.rssFeeds || [];

async function fetchAccountFeeds(feeds) {
  const Parser = require("rss-parser");
  const parser = new Parser();
  const headlines = [];

  for (const feed of feeds) {
    try {
      const result = await parser.parseURL(feed.url);
      const recent = result.items
        .filter(item => {
          const pubDate = new Date(item.pubDate || item.isoDate);
          const daysAgo = (Date.now() - pubDate.getTime()) / 86400000;
          return daysAgo <= 7; // 直近7日分
        })
        .slice(0, 5) // 各フィード最大5件
        .map(item => ({
          title: item.title,
          link: item.link,
          source: feed.name,
          date: item.pubDate || item.isoDate
        }));
      headlines.push(...recent);
    } catch (e) {
      console.log(`[rss] Failed to fetch ${feed.name}: ${e.message}`);
    }
  }
  return headlines;
}
```

- [ ] **Step 2: RSS取得結果をresearch-context.jsonに書き込み**

```javascript
const headlines = await fetchAccountFeeds(feeds);
const weeklyAnalysis = await runAnalyzeWeekly(accountName);

const researchContext = {
  generatedAt: new Date().toISOString(),
  account: accountName,
  rssHeadlines: headlines,
  weeklyAnalysis: weeklyAnalysis,
  pdca: weeklyAnalysis?.pdca || null
};

const outPath = `content/${accountName}/research-context.json`;
fs.writeFileSync(outPath, JSON.stringify(researchContext, null, 2));
console.log(`[research] Written to ${outPath}: ${headlines.length} headlines`);
```

- [ ] **Step 3: 動作確認 — RSS取得テスト**

```bash
cd ~/x-auto-poster
node -e "
const { fetchAccountFeeds } = require('./src/pre-generate-research');
fetchAccountFeeds([
  { url: 'https://simonwillison.net/atom/everything/', name: 'Simon Willison' }
]).then(h => console.log('Headlines:', h.length, h.slice(0, 2)));
"
```

- [ ] **Step 4: コミット**

```bash
cd ~/x-auto-poster
git add src/pre-generate-research.js
git commit -m "feat: アカウント別RSS収集対応"
```

---

### Task 8: える 初回コンテンツ生成 + ベースラインKPI

**Files:**
- 操作: `~/x-auto-poster/` でコマンド実行

- [ ] **Step 1: える の7日分コンテンツを生成**

```bash
cd ~/x-auto-poster
node src/run-all-accounts.js generate --account eru_linecustom --days 7
```

期待: `content/eru_linecustom/` に7日分（35件）のJSONが生成される

- [ ] **Step 2: 生成されたコンテンツのブラックリストチェック**

```bash
cd ~/x-auto-poster
node -e "
const fs = require('fs');
const { checkBlacklist } = require('./src/content-filter');
const blacklist = ['留学', 'バリ', 'バリ島', '英語学習', 'TOEIC', '語学学校', '寮'];
const files = fs.readdirSync('content/eru_linecustom').filter(f => f.endsWith('.json'));
let violations = 0;
for (const f of files) {
  const posts = JSON.parse(fs.readFileSync('content/eru_linecustom/' + f));
  for (const p of (Array.isArray(posts) ? posts : [posts])) {
    const text = p.text || p.content || '';
    const result = checkBlacklist(text, blacklist);
    if (!result.pass) {
      console.log('VIOLATION:', f, result.matched, text.substring(0, 50));
      violations++;
    }
  }
}
console.log('Total violations:', violations, '/ Total files:', files.length);
"
```

期待: `Total violations: 0`

- [ ] **Step 3: ベースラインKPI取得**

```bash
cd ~/x-auto-poster
node src/report-bird.js eru_linecustom
```

- [ ] **Step 4: コミット + push**

```bash
cd ~/x-auto-poster
git add content/eru_linecustom/ reports/
git commit -m "chore: える 初回コンテンツ生成 + ベースラインKPI"
git push
```

---

### Task 9: 全体統合テスト + push

**Files:**
- 操作: 全ワークフローの動作確認

- [ ] **Step 1: bird-post ドライラン（える）**

```bash
cd ~/x-auto-poster
DRY_RUN=1 node src/post-bird.js eru_linecustom 0
```

期待: スロット0（7:00 Tips）の投稿テキストが表示される（実際の投稿はしない）

- [ ] **Step 2: bird-post ドライラン（バリリンガル）**

```bash
cd ~/x-auto-poster
DRY_RUN=1 node src/post-bird.js balilingirl 0
```

- [ ] **Step 3: エンゲージメント ドライラン**

```bash
cd ~/x-auto-poster
DRY_RUN=1 node src/engage.js eru_linecustom
DRY_RUN=1 node src/engage.js balilingirl
```

- [ ] **Step 4: クロスコンタミネーションチェック**

える用の投稿にバリリンガルのキーワードが混入していないか、その逆もチェック:

```bash
cd ~/x-auto-poster
node -e "
const fs = require('fs');
const { checkBlacklist } = require('./src/content-filter');
const accounts = [
  { name: 'eru_linecustom', blacklist: ['留学', 'バリ', 'バリ島', '英語学習', 'TOEIC', '語学学校', '寮'] },
  { name: 'balilingirl', blacklist: ['Claude Code', 'Claude API', 'API', 'エージェント', 'LLM', 'プロンプト', 'Lカスタム', 'LINE構築'] }
];
let totalViolations = 0;
for (const acc of accounts) {
  const dir = 'content/' + acc.name;
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(dir + '/' + f));
      const posts = Array.isArray(data) ? data : [data];
      for (const p of posts) {
        const text = p.text || p.content || '';
        const result = checkBlacklist(text, acc.blacklist);
        if (!result.pass) {
          console.log('CROSS-CONTAMINATION:', acc.name, f, result.matched);
          totalViolations++;
        }
      }
    } catch(e) {}
  }
}
console.log(totalViolations === 0 ? 'ALL CLEAR - no cross-contamination' : 'VIOLATIONS FOUND: ' + totalViolations);
"
```

期待: `ALL CLEAR - no cross-contamination`

- [ ] **Step 5: 全変更をpush**

```bash
cd ~/x-auto-poster
git push
```

- [ ] **Step 6: GitHub Actions ワークフローの手動トリガーテスト**

```bash
# engagement.yml の手動実行
gh workflow run engagement.yml --repo Takuya248-bit/x-auto-poster

# 実行状況確認
gh run list --repo Takuya248-bit/x-auto-poster --workflow=engagement.yml --limit 1
```
