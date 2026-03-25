-- SEO Writer tables (add to existing D1 database)

CREATE TABLE IF NOT EXISTS seo_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  search_intent TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, generating, generated, posted, published, failed
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seo_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id INTEGER NOT NULL REFERENCES seo_keywords(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  meta_description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, review, approved, posted, published
  wp_post_id INTEGER,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_status ON seo_keywords(status);
CREATE INDEX IF NOT EXISTS idx_seo_articles_keyword_id ON seo_articles(keyword_id);
CREATE INDEX IF NOT EXISTS idx_seo_articles_status ON seo_articles(status);

-- Case studies for injecting real examples into articles
CREATE TABLE IF NOT EXISTS case_studies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  challenge TEXT NOT NULL,
  solution TEXT NOT NULL,
  result TEXT NOT NULL,
  quote TEXT,
  metrics_json TEXT,
  is_anonymized BOOLEAN DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_case_studies_industry ON case_studies(industry);

-- Initial case study data
INSERT OR IGNORE INTO case_studies (id, business_name, industry, challenge, solution, result, quote, metrics_json, is_anonymized)
VALUES (
  1,
  'バリ島の語学学校A様',
  'school',
  'Lステップの月額費用（月額21,780円）がランニングコストとして負担。友だち数増加に伴うプラン変更でさらにコスト増の懸念',
  'LINE Harnessに移行。ステップ配信6本、タグ17個、ABテスト、フェーズ管理をオープンソースシステムで再構築',
  '月額ツール費用を年間約26万円削減。機能面はLステップ同等を維持',
  NULL,
  '{"monthly_cost_before": 21780, "monthly_cost_after": 0, "annual_saving": 261360, "scenarios": 6, "tags": 17}',
  1
);

INSERT OR IGNORE INTO case_studies (id, business_name, industry, challenge, solution, result, quote, metrics_json, is_anonymized)
VALUES (
  2,
  'コンテンツクリエイターB様',
  'creator',
  'LINE公式アカウントの友だち追加後、手動でフォローメッセージを送っていた。キーワード応答も未設定',
  'LINE Harnessで7日間ステップ配信（5通）と9キーワードの自動応答を構築。初期費用のみで月額0円',
  '友だち追加後のフォローを完全自動化。手動メッセージ送信の工数をゼロに',
  NULL,
  '{"step_messages": 5, "auto_replies": 9, "monthly_cost": 0, "setup_days": 1}',
  1
);
