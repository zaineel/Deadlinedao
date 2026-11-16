import { describe, it, expect, vi } from 'vitest';
import { settleTeamGoal, type SettleDeps } from '@/lib/teams/settle';

const past = new Date(Date.now() - 86_400_000).toISOString();
const g = (id: string, status: string) => ({
  id,
  wallet_address: id.toUpperCase(),
  stake_amount: 1,
  stake_tx_signature: 'sig',
  status,
});

function makeDeps(overrides: Partial<SettleDeps> = {}) {
  const claimed = new Set<string>();
  const deps: SettleDeps = {
    claim: vi.fn(async (goalId: string) => {
      if (claimed.has(goalId)) return { claimed: false, payoutId: null, error: null };
      claimed.add(goalId);
      return { claimed: true, payoutId: `p-${goalId}`, error: null };
    }),
    send: vi.fn(async () => ({ signature: 'tx', error: null })),
    finalize: vi.fn(async () => undefined),
    markUnconfirmed: vi.fn(async () => undefined),
    isUnresolved: vi.fn(async () => false),
    release: vi.fn(async (payoutId: string) => {
      claimed.delete(payoutId.replace('p-', ''));
    }),
    ...overrides,
  };
  return deps;
}

describe('settleTeamGoal', () => {
  it('refuses with a non-final member goal and sends nothing', async () => {
    const deps = makeDeps();
    const r = await settleTeamGoal({ deadline: past }, [g('a', 'completed'), g('b', 'active')], deps);
    expect(r).toMatchObject({ ok: false, reason: 'non_final_goals' });
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('pays completers claim-before-send', async () => {
    const deps = makeDeps();
    const r = await settleTeamGoal({ deadline: past }, [g('a', 'completed'), g('b', 'failed')], deps);
    expect(r).toMatchObject({ ok: true, complete: true, distributed: 1, remainderToGlobal: 0 });
    expect(deps.send).toHaveBeenCalledWith('A', 1);
    expect(deps.finalize).toHaveBeenCalledWith('p-a', 'tx');
    const claimOrder = (deps.claim as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const sendOrder = (deps.send as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(sendOrder);
  });

  it('is idempotent: a second run sends nothing', async () => {
    const deps = makeDeps();
    const goals = [g('a', 'completed'), g('b', 'completed'), g('c', 'failed')];
    await settleTeamGoal({ deadline: past }, goals, deps);
    const sends = (deps.send as ReturnType<typeof vi.fn>).mock.calls.length;
    const again = await settleTeamGoal({ deadline: past }, goals, deps);
    expect((deps.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(sends);
    expect(again).toMatchObject({ ok: true, complete: true });
    expect(again.ok && again.outcomes.every((o) => o.status === 'already_distributed')).toBe(true);
  });

  it('releases the claim on a failed send and a re-run retries it', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ signature: null, error: new Error('rpc down') })
      .mockResolvedValue({ signature: 'tx2', error: null });
    const deps = makeDeps({ send });
    const goals = [g('a', 'completed'), g('b', 'failed')];
    const first = await settleTeamGoal({ deadline: past }, goals, deps);
    expect(first).toMatchObject({ ok: true, complete: false });
    expect(deps.release).toHaveBeenCalledWith('p-a');
    expect(deps.finalize).not.toHaveBeenCalled();
    const second = await settleTeamGoal({ deadline: past }, goals, deps);
    expect(second).toMatchObject({ ok: true, complete: true });
    expect(deps.finalize).toHaveBeenCalledWith('p-a', 'tx2');
  });

  it('treats a claim error as failed without sending', async () => {
    const deps = makeDeps({ claim: vi.fn(async () => ({ claimed: false, payoutId: null, error: new Error('db') })) });
    const r = await settleTeamGoal({ deadline: past }, [g('a', 'completed'), g('b', 'failed')], deps);
    expect(r).toMatchObject({ ok: true, complete: false });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('dry run plans without claiming or sending', async () => {
    const deps = makeDeps();
    const r = await settleTeamGoal({ deadline: past }, [g('a', 'completed'), g('b', 'failed')], deps, { dryRun: true });
    expect(r).toMatchObject({ ok: true, dryRun: true, planned: [{ goalId: 'a', amount: 1 }] });
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it('nobody completed: no payouts, whole pool is the global remainder', async () => {
    const deps = makeDeps();
    const r = await settleTeamGoal({ deadline: past }, [g('a', 'failed'), g('b', 'failed')], deps);
    expect(r).toMatchObject({ ok: true, complete: true, distributed: 0, remainderToGlobal: 2 });
    expect(deps.send).not.toHaveBeenCalled();
  });

  describe('ambiguous sends', () => {
    const goals = [g('a', 'completed'), g('b', 'failed')];

    it('definite failure (no signature, not ambiguous) releases the claim', async () => {
      const deps = makeDeps({ send: vi.fn(async () => ({ signature: null, error: new Error('x'), ambiguous: false })) });
      const r = await settleTeamGoal({ deadline: past }, goals, deps);
      expect(deps.release).toHaveBeenCalledWith('p-a');
      expect(deps.markUnconfirmed).not.toHaveBeenCalled();
      expect(r).toMatchObject({ ok: true, complete: false });
    });

    it('ambiguous keeps the claim, marks unconfirmed and is not complete', async () => {
      const deps = makeDeps({ send: vi.fn(async () => ({ signature: 'sigX', error: new Error('timeout'), ambiguous: true })) });
      const r = await settleTeamGoal({ deadline: past }, goals, deps);
      expect(deps.release).not.toHaveBeenCalled();
      expect(deps.finalize).not.toHaveBeenCalled();
      expect(deps.markUnconfirmed).toHaveBeenCalledWith('p-a', 'sigX');
      expect(r).toMatchObject({ ok: true, complete: false, outcomes: [{ status: 'unconfirmed', signature: 'sigX' }] });
    });

    it('rerun after an ambiguous send does not pay again and stays incomplete', async () => {
      const send = vi.fn(async () => ({ signature: 'sigX', error: new Error('timeout'), ambiguous: true }));
      const deps = makeDeps({ send, isUnresolved: vi.fn(async () => true) });
      await settleTeamGoal({ deadline: past }, goals, deps);
      const again = await settleTeamGoal({ deadline: past }, goals, deps);
      expect(send).toHaveBeenCalledTimes(1);
      expect(again).toMatchObject({ ok: true, complete: false, outcomes: [{ status: 'unconfirmed' }] });
    });

    it('ambiguous without a signature still keeps the claim', async () => {
      const deps = makeDeps({ send: vi.fn(async () => ({ signature: null, error: new Error('t'), ambiguous: true })) });
      const r = await settleTeamGoal({ deadline: past }, goals, deps);
      expect(deps.release).not.toHaveBeenCalled();
      expect(r).toMatchObject({ complete: false });
    });

    it('appeal/dispute statuses block settlement', async () => {
      const deps = makeDeps();
      for (const st of ['rejected_appealable', 'disputed']) {
        const r = await settleTeamGoal({ deadline: past }, [g('a', 'completed'), g('b', st)], deps);
        expect(r).toMatchObject({ ok: false, reason: 'non_final_goals', blockingGoalIds: ['b'] });
      }
      expect(deps.send).not.toHaveBeenCalled();
    });
  });
});
