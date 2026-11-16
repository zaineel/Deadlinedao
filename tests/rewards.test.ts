import { describe, it, expect } from 'vitest';
import { computeRewardPayouts } from '@/lib/solana/payouts';
import type { Goal } from '@/types';

const g = (id: string, wallet: string, stake: number) =>
  ({ id, wallet_address: wallet, stake_amount: stake }) as Goal;

describe('computeRewardPayouts', () => {
  it('splits the failed pool pro rata, one entry per goal', () => {
    const out = computeRewardPayouts([g('a', 'W1', 1), g('b', 'W1', 3)], [g('c', 'L', 2), g('d', 'L', 0.5)]);
    expect(out).toEqual([
      { goalId: 'a', recipient: 'W1', amount: 0.625 },
      { goalId: 'b', recipient: 'W1', amount: 1.875 },
    ]);
  });
  it('never pays out more than the failed pool', () => {
    const out = computeRewardPayouts([g('a', 'W1', 1), g('b', 'W2', 1), g('c', 'W3', 1)], [g('x', 'L', 1)]);
    expect(out.reduce((s, p) => s + p.amount, 0)).toBeLessThanOrEqual(1);
  });
  it('pays nothing without winners or losers', () => {
    expect(computeRewardPayouts([g('a', 'W1', 1)], [])).toEqual([]);
    expect(computeRewardPayouts([], [g('c', 'L', 1)])).toEqual([]);
  });
});
