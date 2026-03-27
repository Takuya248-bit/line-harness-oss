import type { SurveyQuestion, SurveyChoice } from '@line-crm/db';

export function buildSurveyQuestionFlex(
  surveyId: string,
  question: SurveyQuestion,
  choices: SurveyChoice[],
): object {
  // Header with title
  const header = {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: question.title,
        weight: 'bold',
        size: 'lg',
        color: '#ffffff',
        wrap: true,
      },
    ],
    backgroundColor: '#F59E0B',
    paddingAll: '16px',
  };

  // Body contents
  const bodyContents: unknown[] = [];

  // Image (if provided)
  if (question.image_url) {
    bodyContents.push({
      type: 'image',
      url: question.image_url,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    });
  }

  // Buttons — use message action instead of postback for better compatibility
  const buttons = choices.map((c) => ({
    type: 'button',
    action: {
      type: 'message',
      label: c.label.slice(0, 20), // LINE limit: 20 chars for label
      text: `survey:${surveyId}:${question.id}:${c.id}`,
    },
    style: 'primary',
    color: '#F59E0B',
    height: 'sm',
    margin: 'sm',
  }));

  bodyContents.push(...buttons);

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    size: 'mega',
    header,
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: '16px',
      spacing: 'sm',
    },
  };

  return bubble;
}
