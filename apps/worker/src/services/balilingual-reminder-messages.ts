import type { Message } from '@line-crm/line-sdk';

export type BalilingualReminderStage = '24h' | '5d' | '14d';

const BOOKING_LABEL = '相談予約する';

export function buildBalilingualEstimateReminderMessage(
  stage: BalilingualReminderStage,
  friendId: string,
): Message {
  const data = `action=book_consultation&friend_id=${encodeURIComponent(friendId)}`;

  if (stage === '24h') {
    return {
      type: 'text',
      text: [
        '昨日お送りしたお見積り、気になる点はありましたか？',
        '',
        '同じように迷われていた方も、まずは日程や生活面の不安を相談してから決めています。',
        '「費用」「滞在先」「期間」など、気になるところだけでも聞いてください。',
        '',
        '相談予約をご希望の場合は「相談予約希望」と送ってください。',
      ].join('\n'),
    };
  }

  if (stage === '5d') {
    return {
      type: 'text',
      text: [
        'バリ留学、いきなり長期で決めなくても大丈夫です。',
        '',
        'まずは1週間の短期トライアルから、学校・滞在・現地生活の相性を見る形でも相談できます。',
        '短期から試したい場合は、その前提で日程を一緒に整理します。',
        '',
        '相談予約をご希望の場合は「相談予約希望」と送ってください。',
      ].join('\n'),
    };
  }

  return {
    type: 'flex',
    altText: 'バリ留学の相談予約について',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '将来の予約でも大丈夫です',
            weight: 'bold',
            size: 'lg',
            wrap: true,
          },
          {
            type: 'text',
            text: '出発時期がまだ先でも、空き状況や費用感だけ先に確認できます。予定が変わる可能性がある方も、まずは相談ベースで進められます。',
            size: 'sm',
            color: '#555555',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#06C755',
            action: {
              type: 'postback',
              label: BOOKING_LABEL,
              data,
              displayText: '相談予約希望',
            },
          },
        ],
      },
    },
  };
}
