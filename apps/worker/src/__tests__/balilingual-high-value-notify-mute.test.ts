import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyBalilingualHighValue } from '../services/balilingual-high-value-notify.js';
import type { Estimate } from '../services/balilingual-estimator/index.js';

const { notifyTelegramSimple } = vi.hoisted(() => ({
  notifyTelegramSimple: vi.fn(),
}));

vi.mock('../services/telegram-notify.js', () => ({
  notifyTelegramSimple,
}));

const highValueEstimate: Estimate = {
  weeks: 12,
  plan: 'pair',
  planLabel: 'ペア',
  pax: 2,
  isParentChild: true,
  lines: [],
  subtotal: 1596000,
  total: 1596000,
  notes: [],
  warnings: [],
};

beforeEach(() => {
  notifyTelegramSimple.mockReset();
  vi.restoreAllMocks();
});

describe('notifyBalilingualHighValue high-value mute env', () => {
  it('skips Telegram notification when TELEGRAM_NOTIFY_DISABLE_HIGH_VALUE is true', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await expect(notifyBalilingualHighValue({
      TELEGRAM_BOT_TOKEN: 'token',
      TELEGRAM_CHAT_ID: 'chat',
      TELEGRAM_NOTIFY_DISABLE_HIGH_VALUE: 'true',
    }, {
      estimate: highValueEstimate,
      friendId: 'friend-1',
      displayName: '田中太郎',
    })).resolves.toBe(true);

    expect(notifyTelegramSimple).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('balilingual_high_value_notify: skipped by TELEGRAM_NOTIFY_DISABLE_HIGH_VALUE');
  });

  it('sends Telegram notification when TELEGRAM_NOTIFY_DISABLE_HIGH_VALUE is false', async () => {
    await expect(notifyBalilingualHighValue({
      TELEGRAM_BOT_TOKEN: 'token',
      TELEGRAM_CHAT_ID: 'chat',
      TELEGRAM_NOTIFY_DISABLE_HIGH_VALUE: 'false',
    }, {
      estimate: highValueEstimate,
      friendId: 'friend-1',
      displayName: '田中太郎',
    })).resolves.toBe(true);

    expect(notifyTelegramSimple).toHaveBeenCalledWith(
      'token',
      'chat',
      '[balilingual] 高単価見込: 田中太郎様, ペア12週 親子2名, 合計1,596,000円, friend_id=friend-1',
    );
  });

  it('sends Telegram notification when TELEGRAM_NOTIFY_DISABLE_HIGH_VALUE is undefined', async () => {
    await expect(notifyBalilingualHighValue({
      TELEGRAM_BOT_TOKEN: 'token',
      TELEGRAM_CHAT_ID: 'chat',
    }, {
      estimate: highValueEstimate,
      friendId: 'friend-1',
      displayName: '田中太郎',
    })).resolves.toBe(true);

    expect(notifyTelegramSimple).toHaveBeenCalledWith(
      'token',
      'chat',
      '[balilingual] 高単価見込: 田中太郎様, ペア12週 親子2名, 合計1,596,000円, friend_id=friend-1',
    );
  });
});
