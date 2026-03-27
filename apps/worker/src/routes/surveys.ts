import { Hono } from 'hono';
import {
  getSurveys,
  getSurveyById,
  createSurvey,
  updateSurvey,
  deleteSurvey,
  getSurveyQuestions,
  createSurveyQuestion,
  updateSurveyQuestion,
  deleteSurveyQuestion,
  getSurveyChoices,
  createSurveyChoice,
  updateSurveyChoice,
  deleteSurveyChoice,
  startFriendSurvey,
  getFriendByLineUserId,
} from '@line-crm/db';
import type { SurveyQuestion, SurveyChoice, FriendSurvey } from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import { buildSurveyQuestionFlex } from '../services/survey-flex.js';
import { buildMessage } from '../services/step-delivery.js';
import type { Env } from '../index.js';

const surveys = new Hono<Env>();

// GET /api/surveys - list all surveys
surveys.get('/api/surveys', async (c) => {
  const db = c.env.DB;
  const results = await getSurveys(db);
  return c.json({ success: true, data: results });
});

// GET /api/surveys/:id - get survey with nested questions and choices
surveys.get('/api/surveys/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const survey = await getSurveyById(db, id);
  if (!survey) return c.json({ success: false, error: 'Survey not found' }, 404);

  const questions = await getSurveyQuestions(db, id);
  const questionsWithChoices: (SurveyQuestion & { choices: SurveyChoice[] })[] = [];
  for (const q of questions) {
    const choices = await getSurveyChoices(db, q.id);
    questionsWithChoices.push({ ...q, choices });
  }

  return c.json({ success: true, data: { ...survey, questions: questionsWithChoices } });
});

// POST /api/surveys - create survey
surveys.post('/api/surveys', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    name: string;
    lineAccountId?: string | null;
    onCompleteTagId?: string | null;
    onCompleteScenarioId?: string | null;
  }>();
  if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);

  const survey = await createSurvey(db, body);
  return c.json({ success: true, data: survey }, 201);
});

// PUT /api/surveys/:id - update survey
surveys.put('/api/surveys/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    onCompleteTagId?: string | null;
    onCompleteScenarioId?: string | null;
    isActive?: number;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.onCompleteTagId !== undefined) updates.on_complete_tag_id = body.onCompleteTagId;
  if (body.onCompleteScenarioId !== undefined) updates.on_complete_scenario_id = body.onCompleteScenarioId;
  if (body.isActive !== undefined) updates.is_active = body.isActive;

  const survey = await updateSurvey(db, id, updates);
  if (!survey) return c.json({ success: false, error: 'Survey not found' }, 404);
  return c.json({ success: true, data: survey });
});

// DELETE /api/surveys/:id - delete survey
surveys.delete('/api/surveys/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await deleteSurvey(db, id);
  return c.json({ success: true });
});

// POST /api/surveys/:id/questions - add question
surveys.post('/api/surveys/:id/questions', async (c) => {
  const db = c.env.DB;
  const surveyId = c.req.param('id');
  const body = await c.req.json<{
    questionOrder: number;
    title: string;
    imageUrl?: string | null;
  }>();
  if (!body.title || body.questionOrder === undefined) {
    return c.json({ success: false, error: 'title and questionOrder are required' }, 400);
  }

  const question = await createSurveyQuestion(db, {
    surveyId,
    questionOrder: body.questionOrder,
    title: body.title,
    imageUrl: body.imageUrl,
  });
  return c.json({ success: true, data: question }, 201);
});

// PUT /api/surveys/questions/:id - update question
surveys.put('/api/surveys/questions/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json<{
    title?: string;
    imageUrl?: string | null;
    questionOrder?: number;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.imageUrl !== undefined) updates.image_url = body.imageUrl;
  if (body.questionOrder !== undefined) updates.question_order = body.questionOrder;

  const question = await updateSurveyQuestion(db, id, updates);
  if (!question) return c.json({ success: false, error: 'Question not found' }, 404);
  return c.json({ success: true, data: question });
});

// DELETE /api/surveys/questions/:id - delete question
surveys.delete('/api/surveys/questions/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await deleteSurveyQuestion(db, id);
  return c.json({ success: true });
});

// POST /api/surveys/questions/:id/choices - add choice
surveys.post('/api/surveys/questions/:id/choices', async (c) => {
  const db = c.env.DB;
  const questionId = c.req.param('id');
  const body = await c.req.json<{
    choiceOrder: number;
    label: string;
    metadataKey?: string | null;
    tagId?: string | null;
  }>();
  if (!body.label || body.choiceOrder === undefined) {
    return c.json({ success: false, error: 'label and choiceOrder are required' }, 400);
  }

  const choice = await createSurveyChoice(db, {
    questionId,
    choiceOrder: body.choiceOrder,
    label: body.label,
    metadataKey: body.metadataKey,
    tagId: body.tagId,
  });
  return c.json({ success: true, data: choice }, 201);
});

