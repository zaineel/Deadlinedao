import { describe, it, expect } from 'vitest';
import { computeOrgStats, MIN_GROUP_SIZE, type StatsGoal, type StatsMember } from '@/lib/orgs/stats';
import { extractFundingLamports, isOrgAdmin, windowHasEnded, type ParsedTxLike } from '@/lib/orgs/funding';
import { createOrgSchema, fundOrgSchema, joinOrgSchema } from '@/lib/validation/orgs-schemas';
import { Keypair } from '@solana/web3.js';

const W0 = Date.parse('2026-01-01T00:00:00Z');
const W1 = Date.parse('2026-03-01T00:00:00Z');
const members = (n: number, consent = true): StatsMember[] =>
  Array.from({ length: n }, (_, i) => ({ wallet: `w${i}`, joinedAtMs: W0, consent }));
const goalFor = (i: number, status: string, stake = 1e9): StatsGoal => ({
  wallet: `w${i}`, status, createdAtMs: W0 + 1000, stakeLamports: stake,
});
const base = { windowStartMs: W0, windowEndMs: W1 };

describe('computeOrgStats (k-anonymity)', () => {
  it('suppresses everything below the minimum group size', () => {
    expect(MIN_GROUP_SIZE).toBe(5);
    const s = computeOrgStats({ ...base, members: members(4), goals: [goalFor(0, 'completed')], matches: [] });
    expect(s).toEqual({ suppressed: true, minGroupSize: 5, reason: 'group_too_small' });
  });

  it('non-consenting members never count toward the group', () => {
    const all = [...members(4), ...members(10, false).map((m) => ({ ...m, wallet: 'x' + m.wallet }))];
    expect(computeOrgStats({ ...base, members: all, goals: [], matches: [] }).suppressed).toBe(true);
  });

  it('shows aggregates once 5 consenting participants exist and ignores others', () => {
    const goals = [
      ...[0, 1, 2, 3].map((i) => goalFor(i, 'completed')),
      goalFor(4, 'failed'),
      { wallet: 'outsider', status: 'completed', createdAtMs: W0 + 5, stakeLamports: 99e9 },
      { ...goalFor(0, 'completed'), createdAtMs: W1 + 1 }, // outside window
    ];
    const s = computeOrgStats({
      ...base,
      members: members(5),
      goals,
      matches: [{ wallet: 'w0', amountLamports: 5e8 }, { wallet: 'outsider', amountLamports: 7e9 }],
    });
    expect(s).toEqual({
      suppressed: false, minGroupSize: 5, consentingMembers: 5, participants: 5,
      completionRate: 0.8, totalStakedLamports: 5e9, totalMatchedLamports: 5e8,
    });
  });

  it('hides rates and totals when fewer than 5 consenting members participated', () => {
    const s = computeOrgStats({ ...base, members: members(6), goals: [goalFor(0, 'completed'), goalFor(1, 'failed')], matches: [] });
    expect(s).toMatchObject({ suppressed: false, participants: 2, completionRate: null, totalStakedLamports: null, totalMatchedLamports: null });
  });

  it('result never contains wallets or goal details', () => {
    const s = computeOrgStats({ ...base, members: members(5), goals: [0, 1, 2, 3, 4].map((i) => goalFor(i, 'completed')), matches: [] });
    expect(JSON.stringify(s)).not.toMatch(/w\d/);
  });
});

