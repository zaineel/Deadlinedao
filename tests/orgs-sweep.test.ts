import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/supabase/payouts', () => ({ claimPayout: vi.fn(), markPayoutUnconfirmed: vi.fn(), finalizePayout: vi.fn(), releasePayout: vi.fn() }));
vi.mock('@/lib/solana/escrow', () => ({ sendPayoutFromEscrow: vi.fn() }));
vi.mock('@/lib/orgs/db', () => ({
  reserveMatch: vi.fn(),
  releaseMatch: vi.fn(),
  markMatchPaid: vi.fn(),
  getOrg: vi.fn(),
}));

import { executeMatch, type MatchDeps } from '@/lib/orgs/sweep';
import { GET as orgsGet } from '@/app/api/orgs/route';
import { GET as cronGet } from '@/app/api/cron/org-matches/route';
import { POST as adminPost } from '@/app/api/admin/org-matches/route';
import { NextRequest } from 'next/server';

const plan = { goalId: 'g1', wallet: 'w1', amountLamports: 200_000_000 };

function deps(over: Partial<MatchDeps> = {}): MatchDeps & { calls: string[] } {
  const calls: string[] = [];
  const d: MatchDeps = {
    reserve: vi.fn(async () => { calls.push('reserve'); return { id: 'm1', error: false }; }),
    releaseReservation: vi.fn(async () => { calls.push('releaseReservation'); }),
    markPaid: vi.fn(async () => { calls.push('markPaid'); }),
    claim: vi.fn(async () => { calls.push('claim'); return { claimed: true, payoutId: 'p1', error: false }; }),
    finalize: vi.fn(async () => { calls.push('finalize'); }),
    releasePayoutClaim: vi.fn(async () => { calls.push('releasePayoutClaim'); }),
    markUnconfirmed: vi.fn(async () => { calls.push('markUnconfirmed'); }),
    send: vi.fn(async () => { calls.push('send'); return { signature: 'sig', error: null, ambiguous: false }; }),
    ...over,
  };
  return Object.assign(d, { calls });
}

describe('executeMatch ordering (claim-before-send)', () => {
  it('reserves, claims, sends, then finalizes both records', async () => {
    const d = deps();
    const out = await executeMatch(d, 'org1', plan);
    expect(out).toEqual({ status: 'paid', goalId: 'g1', signature: 'sig', amountLamports: 200_000_000 });
    expect(d.calls).toEqual(['reserve', 'claim', 'send', 'finalize', 'markPaid']);
    expect(d.send).toHaveBeenCalledWith('w1', 0.2);
    expect(d.claim).toHaveBeenCalledWith('g1', 'w1', 0.2);
  });

  it('never sends when the reservation is refused', async () => {
    const d = deps({ reserve: vi.fn(async () => ({ id: null, error: false })) });
    expect((await executeMatch(d, 'org1', plan)).status).toBe('refused');
    expect(d.send).not.toHaveBeenCalled();
    expect(d.claim).not.toHaveBeenCalled();
  });

  it('never sends and returns the reservation when the payout is already claimed', async () => {
    const d = deps({ claim: vi.fn(async () => ({ claimed: false, payoutId: null, error: false })) });
    expect((await executeMatch(d, 'org1', plan)).status).toBe('already_paid');
    expect(d.send).not.toHaveBeenCalled();
    expect(d.releaseReservation).toHaveBeenCalledWith('m1');
  });

  it('returns both claims on a definite send failure', async () => {
    const d = deps({ send: vi.fn(async () => ({ signature: null, error: new Error('Insufficient escrow balance. Has 0 SOL, needs 0.2 SOL'), ambiguous: false })) });
    expect((await executeMatch(d, 'org1', plan)).status).toBe('failed');
    expect(d.releasePayoutClaim).toHaveBeenCalledWith('p1');
    expect(d.releaseReservation).toHaveBeenCalledWith('m1');
  });

  it('keeps everything reserved when the send outcome is ambiguous', async () => {
    const d = deps({ send: vi.fn(async () => ({ signature: 'maybe', error: new Error('Transaction was not confirmed in 30.00 seconds'), ambiguous: true })) });
    expect((await executeMatch(d, 'org1', plan)).status).toBe('ambiguous');
    expect(d.markUnconfirmed).toHaveBeenCalledWith('p1', 'maybe');
    expect(d.finalize).not.toHaveBeenCalled();
    expect(d.releasePayoutClaim).not.toHaveBeenCalled();
    expect(d.releaseReservation).not.toHaveBeenCalled();
    expect(d.markPaid).not.toHaveBeenCalled();
  });

  it('simulated race: two sweeps on one goal send once', async () => {
    // the DB makes the reservation unique per goal: second reserve returns null
    let reserved = false;
    const sends = vi.fn(async () => ({ signature: 'sig', error: null, ambiguous: false }));
    const mk = () => deps({
      reserve: vi.fn(async () => {
        if (reserved) return { id: null, error: false };
        reserved = true;
        return { id: 'm1', error: false };
      }),
      send: sends,
    });
    const [a, b] = await Promise.all([executeMatch(mk(), 'org1', plan), executeMatch(mk(), 'org1', plan)]);
    expect([a.status, b.status].sort()).toEqual(['paid', 'refused']);
    expect(sends).toHaveBeenCalledTimes(1);
  });
});

describe('route guards', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.FEATURE_ORGS;
    delete process.env.CRON_SECRET;
    delete process.env.ADMIN_API_KEY;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('routes 404 when the flag is off', async () => {
    expect((await orgsGet(new NextRequest('http://x/api/orgs'))).status).toBe(404);
    expect((await cronGet(new NextRequest('http://x/api/cron/org-matches'))).status).toBe(404);
    expect((await adminPost(new NextRequest('http://x/api/admin/org-matches', { method: 'POST' }))).status).toBe(404);
  });

  it('user routes need a session; cron needs the secret; admin needs the key', async () => {
    process.env.FEATURE_ORGS = 'true';
    expect((await orgsGet(new NextRequest('http://x/api/orgs'))).status).toBe(401);
    expect((await cronGet(new NextRequest('http://x/api/cron/org-matches'))).status).toBe(401);
    process.env.CRON_SECRET = 'secret';
    expect((await cronGet(new NextRequest('http://x/api/cron/org-matches', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
    expect((await adminPost(new NextRequest('http://x/api/admin/org-matches', { method: 'POST' }))).status).toBe(503);
    process.env.ADMIN_API_KEY = 'k';
    expect((await adminPost(new NextRequest('http://x/api/admin/org-matches', { method: 'POST', headers: { 'x-admin-key': 'bad' } }))).status).toBe(401);
  });
});
