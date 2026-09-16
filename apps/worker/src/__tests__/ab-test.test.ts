import { describe, it, expect } from 'vitest';
import { pickVariant } from '../services/ab-test.js';

describe('pickVariant', () => {
  it('returns same variant for same input (deterministic)', async () => {
    const a1 = await pickVariant('seed', 'test1', 'friend1', ['A', 'B'], [50, 50]);
    const a2 = await pickVariant('seed', 'test1', 'friend1', ['A', 'B'], [50, 50]);
    expect(a1).toBe(a2);
  });

  it('different friend can get different variant', async () => {
    const r: string[] = [];
    for (let i = 0; i < 100; i++) {
      r.push(await pickVariant('seed', 'test', `friend${i}`, ['A', 'B'], [50, 50]));
    }
    const a = r.filter((v) => v === 'A').length;
    const b = r.filter((v) => v === 'B').length;
    expect(a).toBeGreaterThan(20);
    expect(b).toBeGreaterThan(20);
  });

  it('honors weights (90/10 heavily skewed to A)', async () => {
    const r: string[] = [];
    for (let i = 0; i < 500; i++) {
      r.push(await pickVariant('seed', 't', `f${i}`, ['A', 'B'], [90, 10]));
    }
    const a = r.filter((v) => v === 'A').length;
    expect(a / 500).toBeGreaterThan(0.8);
    expect(a / 500).toBeLessThan(1.0);
  });

  it('supports 3+ variants', async () => {
    const result = await pickVariant('s', 't', 'f', ['A', 'B', 'C'], [33, 33, 34]);
    expect(['A', 'B', 'C']).toContain(result);
  });

  it('throws on length mismatch', async () => {
    await expect(pickVariant('s', 't', 'f', ['A', 'B'], [100])).rejects.toThrow(/length mismatch/);
  });

  it('returns first variant when all weights are 0', async () => {
    const result = await pickVariant('s', 't', 'f', ['A', 'B'], [0, 0]);
    expect(result).toBe('A');
  });
});
