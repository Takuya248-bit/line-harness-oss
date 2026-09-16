/**
 * LINE Flex Message builder for Balilingual consultation booking slots.
 */

const ORANGE = '#FF6600';
const DARK = '#1f2937';
const GRAY = '#64748b';
const LIGHT_ORANGE = '#FFF3EB';
const JST_OFFSET_MS = 9 * 60 * 60_000;
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export interface BalilingualSlot {
  start: string;
  end: string;
}

export interface FlexCarousel {
  type: 'carousel';
  contents: FlexBubble[];
}

type FlexBubble = {
  type: 'bubble';
  size?: 'mega' | 'giga' | 'kilo' | 'micro' | 'nano';
  header?: FlexBox;
  body: FlexBox;
  footer?: FlexBox;
};

type FlexBox = {
  type: 'box';
  layout: 'vertical' | 'horizontal' | 'baseline';
  contents: object[];
  backgroundColor?: string;
  paddingAll?: string;
  paddingTop?: string;
  paddingBottom?: string;
  spacing?: string;
  margin?: string;
};

type GroupedSlots = {
  key: string;
  dateLabel: string;
  slots: BalilingualSlot[];
};

function toJstDate(value: string): Date {
  return new Date(new Date(value).getTime() + JST_OFFSET_MS);
}

function formatDateKey(value: string): string {
  const jst = toJstDate(value);
  return [
    jst.getUTCFullYear(),
    String(jst.getUTCMonth() + 1).padStart(2, '0'),
    String(jst.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function formatDateLabel(value: string): string {
  const jst = toJstDate(value);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${DAY_NAMES[jst.getUTCDay()]})`;
}

function formatTime(value: string): string {
  const jst = toJstDate(value);
  return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
}

function groupSlotsByJstDate(slots: BalilingualSlot[]): GroupedSlots[] {
  const sorted = [...slots].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const groups = new Map<string, GroupedSlots>();

  for (const slot of sorted) {
    const key = formatDateKey(slot.start);
    const current = groups.get(key);
    if (current) {
      current.slots.push(slot);
      continue;
    }

    groups.set(key, {
      key,
      dateLabel: formatDateLabel(slot.start),
      slots: [slot],
    });
  }

  return [...groups.values()].slice(0, 10);
}

function buildFallbackBubble(): FlexBubble {
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '相談予約',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
        },
      ],
      backgroundColor: ORANGE,
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'スタッフが個別調整します',
          weight: 'bold',
          size: 'md',
          color: DARK,
          wrap: true,
        },
        {
          type: 'text',
          text: '今すぐ選べる空き枠が少ないため、ご希望の日程をLINEでお知らせください。',
          size: 'sm',
          color: GRAY,
          wrap: true,
          margin: 'md',
        },
        {
          type: 'text',
          text: '相談予約_空き枠不足',
          size: 'xxs',
          color: ORANGE,
          margin: 'lg',
        },
      ],
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}

function buildDateBubble(group: GroupedSlots): FlexBubble {
  const buttons = group.slots.slice(0, 4).map((slot) => {
    const label = `${formatTime(slot.start)}-${formatTime(slot.end)}`;
    const data = new URLSearchParams({
      action: 'confirm_booking',
      start: slot.start,
      end: slot.end,
    }).toString();

    return {
      type: 'button',
      action: {
        type: 'postback',
        label,
        data,
        displayText: `${group.dateLabel} ${formatTime(slot.start)}〜${formatTime(slot.end)}で相談予約`,
      },
      style: 'primary',
      color: ORANGE,
      height: 'sm',
      margin: 'sm',
    };
  });

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: group.dateLabel,
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
        },
      ],
      backgroundColor: ORANGE,
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '無料相談の希望時間を選んでください',
          size: 'sm',
          color: GRAY,
          wrap: true,
        },
        {
          type: 'separator',
          margin: 'md',
        },
        ...buttons,
      ],
      backgroundColor: LIGHT_ORANGE,
      paddingAll: '16px',
      spacing: 'none',
    },
  };
}

export function buildBalilingualSlotsFlex(slots: BalilingualSlot[]): FlexCarousel {
  if (slots.length === 0) {
    return {
      type: 'carousel',
      contents: [buildFallbackBubble()],
    };
  }

  return {
    type: 'carousel',
    contents: groupSlotsByJstDate(slots).map(buildDateBubble),
  };
}
