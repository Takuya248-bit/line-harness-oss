-- アンケート定義
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  line_account_id TEXT,
  on_complete_tag_id TEXT,
  on_complete_scenario_id TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- アンケートの質問
CREATE TABLE IF NOT EXISTS survey_questions (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT,
  created_at TEXT NOT NULL
);

-- 質問の選択肢
CREATE TABLE IF NOT EXISTS survey_choices (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  choice_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  metadata_key TEXT,
  tag_id TEXT,
  created_at TEXT NOT NULL
);

-- 友だちのアンケート回答状態
CREATE TABLE IF NOT EXISTS friend_surveys (
  id TEXT PRIMARY KEY,
  friend_id TEXT NOT NULL,
  survey_id TEXT NOT NULL,
  current_question_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  answers TEXT DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_choices_question ON survey_choices(question_id);
CREATE INDEX IF NOT EXISTS idx_friend_surveys_friend ON friend_surveys(friend_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_surveys_survey ON friend_surveys(survey_id);
