import { describe, it, expect } from 'vitest';
import {
  applyRelease,
  applyReservation,
  decideMatch,
  isDefiniteSendFailure,
  planMatches,
  solToLamportsExact,
  type MemberState,
  type PoolState,
  type SweepGoal,
} from '@/lib/orgs/match';

const SOL = 1_000_000_000;
const T0 = Date.parse('2026-01-01T00:00:00Z');
const T1 = Date.parse('2026-03-01T00:00:00Z');

const pool = (o: Partial<PoolState> = {}): PoolState => ({
  remainingLamports: 10 * SOL,
  matchRateBps: 5000, // 50%
  perMemberCapLamports: 1 * SOL,
  windowStartMs: T0,
  windowEndMs: T1,
  ...o,
});
const member = (o: Partial<MemberState> = {}): MemberState => ({ joinedAtMs: T0 - 1000, matchedLamports: 0, ...o });
const goal = (o: Partial<{ status: string; createdAtMs: number; stakeLamports: number }> = {}) => ({
  status: 'completed',
  createdAtMs: T0 + 1000,
  stakeLamports: 0.4 * SOL,
  ...o,
});

describe('solToLamportsExact', () => {
  it('converts 4-decimal SOL without float drift', () => {
    expect(solToLamportsExact(0.1)).toBe(100_000_000);
    expect(solToLamportsExact('0.3')).toBe(300_000_000);
    expect(solToLamportsExact(0.0001)).toBe(100_000);
  });
});

describe('decideMatch', () => {
  it('matches stake * rate', () => {
    expect(decideMatch({ goal: goal(), member: member(), pool: pool() })).toEqual({ ok: true, amountLamports: 0.2 * SOL });
  });

  it('rate extremes: 100% and 0.01%', () => {
    expect(decideMatch({ goal: goal(), member: member(), pool: pool({ matchRateBps: 10_000, perMemberCapLamports: 5 * SOL }) }))
      .toEqual({ ok: true, amountLamports: 0.4 * SOL });
    // 0.4 SOL * 0.01% = 0.00004 SOL, below granularity
    expect(decideMatch({ goal: goal(), member: member(), pool: pool({ matchRateBps: 1 }) }))
      .toEqual({ ok: false, reason: 'zero_match' });
  });

  it('floors to payout granularity (0.0001 SOL)', () => {
    const d = decideMatch({ goal: goal({ stakeLamports: solToLamportsExact(0.3333) }), member: member(), pool: pool({ matchRateBps: 3333 }) });
    expect(d.ok && d.amountLamports % 100_000).toBe(0);
  });

  it('caps at the per-member cap remaining', () => {
    const d = decideMatch({ goal: goal({ stakeLamports: 10 * SOL }), member: member(), pool: pool() });
    expect(d).toEqual({ ok: true, amountLamports: 1 * SOL });
    const d2 = decideMatch({ goal: goal({ stakeLamports: 10 * SOL }), member: member({ matchedLamports: 0.7 * SOL }), pool: pool() });
    expect(d2).toEqual({ ok: true, amountLamports: 0.3 * SOL });
  });

  it('refuses when the cap is already reached', () => {
    expect(decideMatch({ goal: goal(), member: member({ matchedLamports: 1 * SOL }), pool: pool() }))
      .toEqual({ ok: false, reason: 'cap_reached' });
  });

  it('caps at the pool balance and refuses an exhausted pool', () => {
    expect(decideMatch({ goal: goal(), member: member(), pool: pool({ remainingLamports: 0.05 * SOL }) }))
      .toEqual({ ok: true, amountLamports: 0.05 * SOL });
    expect(decideMatch({ goal: goal(), member: member(), pool: pool({ remainingLamports: 0 }) }))
      .toEqual({ ok: false, reason: 'pool_exhausted' });
    expect(decideMatch({ goal: goal(), member: member(), pool: pool({ remainingLamports: 99_999 }) }))
      .toEqual({ ok: false, reason: 'pool_exhausted' });
  });

  it('window edges are inclusive; one ms outside is refused', () => {
    expect(decideMatch({ goal: goal({ createdAtMs: T0 }), member: member(), pool: pool() }).ok).toBe(true);
    expect(decideMatch({ goal: goal({ createdAtMs: T1 }), member: member(), pool: pool() }).ok).toBe(true);
    expect(decideMatch({ goal: goal({ createdAtMs: T0 - 1 }), member: member(), pool: pool() }))
      .toEqual({ ok: false, reason: 'outside_window' });
    expect(decideMatch({ goal: goal({ createdAtMs: T1 + 1 }), member: member(), pool: pool() }))
      .toEqual({ ok: false, reason: 'outside_window' });
  });

  it('refuses non-members and members who joined after the goal was created', () => {
    expect(decideMatch({ goal: goal(), member: null, pool: pool() })).toEqual({ ok: false, reason: 'not_member' });
    expect(decideMatch({ goal: goal({ createdAtMs: T0 + 10 }), member: member({ joinedAtMs: T0 + 11 }), pool: pool() }))
      .toEqual({ ok: false, reason: 'joined_after_goal' });
    // joined in the same instant counts
    expect(decideMatch({ goal: goal({ createdAtMs: T0 + 10 }), member: member({ joinedAtMs: T0 + 10 }), pool: pool() }).ok).toBe(true);
  });

  it('refuses goals that are not completed', () => {
    for (const status of ['active', 'failed', 'pending_validation']) {
      expect(decideMatch({ goal: goal({ status }), member: member(), pool: pool() }))
        .toEqual({ ok: false, reason: 'goal_not_completed' });
    }
  });

  it('refuses a zero stake', () => {
    expect(decideMatch({ goal: goal({ stakeLamports: 0 }), member: member(), pool: pool() }))
      .toEqual({ ok: false, reason: 'zero_match' });
  });
});

