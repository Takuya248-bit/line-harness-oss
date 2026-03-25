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
