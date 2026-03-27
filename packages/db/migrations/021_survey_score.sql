-- survey_choices にスコアカラム追加（診断機能用）
ALTER TABLE survey_choices ADD COLUMN score INTEGER DEFAULT 0;

-- surveys にスコア範囲別タグルール追加（JSON: [{"min":0,"max":3,"tag_id":"xxx"}, ...]）
ALTER TABLE surveys ADD COLUMN score_tag_rules TEXT;
