import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/api/client';
import {
  Assignment,
  countdown,
  createGovernanceApi,
  deriveVoteState,
  eligibilityText,
  validateReason,
  voteErrorMessage,
} from '../src/api/governance';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async (_u: unknown, _i?: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  );
}
function gov(f: ReturnType<typeof mockFetch>) {
  return createGovernanceApi(createApiClient({ baseUrl: 'https://x.test', getToken: () => 'TOK', fetchImpl: f as unknown as typeof fetch }));
}

const base: Assignment = {
  disputeId: 'd1',
  state: 'voting',
  votingEndsAt: '2026-01-02T00:00:00.000Z',
  owner: 'Anon-abc123',
  goal: { title: 't', description: 'd' },
  appeal: { reason: 'r', extraImageUrl: null },
  proof: null,
  myVote: null,
  result: null,
};
const T0 = new Date('2026-01-01T00:00:00.000Z').getTime();

describe('governance api', () => {
  it('GETs the overview with bearer auth and fills defaults', async () => {
    const f = mockFetch(200, { success: true, assignments: [base] });
    const o = await gov(f).getOverview();
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/governance');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOK');
    expect(o.assignments).toHaveLength(1);
    expect(o.stats.votesCast).toBe(0);
    expect(o.params).toBeNull();
  });

  it('POSTs a vote with only the web contract fields and no signature', async () => {
    const f = mockFetch(201, { success: true, replay: false, vote: 'uphold' });
    const r = await gov(f).castVote('d1', 'uphold', '  because  ');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/governance/votes');
    expect(JSON.parse(init.body as string)).toEqual({ disputeId: 'd1', vote: 'uphold', reason: 'because' });
    expect(r.replay).toBe(false);
  });

  it('omits an empty reason and treats a 200 replay as success', async () => {
    const f = mockFetch(200, { success: true, replay: true, vote: 'overturn' });
    const r = await gov(f).castVote('d1', 'overturn', '   ');
    expect(JSON.parse((f.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ disputeId: 'd1', vote: 'overturn' });
    expect(r.replay).toBe(true);
  });

  it('surfaces 404 and 409 as ApiError', async () => {
    await expect(gov(mockFetch(404, { error: 'Assignment not found' })).castVote('d', 'uphold')).rejects.toMatchObject({ status: 404 });
    await expect(gov(mockFetch(409, { error: 'x' })).getOverview()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('countdown', () => {
  it('formats days, hours, minutes and expiry', () => {
    expect(countdown(base.votingEndsAt, T0).label).toBe('1d 0h left');
    expect(countdown(base.votingEndsAt, T0 + 22.5 * 3600_000).label).toBe('1h 30m left');
    expect(countdown(base.votingEndsAt, T0 + 24 * 3600_000 - 10_000).label).toBe('1m left');
    expect(countdown(base.votingEndsAt, T0 + 24 * 3600_000).expired).toBe(true);
    expect(countdown(null, T0).expired).toBe(false);
  });
});

describe('deriveVoteState', () => {
  it('derives each state', () => {
    expect(deriveVoteState(base, T0).kind).toBe('can_vote');
    expect(deriveVoteState({ ...base, myVote: 'uphold' }, T0)).toEqual({ kind: 'already_voted', vote: 'uphold' });
    expect(deriveVoteState(base, T0 + 25 * 3600_000).kind).toBe('window_closed');
    expect(deriveVoteState({ ...base, state: 'escalated' }, T0).kind).toBe('window_closed');
    expect(
      deriveVoteState({ ...base, state: 'resolved', result: { decision: 'uphold', tally: { overturn: 1, uphold: 2, cast: 3 } } }, T0)
    ).toEqual({ kind: 'resolved', decision: 'uphold' });
  });
});

describe('messages', () => {
  it('maps errors', () => {
    expect(voteErrorMessage(new ApiError('Assignment not found', 404))).toMatch(/not on the panel/);
    expect(voteErrorMessage(new ApiError('You already voted differently on this dispute', 409))).toMatch(/cannot be changed/);
    expect(voteErrorMessage(new ApiError('The voting window has closed', 409))).toMatch(/closed/);
    expect(voteErrorMessage(new ApiError('x', 429))).toMatch(/Too many/);
  });
  it('validates reason and explains eligibility', () => {
    expect(validateReason('a'.repeat(501))).not.toBeNull();
    expect(validateReason('ok')).toBeNull();
    expect(eligibilityText({ votingWindowHours: 48, minCompletedGoals: 3, panelSize: 5, quorum: 3 })).toMatch(/at least 3 completed goals/);
  });
});
