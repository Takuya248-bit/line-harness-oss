import { jstNow } from './utils.js';

export interface ScoreTagRule {
  min: number;
  max: number;
  tag_id: string;
}

export interface Survey {
  id: string;
  name: string;
  line_account_id: string | null;
  on_complete_tag_id: string | null;
  on_complete_scenario_id: string | null;
  score_tag_rules: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  question_order: number;
  title: string;
  image_url: string | null;
  created_at: string;
}

export interface SurveyChoice {
  id: string;
  question_id: string;
  choice_order: number;
  label: string;
  metadata_key: string | null;
  tag_id: string | null;
  score: number;
  created_at: string;
}

export interface FriendSurvey {
  id: string;
  friend_id: string;
  survey_id: string;
  current_question_order: number;
  status: string;
  answers: string;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

// Survey CRUD
export async function getSurveys(db: D1Database): Promise<Survey[]> {
  const r = await db.prepare('SELECT * FROM surveys ORDER BY created_at DESC').all<Survey>();
  return r.results;
}

export async function getSurveyById(db: D1Database, id: string): Promise<Survey | null> {
  return db.prepare('SELECT * FROM surveys WHERE id = ?').bind(id).first<Survey>();
}

export async function createSurvey(db: D1Database, input: {
  name: string;
  lineAccountId?: string | null;
  onCompleteTagId?: string | null;
  onCompleteScenarioId?: string | null;
  scoreTagRules?: string | null;
}): Promise<Survey> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(
    'INSERT INTO surveys (id, name, line_account_id, on_complete_tag_id, on_complete_scenario_id, score_tag_rules, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
  ).bind(id, input.name, input.lineAccountId ?? null, input.onCompleteTagId ?? null, input.onCompleteScenarioId ?? null, input.scoreTagRules ?? null, now, now).run();
  return (await getSurveyById(db, id))!;
}

export async function updateSurvey(db: D1Database, id: string, updates: Partial<Pick<Survey, 'name' | 'on_complete_tag_id' | 'on_complete_scenario_id' | 'score_tag_rules' | 'is_active'>>): Promise<Survey | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.on_complete_tag_id !== undefined) { fields.push('on_complete_tag_id = ?'); values.push(updates.on_complete_tag_id); }
  if (updates.on_complete_scenario_id !== undefined) { fields.push('on_complete_scenario_id = ?'); values.push(updates.on_complete_scenario_id); }
  if (updates.score_tag_rules !== undefined) { fields.push('score_tag_rules = ?'); values.push(updates.score_tag_rules); }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }
  if (fields.length === 0) return getSurveyById(db, id);
  fields.push('updated_at = ?'); values.push(jstNow()); values.push(id);
  await db.prepare(`UPDATE surveys SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return getSurveyById(db, id);
}

export async function deleteSurvey(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM surveys WHERE id = ?').bind(id).run();
}

// Questions
export async function getSurveyQuestions(db: D1Database, surveyId: string): Promise<SurveyQuestion[]> {
  const r = await db.prepare('SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC').bind(surveyId).all<SurveyQuestion>();
  return r.results;
}

export async function createSurveyQuestion(db: D1Database, input: {
  surveyId: string;
  questionOrder: number;
  title: string;
  imageUrl?: string | null;
}): Promise<SurveyQuestion> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(
    'INSERT INTO survey_questions (id, survey_id, question_order, title, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, input.surveyId, input.questionOrder, input.title, input.imageUrl ?? null, now).run();
  return (await db.prepare('SELECT * FROM survey_questions WHERE id = ?').bind(id).first<SurveyQuestion>())!;
}

export async function updateSurveyQuestion(db: D1Database, id: string, updates: Partial<Pick<SurveyQuestion, 'title' | 'image_url' | 'question_order'>>): Promise<SurveyQuestion | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.image_url !== undefined) { fields.push('image_url = ?'); values.push(updates.image_url); }
  if (updates.question_order !== undefined) { fields.push('question_order = ?'); values.push(updates.question_order); }
  if (fields.length === 0) return db.prepare('SELECT * FROM survey_questions WHERE id = ?').bind(id).first<SurveyQuestion>();
  values.push(id);
  await db.prepare(`UPDATE survey_questions SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return db.prepare('SELECT * FROM survey_questions WHERE id = ?').bind(id).first<SurveyQuestion>();
}

export async function deleteSurveyQuestion(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM survey_questions WHERE id = ?').bind(id).run();
}

// Choices
export async function getSurveyChoices(db: D1Database, questionId: string): Promise<SurveyChoice[]> {
  const r = await db.prepare('SELECT * FROM survey_choices WHERE question_id = ? ORDER BY choice_order ASC').bind(questionId).all<SurveyChoice>();
  return r.results;
}

