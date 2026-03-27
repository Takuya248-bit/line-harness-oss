/**
 * LINE Flex Message builders for the booking system.
 */
import type { TimeSlot } from './google-calendar-sa.js';

const GREEN = '#06C755';
const DARK_GREEN = '#05a848';
const GRAY = '#64748b';

/**
 * Build a date selection Flex Message (7 days from today).
 */
export function buildDateSelectionFlex(): object {
  const now = new Date();
  const jstOffset = 9 * 60 * 60_000;

  const buttons: object[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + jstOffset + i * 24 * 60 * 60_000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = dayNames[d.getUTCDay()];
    const label = `${Number(mm)}/${Number(dd)}(${dayName})`;

    buttons.push({
      type: 'button',
      action: {
        type: 'postback',
        label,
        data: `booking_date:${dateStr}`,
        displayText: `${label}の空き時間を確認`,
      },
      style: 'primary',
      color: GREEN,
      margin: 'sm',
      height: 'sm',
    });
  }

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '\u{1F4C5} 予約日を選択',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
        },
      ],
      backgroundColor: GREEN,
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '予約したい日をタップしてください',
          size: 'sm',
          color: GRAY,
          wrap: true,
          margin: 'none',
        },
        { type: 'separator', margin: 'md' },
        ...buttons,
      ],
      paddingAll: '16px',
      spacing: 'none',
    },
  };
}

/**
 * Build available time slots Flex Message.
 */
export function buildAvailableSlotsFlex(date: string, slots: TimeSlot[]): object {
  // Format date for display
  const d = new Date(`${date}T00:00:00+09:00`);
  const jstOffset = 9 * 60 * 60_000;
  const jst = new Date(d.getTime() + jstOffset);
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayName = dayNames[jst.getUTCDay()];
  const dateLabel = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${dayName})`;

  if (slots.length === 0) {
    return {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `\u{1F4C5} ${dateLabel}`,
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
          },
        ],
        backgroundColor: GREEN,
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'この日は空きがありません。\n別の日を選択してください。',
            size: 'sm',
            color: GRAY,
            wrap: true,
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: '別の日を選ぶ',
              data: 'booking_start',
              displayText: '予約日を選ぶ',
            },
            style: 'primary',
            color: GREEN,
            margin: 'lg',
          },
        ],
        paddingAll: '16px',
      },
    };
  }

  const buttons = slots.map((slot) => ({
    type: 'button',
    action: {
      type: 'postback',
      label: `${slot.start} - ${slot.end}`,
      data: `booking:${date}:${slot.start}`,
      displayText: `${dateLabel} ${slot.start}〜${slot.end} を予約`,
    },
    style: 'primary',
    color: GREEN,
    margin: 'sm',
    height: 'sm',
  }));

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `\u{1F4C5} ${dateLabel} の空き時間`,
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
        },
      ],
      backgroundColor: GREEN,
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '希望の時間をタップしてください',
          size: 'sm',
          color: GRAY,
          wrap: true,
        },
        { type: 'separator', margin: 'md' },
        ...buttons,
      ],
      paddingAll: '16px',
      spacing: 'none',
    },
  };
}

/**
 * Build booking confirmation Flex Message.
 */
export function buildBookingConfirmFlex(
  bookingId: string,
  date: string,
  startTime: string,
  endTime: string,
): object {
  const d = new Date(`${date}T00:00:00+09:00`);
  const jstOffset = 9 * 60 * 60_000;
  const jst = new Date(d.getTime() + jstOffset);
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayName = dayNames[jst.getUTCDay()];
  const dateLabel = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${dayName})`;

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '\u{2705} 予約が確定しました',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
        },
      ],
      backgroundColor: DARK_GREEN,
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '日付', size: 'sm', color: GRAY, flex: 2 },
            { type: 'text', text: dateLabel, size: 'sm', weight: 'bold', flex: 5 },
          ],
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '時間', size: 'sm', color: GRAY, flex: 2 },
            { type: 'text', text: `${startTime} - ${endTime}`, size: 'sm', weight: 'bold', flex: 5 },
          ],
          margin: 'sm',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '内容', size: 'sm', color: GRAY, flex: 2 },
            { type: 'text', text: 'オンライン面談', size: 'sm', flex: 5 },
          ],
          margin: 'sm',
        },
        { type: 'separator', margin: 'lg' },
        {
          type: 'text',
          text: 'キャンセルする場合は下のボタンを押してください。',
          size: 'xs',
          color: GRAY,
          wrap: true,
          margin: 'lg',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'キャンセルする',
            data: `booking_cancel:${bookingId}`,
            displayText: '予約をキャンセルします',
          },
          style: 'secondary',
          margin: 'md',
          height: 'sm',
        },
      ],
      paddingAll: '16px',
    },
  };
}

/**
 * Build booking cancellation confirmation Flex.
 */
export function buildBookingCancelledFlex(): object {
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '\u{274C} 予約をキャンセルしました',
          weight: 'bold',
          size: 'md',
          color: '#dc2626',
          align: 'center',
        },
        {
          type: 'text',
          text: '再度予約する場合はお知らせください。',
          size: 'sm',
          color: GRAY,
          align: 'center',
          margin: 'md',
          wrap: true,
        },
      ],
      paddingAll: '20px',
    },
  };
}
