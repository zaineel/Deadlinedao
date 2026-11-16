import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/solana/escrow', () => ({
  sendPayoutFromEscrow: vi.fn(),
  getEscrowAddress: vi.fn(),
  getEscrowBalance: vi.fn(),
  verifyStakeTransaction: vi.fn(),
  calculateEscrowHealth: vi.fn(),
}));
vi.mock('@/lib/solana/client', () => ({ connection: {}, escrowKeypair: {}, getEscrowKeypair: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

import { unsettledGoals } from '@/lib/disputes/logic';
import { unsettledTeamGoalIds } from '@/lib/teams/pool';
import { reconcileRewardRow } from '@/lib/governance/reconcile';
import { BLOCKHASH_EXPIRY_MS } from '@/lib/solana/payout-classify';

const crons: { path: string }[] = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8')
).crons;

describe('every vercel.json cron fails closed', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://localhost:1';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
    process.env.FEATURE_PUSH = 'true';
    process.env.FEATURE_ORGS = 'true';
    process.env.FEATURE_DISPUTES = 'true';
    process.env.FEATURE_GOVERNANCE = 'true';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('lists crons', () => expect(crons.length).toBeGreaterThan(0));

  for (const { path: p } of crons) {
    it(`${p}: 401 without CRON_SECRET, even with a plausible header`, async () => {
      delete process.env.CRON_SECRET;
      const mod = await import(`@/app${p}/route`);
      for (const headers of [{} as Record<string, string>, { authorization: 'Bearer ' }, { authorization: 'Bearer undefined' }]) {
        const res = await mod.GET(new NextRequest(`http://localhost${p}`, { headers }));
        expect(res.status).toBe(401);
      }
    });
    it(`${p}: 401 with a wrong secret`, async () => {
      process.env.CRON_SECRET = 'right-secret';
      const mod = await import(`@/app${p}/route`);
      const res = await mod.GET(
        new NextRequest(`http://localhost${p}`, { headers: { authorization: 'Bearer wrong-secret' } })
      );
      expect(res.status).toBe(401);
    });
  }
});

describe('reward-run gate statuses', () => {
  it('blocks on unsettled appeals and on disputes under governance (goal stays disputed)', () => {
    const goals = ['active', 'completed', 'failed', 'rejected_appealable', 'disputed'].map((status) => ({ status }));
    expect(unsettledGoals(goals).map((g) => g.status)).toEqual(['rejected_appealable', 'disputed']);
  });
  it('blocks on unsettled team goals', () => {
    expect(
      unsettledTeamGoalIds([
        { id: 'a', status: 'settled' },
        { id: 'b', status: 'open' },
      ] as Parameters<typeof unsettledTeamGoalIds>[0])
    ).toEqual(['b']);
  });
});

describe('governance reward reconcile', () => {
  const row = (over = {}) => ({ id: 'r1', tx_signature: 'SIG', created_at: new Date(0).toISOString(), ...over });
  const deps = (status: unknown, ageMs = 0) => ({
    getStatus: vi.fn().mockResolvedValue(status),
    finalize: vi.fn().mockResolvedValue({ error: null }),
    release: vi.fn().mockResolvedValue(undefined),
    now: () => ageMs,
  });

  it('finalizes a landed transfer', async () => {
    const d = deps({ confirmationStatus: 'finalized', err: null });
    expect(await reconcileRewardRow(row(), d)).toBe('finalized');
    expect(d.finalize).toHaveBeenCalledWith('r1', 'SIG');
    expect(d.release).not.toHaveBeenCalled();
  });
  it('releases only on an on-chain failure or after blockhash expiry', async () => {
    const failed = deps({ confirmationStatus: 'confirmed', err: {} });
    expect(await reconcileRewardRow(row(), failed)).toBe('released');
    const expired = deps(null, BLOCKHASH_EXPIRY_MS + 1);
    expect(await reconcileRewardRow(row(), expired)).toBe('released');
    const young = deps(null, 1000);
    expect(await reconcileRewardRow(row(), young)).toBe('waiting');
    expect(young.release).not.toHaveBeenCalled();
  });
  it('never releases a row with no signature', async () => {
    const d = deps(null, BLOCKHASH_EXPIRY_MS * 10);
    expect(await reconcileRewardRow(row({ tx_signature: null }), d)).toBe('manual');
    expect(d.release).not.toHaveBeenCalled();
  });
  it('reports an RPC error without touching the row', async () => {
    const d = deps(null);
    d.getStatus.mockRejectedValue(new Error('rpc down'));
    expect(await reconcileRewardRow(row(), d)).toBe('error');
    expect(d.release).not.toHaveBeenCalled();
    expect(d.finalize).not.toHaveBeenCalled();
  });
});