// PUT /api/surveys/choices/:id - update choice
surveys.put('/api/surveys/choices/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json<{
    label?: string;
    metadataKey?: string | null;
    tagId?: string | null;
    choiceOrder?: number;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.label !== undefined) updates.label = body.label;
  if (body.metadataKey !== undefined) updates.metadata_key = body.metadataKey;
  if (body.tagId !== undefined) updates.tag_id = body.tagId;
  if (body.choiceOrder !== undefined) updates.choice_order = body.choiceOrder;

  const choice = await updateSurveyChoice(db, id, updates);
  if (!choice) return c.json({ success: false, error: 'Choice not found' }, 404);
  return c.json({ success: true, data: choice });
});

// DELETE /api/surveys/choices/:id - delete choice
surveys.delete('/api/surveys/choices/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await deleteSurveyChoice(db, id);
  return c.json({ success: true });
});

// POST /api/surveys/:id/start - start survey for a friend (send first question via Flex)
surveys.post('/api/surveys/:id/start', async (c) => {
  const db = c.env.DB;
  const surveyId = c.req.param('id');
  const body = await c.req.json<{ friendId: string; lineAccountId?: string }>();
  if (!body.friendId) return c.json({ success: false, error: 'friendId is required' }, 400);

  const survey = await getSurveyById(db, surveyId);
  if (!survey) return c.json({ success: false, error: 'Survey not found' }, 404);
  if (!survey.is_active) return c.json({ success: false, error: 'Survey is not active' }, 400);

  const questions = await getSurveyQuestions(db, surveyId);
  if (questions.length === 0) return c.json({ success: false, error: 'Survey has no questions' }, 400);

  // Get the first question
  const firstQuestion = questions[0];
  const choices = await getSurveyChoices(db, firstQuestion.id);
  if (choices.length === 0) return c.json({ success: false, error: 'First question has no choices' }, 400);

  // Start the friend survey
  const friendSurvey = await startFriendSurvey(db, body.friendId, surveyId);

  // Get friend's LINE user ID
  const friend = await db.prepare('SELECT line_user_id FROM friends WHERE id = ?').bind(body.friendId).first<{ line_user_id: string }>();
  if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);

  // Resolve LINE access token
  let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (body.lineAccountId) {
    const account = await db.prepare('SELECT channel_access_token FROM line_accounts WHERE id = ? AND is_active = 1').bind(body.lineAccountId).first<{ channel_access_token: string }>();
    if (account) accessToken = account.channel_access_token;
  }

  // Build and send the Flex message
  const flexBubble = buildSurveyQuestionFlex(surveyId, firstQuestion, choices);
  const lineClient = new LineClient(accessToken);
  await lineClient.pushMessage(friend.line_user_id, [
    buildMessage('flex', JSON.stringify(flexBubble)),
  ]);

  return c.json({ success: true, data: friendSurvey });
});

// ── CSV Export ───────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

surveys.get('/api/surveys/:id/responses/export', async (c) => {
  try {
    const surveyId = c.req.param('id');
    const format = c.req.query('format') ?? 'csv';

    if (format !== 'csv') {
      return c.json({ success: false, error: 'Unsupported format. Use format=csv' }, 400);
    }

    const db = c.env.DB;

    const survey = await getSurveyById(db, surveyId);
    if (!survey) {
      return c.json({ success: false, error: 'Survey not found' }, 404);
    }

    // Get questions with choices for dynamic headers and label resolution
    const questions = await getSurveyQuestions(db, surveyId);
    const choicesByQuestion: Record<string, SurveyChoice[]> = {};
    for (const q of questions) {
      choicesByQuestion[q.id] = await getSurveyChoices(db, q.id);
    }

    // Get all friend_surveys for this survey
    const friendSurveys = await db
      .prepare(
        `SELECT fs.*, f.display_name AS friend_name
         FROM friend_surveys fs
         LEFT JOIN friends f ON f.id = fs.friend_id
         WHERE fs.survey_id = ?
         ORDER BY fs.started_at DESC`,
      )
      .bind(surveyId)
      .all<FriendSurvey & { friend_name: string | null }>();

    // Build dynamic headers: 友だち名, [question titles...], 回答日時, 完了ステータス
    const headerRow = [
      '友だち名',
      ...questions.map((q) => q.title),
      '回答日時',
      '完了ステータス',
    ];
    const csvRows: string[] = [];
    csvRows.push('\uFEFF' + headerRow.map(csvEscape).join(','));

    for (const fs of friendSurveys.results) {
      const answers = JSON.parse(fs.answers || '{}') as Record<string, string>;

      // Resolve each answer to its choice label
      const answerValues = questions.map((q) => {
        const answeredChoiceId = answers[q.id];
        if (!answeredChoiceId) return '';
        const choices = choicesByQuestion[q.id] || [];
        const choice = choices.find((ch) => ch.id === answeredChoiceId);
        return choice ? choice.label : answeredChoiceId;
      });

      const csvRow = [
        fs.friend_name || '',
        ...answerValues,
        fs.completed_at || fs.started_at || '',
        fs.status === 'completed' ? '完了' : '未完了',
      ];
      csvRows.push(csvRow.map(csvEscape).join(','));
    }

    const csvContent = csvRows.join('\r\n') + '\r\n';
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="survey_responses_${surveyId}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    console.error('GET /api/surveys/:id/responses/export error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { surveys };
