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

  // Buttons
  const buttons = choices.map((c) => ({
    type: 'button',
    action: {
      type: 'postback',
      label: c.label.slice(0, 20), // LINE limit: 20 chars for label
      data: `survey:${surveyId}:${question.id}:${c.id}`,
      displayText: c.label,
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
