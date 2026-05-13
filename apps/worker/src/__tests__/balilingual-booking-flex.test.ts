import { describe, expect, it } from 'vitest';
import { buildBalilingualSlotsFlex } from '../services/balilingual-booking-flex.js';

function slot(start: string, end: string) {
  return { start, end };
}

describe('buildBalilingualSlotsFlex', () => {
  it('builds a JST date carousel with up to four slot buttons per card', () => {
    const flex = buildBalilingualSlotsFlex([
      slot('2026-05-14T01:00:00.000Z', '2026-05-14T01:30:00.000Z'),
      slot('2026-05-14T02:00:00.000Z', '2026-05-14T02:30:00.000Z'),
      slot('2026-05-14T03:00:00.000Z', '2026-05-14T03:30:00.000Z'),
      slot('2026-05-14T04:00:00.000Z', '2026-05-14T04:30:00.000Z'),
      slot('2026-05-14T05:00:00.000Z', '2026-05-14T05:30:00.000Z'),
      slot('2026-05-15T01:00:00.000Z', '2026-05-15T01:30:00.000Z'),
    ]);

    expect(flex.type).toBe('carousel');
    expect(flex.contents).toHaveLength(2);
    expect(flex.contents[0].header?.contents[0]).toMatchObject({ text: '5/14(木)' });
    expect(flex.contents[1].header?.contents[0]).toMatchObject({ text: '5/15(金)' });

    const firstBodyContents = flex.contents[0].body.contents;
    const buttons = firstBodyContents.filter((item) => (item as { type?: string }).type === 'button');
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toMatchObject({
      action: {
        type: 'postback',
        label: '10:00-10:30',
        data: 'action=confirm_booking&start=2026-05-14T01%3A00%3A00.000Z&end=2026-05-14T01%3A30%3A00.000Z',
      },
      color: '#FF6600',
    });
  });

  it('returns a dedicated fallback flex and tag when no slots are available', () => {
    const flex = buildBalilingualSlotsFlex([]);

    expect(flex.type).toBe('carousel');
    expect(flex.contents).toHaveLength(1);
    expect(JSON.stringify(flex)).toContain('スタッフが個別調整します');
    expect(JSON.stringify(flex)).toContain('相談予約_空き枠不足');
  });

  it('limits the carousel to ten date cards', () => {
    const slots = Array.from({ length: 12 }, (_, index) => {
      const day = String(14 + index).padStart(2, '0');
      return slot(`2026-05-${day}T01:00:00.000Z`, `2026-05-${day}T01:30:00.000Z`);
    });

    const flex = buildBalilingualSlotsFlex(slots);

    expect(flex.contents).toHaveLength(10);
    expect(flex.contents[0].header?.contents[0]).toMatchObject({ text: '5/14(木)' });
    expect(flex.contents[9].header?.contents[0]).toMatchObject({ text: '5/23(土)' });
  });
});