describe('reservation model (mirrors org_reserve_match)', () => {
  it('check-and-decrement: only as many requests succeed as the pool can pay', () => {
    // pool of 0.5 SOL, five concurrent 0.2 SOL requests from different members: exactly 2 win
    let p = pool({ remainingLamports: 0.5 * SOL });
    let wins = 0;
    for (let i = 0; i < 5; i++) {
      const r = applyReservation(p, member(), 0.2 * SOL);
      if (r) {
        p = r.pool;
        wins++;
      }
    }
    expect(wins).toBe(2);
    expect(p.remainingLamports).toBe(0.1 * SOL);
  });

  it('never lets one member exceed the cap across concurrent goals', () => {
    let p = pool();
    let m = member();
    let paid = 0;
    for (let i = 0; i < 10; i++) {
      const r = applyReservation(p, m, 0.3 * SOL);
      if (r) {
        p = r.pool;
        m = r.member;
        paid += 0.3 * SOL;
      }
    }
    expect(paid).toBeLessThanOrEqual(1 * SOL);
    expect(m.matchedLamports).toBe(0.9 * SOL);
  });

  it('rejects non-positive or fractional amounts', () => {
    expect(applyReservation(pool(), member(), 0)).toBeNull();
    expect(applyReservation(pool(), member(), -5)).toBeNull();
    expect(applyReservation(pool(), member(), 1.5)).toBeNull();
  });

  it('release restores pool and member exactly', () => {
    const p = pool();
    const m = member();
    const r = applyReservation(p, m, 0.2 * SOL)!;
    const back = applyRelease(r.pool, r.member, 0.2 * SOL);
    expect(back.pool.remainingLamports).toBe(p.remainingLamports);
    expect(back.member.matchedLamports).toBe(0);
  });
});

describe('planMatches', () => {
  const g = (id: string, wallet: string, createdAtMs: number, stake = 0.4 * SOL): SweepGoal => ({
    id, wallet, status: 'completed', createdAtMs, stakeLamports: stake,
  });

  it('exhausts the pool in creation order and never overspends', () => {
    const goals = [g('c', 'w3', T0 + 3), g('a', 'w1', T0 + 1), g('b', 'w2', T0 + 2)];
    const members = new Map([['w1', member()], ['w2', member()], ['w3', member()]]);
    const { planned, skipped } = planMatches({ goals, members, pool: pool({ remainingLamports: 0.5 * SOL }) });
    expect(planned.map((p) => p.goalId)).toEqual(['a', 'b', 'c']);
    expect(planned.map((p) => p.amountLamports)).toEqual([0.2 * SOL, 0.2 * SOL, 0.1 * SOL]);
    expect(planned.reduce((s, p) => s + p.amountLamports, 0)).toBe(0.5 * SOL);
    expect(skipped).toEqual([]);
  });

  it('skips non-members and exhausted pool, tracking per-member cap across goals', () => {
    const goals = [
      g('a', 'w1', T0 + 1, 2 * SOL),
      g('b', 'w1', T0 + 2, 2 * SOL), // cap (1 SOL) already used by 'a'
      g('c', 'stranger', T0 + 3),
    ];
    const { planned, skipped } = planMatches({ goals, members: new Map([['w1', member()]]), pool: pool() });
    expect(planned).toEqual([{ goalId: 'a', wallet: 'w1', amountLamports: 1 * SOL }]);
    expect(skipped).toEqual([
      { goalId: 'b', reason: 'cap_reached' },
      { goalId: 'c', reason: 'not_member' },
    ]);
  });

  it('plans nothing for an empty pool', () => {
    const { planned } = planMatches({ goals: [g('a', 'w1', T0 + 1)], members: new Map([['w1', member()]]), pool: pool({ remainingLamports: 0 }) });
    expect(planned).toEqual([]);
  });
});

describe('isDefiniteSendFailure', () => {
  it('only a non-ambiguous failure without a signature is definite', () => {
    expect(isDefiniteSendFailure({ signature: null, error: new Error('Insufficient escrow balance'), ambiguous: false })).toBe(true);
    expect(isDefiniteSendFailure({ signature: 'sig', error: new Error('not confirmed'), ambiguous: true })).toBe(false);
    expect(isDefiniteSendFailure({ signature: null, error: new Error('fetch failed'), ambiguous: true })).toBe(false);
    expect(isDefiniteSendFailure({ signature: null, error: null, ambiguous: false })).toBe(false);
  });
});