export async function createSurveyChoice(db: D1Database, input: {
  questionId: string;
  choiceOrder: number;
  label: string;
  metadataKey?: string | null;
  tagId?: string | null;
  score?: number;
}): Promise<SurveyChoice> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(
    'INSERT INTO survey_choices (id, question_id, choice_order, label, metadata_key, tag_id, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, input.questionId, input.choiceOrder, input.label, input.metadataKey ?? null, input.tagId ?? null, input.score ?? 0, now).run();
  return (await db.prepare('SELECT * FROM survey_choices WHERE id = ?').bind(id).first<SurveyChoice>())!;
}

export async function updateSurveyChoice(db: D1Database, id: string, updates: Partial<Pick<SurveyChoice, 'label' | 'metadata_key' | 'tag_id' | 'choice_order' | 'score'>>): Promise<SurveyChoice | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.label !== undefined) { fields.push('label = ?'); values.push(updates.label); }
  if (updates.metadata_key !== undefined) { fields.push('metadata_key = ?'); values.push(updates.metadata_key); }
  if (updates.tag_id !== undefined) { fields.push('tag_id = ?'); values.push(updates.tag_id); }
  if (updates.score !== undefined) { fields.push('score = ?'); values.push(updates.score); }
  if (updates.choice_order !== undefined) { fields.push('choice_order = ?'); values.push(updates.choice_order); }
  if (fields.length === 0) return db.prepare('SELECT * FROM survey_choices WHERE id = ?').bind(id).first<SurveyChoice>();
  values.push(id);
  await db.prepare(`UPDATE survey_choices SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return db.prepare('SELECT * FROM survey_choices WHERE id = ?').bind(id).first<SurveyChoice>();
}

export async function deleteSurveyChoice(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM survey_choices WHERE id = ?').bind(id).run();
}

// Friend Survey State
export async function startFriendSurvey(db: D1Database, friendId: string, surveyId: string): Promise<FriendSurvey> {
  // Check for existing active survey of the same type
  const existing = await db.prepare(
    'SELECT * FROM friend_surveys WHERE friend_id = ? AND survey_id = ? AND status = ?'
  ).bind(friendId, surveyId, 'active').first<FriendSurvey>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(
    'INSERT INTO friend_surveys (id, friend_id, survey_id, current_question_order, status, answers, started_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)'
  ).bind(id, friendId, surveyId, 'active', '{}', now, now).run();
  return (await db.prepare('SELECT * FROM friend_surveys WHERE id = ?').bind(id).first<FriendSurvey>())!;
}

export async function getActiveFriendSurvey(db: D1Database, friendId: string): Promise<FriendSurvey | null> {
  return db.prepare(
    'SELECT * FROM friend_surveys WHERE friend_id = ? AND status = ? ORDER BY started_at DESC LIMIT 1'
  ).bind(friendId, 'active').first<FriendSurvey>();
}

export async function advanceFriendSurvey(db: D1Database, id: string, questionOrder: number, answers: Record<string, string>): Promise<void> {
  const now = jstNow();
  await db.prepare(
    'UPDATE friend_surveys SET current_question_order = ?, answers = ?, updated_at = ? WHERE id = ?'
  ).bind(questionOrder, JSON.stringify(answers), now, id).run();
}

export async function completeFriendSurvey(db: D1Database, id: string, answers: Record<string, string>): Promise<void> {
  const now = jstNow();
  await db.prepare(
    'UPDATE friend_surveys SET status = ?, answers = ?, completed_at = ?, updated_at = ? WHERE id = ?'
  ).bind('completed', JSON.stringify(answers), now, now, id).run();
}

// スコア集計: 回答済みの選択肢IDからスコア合計を算出
export async function calculateSurveyScore(db: D1Database, surveyId: string, answers: Record<string, string>): Promise<number> {
  const questionIds = Object.keys(answers);
  if (questionIds.length === 0) return 0;

  let totalScore = 0;
  for (const questionId of questionIds) {
    const choiceLabel = answers[questionId];
    const choice = await db.prepare(
      'SELECT score FROM survey_choices WHERE question_id = ? AND label = ?'
    ).bind(questionId, choiceLabel).first<{ score: number }>();
    if (choice) {
      totalScore += choice.score ?? 0;
    }
  }
  return totalScore;
}

// スコア範囲に応じたタグIDを返す
export function getScoreTagId(scoreTagRules: string | null, score: number): string | null {
  if (!scoreTagRules) return null;
  try {
    const rules: ScoreTagRule[] = JSON.parse(scoreTagRules);
    for (const rule of rules) {
      if (score >= rule.min && score <= rule.max) {
        return rule.tag_id;
      }
    }
  } catch {
    // invalid JSON
  }
  return null;
}