describe('extractFundingLamports', () => {
  const tx = (ixs: ParsedTxLike['transaction']['message']['instructions'], err: unknown = null): ParsedTxLike => ({
    meta: { err },
    transaction: { message: { instructions: ixs } },
  });
  const transfer = (source: string, destination: string, lamports: number) => ({
    program: 'system', parsed: { type: 'transfer', info: { source, destination, lamports } },
  });

  it('credits the amount that actually moved from admin to escrow', () => {
    expect(extractFundingLamports(tx([transfer('admin', 'escrow', 3e9)]), 'admin', 'escrow')).toEqual({ ok: true, lamports: 3e9 });
    expect(extractFundingLamports(tx([transfer('admin', 'escrow', 1e9), transfer('admin', 'escrow', 2e9)]), 'admin', 'escrow'))
      .toEqual({ ok: true, lamports: 3e9 });
  });

  it('rejects wrong sender, wrong destination, failed tx and non-transfers', () => {
    expect(extractFundingLamports(tx([transfer('someone', 'escrow', 1e9)]), 'admin', 'escrow')).toEqual({ ok: false, reason: 'no_transfer' });
    expect(extractFundingLamports(tx([transfer('admin', 'other', 1e9)]), 'admin', 'escrow')).toEqual({ ok: false, reason: 'no_transfer' });
    expect(extractFundingLamports(tx([transfer('admin', 'escrow', 1e9)], { err: 1 }), 'admin', 'escrow')).toEqual({ ok: false, reason: 'tx_failed' });
    expect(extractFundingLamports(tx([{ program: 'spl-token', parsed: { type: 'transfer', info: { source: 'admin', destination: 'escrow', lamports: 5 } } }]), 'admin', 'escrow'))
      .toEqual({ ok: false, reason: 'no_transfer' });
    expect(extractFundingLamports(tx([]), 'admin', 'escrow')).toEqual({ ok: false, reason: 'no_transfer' });
  });
});

describe('authorization and window helpers', () => {
  it('isOrgAdmin checks the admin_wallets list exactly', () => {
    expect(isOrgAdmin(['a', 'b'], 'a')).toBe(true);
    expect(isOrgAdmin(['a', 'b'], 'c')).toBe(false);
    expect(isOrgAdmin([], 'a')).toBe(false);
  });
  it('withdrawals open only strictly after the window ends', () => {
    expect(windowHasEnded(W1, W1)).toBe(false);
    expect(windowHasEnded(W1 + 1, W1)).toBe(true);
    expect(windowHasEnded(W0, W1)).toBe(false);
  });
});

describe('orgs validation schemas', () => {
  const future = new Date(Date.now() + 30 * 864e5).toISOString();
  const now = new Date().toISOString();
  const valid = { name: 'Acme', matchRatePercent: 50, perMemberCapSol: 0.5, windowStart: now, windowEnd: future };

  it('accepts a valid org and defaults extra admins', () => {
    const r = createOrgSchema.safeParse(valid);
    expect(r.success && r.data.additionalAdminWallets).toEqual([]);
  });
  it('rejects bad rates, caps, windows and wallets', () => {
    expect(createOrgSchema.safeParse({ ...valid, matchRatePercent: 0 }).success).toBe(false);
    expect(createOrgSchema.safeParse({ ...valid, matchRatePercent: 101 }).success).toBe(false);
    expect(createOrgSchema.safeParse({ ...valid, perMemberCapSol: 0.00001 }).success).toBe(false);
    expect(createOrgSchema.safeParse({ ...valid, windowEnd: now, windowStart: future }).success).toBe(false);
    expect(createOrgSchema.safeParse({ ...valid, windowStart: '2020-01-01', windowEnd: '2020-02-01' }).success).toBe(false);
    expect(createOrgSchema.safeParse({ ...valid, additionalAdminWallets: ['nope'] }).success).toBe(false);
    expect(createOrgSchema.safeParse({ ...valid, additionalAdminWallets: [Keypair.generate().publicKey.toBase58()] }).success).toBe(true);
  });
  it('validates signature and invite code shape', () => {
    expect(fundOrgSchema.safeParse({ signature: '5'.repeat(88) }).success).toBe(true);
    expect(fundOrgSchema.safeParse({ signature: 'short' }).success).toBe(false);
    expect(joinOrgSchema.safeParse({ inviteCode: 'abcDEF123-_x' }).success).toBe(true);
    expect(joinOrgSchema.safeParse({ inviteCode: "x'; drop" }).success).toBe(false);
  });
});
