import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldExecuteForFriend } from '../services/tenant-guard-runtime.js';

describe('shouldExecuteForFriend', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when friend and automation accounts match', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(shouldExecuteForFriend('acc-1', 'acc-1')).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns true for legacy null automation account and logs a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(shouldExecuteForFriend('acc-1', null)).toBe(true);
    expect(warn).toHaveBeenCalledWith('cross-tenant legacy automation account is null: friend=acc-1');
  });

  it('returns false when friend and automation accounts mismatch and logs a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(shouldExecuteForFriend('acc-1', 'acc-2')).toBe(false);
    expect(warn).toHaveBeenCalledWith('cross-tenant execution blocked: friend=acc-1 automation=acc-2');
  });
});

