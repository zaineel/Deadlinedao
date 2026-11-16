import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/api/client';
import {
  buildLeaderboard,
  createTeamsApi,
  isValidInviteCode,
  normalizeInviteCode,
  stakeActionFor,
  stakeOnTeamGoal,
  TeamDetail,
  TeamGoalView,
  validateTeamGoalForm,
} from '../src/api/teams';
import { toBase64 } from '../src/wallet/encoding';
// Web builders: the app's invite-code rules must match the server's.
import { INVITE_CODE_LENGTH, isValidInviteCode as webValid, normalizeInviteCode as webNormalize } from '../../../lib/teams/invite';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async (_url: unknown, _init?: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  );
}
const clientFor = (f: ReturnType<typeof mockFetch>) =>
  createApiClient({ baseUrl: 'https://x.test', getToken: () => 'TOK', fetchImpl: f as unknown as typeof fetch });

describe('teams api request shaping', () => {
  it('lists teams with the bearer token', async () => {
    const f = mockFetch(200, { success: true, teams: [{ id: 't1', member_count: 2 }] });
    const teams = await createTeamsApi(clientFor(f)).listTeams();
    expect(teams).toEqual([{ id: 't1', member_count: 2 }]);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/teams');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOK');
  });

  it('creates a team and unwraps it', async () => {
    const f = mockFetch(201, { success: true, team: { id: 't1', name: 'A', invite_code: 'ABCDEFGHJK' } });
    const team = await createTeamsApi(clientFor(f)).createTeam('A');
    expect(team.id).toBe('t1');
    const [, init] = f.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ name: 'A' }));
  });

  it('joins by invite code and surfaces the server error', async () => {
    const f = mockFetch(404, { error: 'Invalid invite code' });
    await expect(createTeamsApi(clientFor(f)).joinTeam('ABCDEFGHJK')).rejects.toMatchObject({
      message: 'Invalid invite code',
      status: 404,
    });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/teams/join');
    expect(init.body).toBe(JSON.stringify({ inviteCode: 'ABCDEFGHJK' }));
  });

  it('creates a team goal with the web field names', async () => {
    const f = mockFetch(201, { success: true, teamGoal: { id: 'tg1' } });
    await createTeamsApi(clientFor(f)).createTeamGoal({
      teamId: 't1',
      title: 'x',
      description: 'y',
      category: 'work',
      deadline: '2030-01-01T00:00:00.000Z',
      stakePerMember: 0.5,
    });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/team-goals');
    expect(JSON.parse(init.body as string)).toMatchObject({ teamId: 't1', stakePerMember: 0.5, category: 'work' });
  });
});

describe('stakeOnTeamGoal', () => {
  const tx = new Uint8Array([1, 2, 3]);
  it('signs the server transaction with the wallet then confirms the signature', async () => {
    const wallet = { signAndSendTransaction: vi.fn(async () => 'SIG') };
    const api = {
      startTeamGoalStake: vi.fn(async () => ({ goalId: 'g1', transaction: toBase64(tx) })),
      confirmStake: vi.fn(async () => ({ success: true }) as never),
    };
    const out = await stakeOnTeamGoal(wallet, api, 'tg1');
    expect(out).toEqual({ goalId: 'g1' });
    expect(wallet.signAndSendTransaction).toHaveBeenCalledWith(tx);
    expect(api.confirmStake).toHaveBeenCalledWith('g1', 'SIG');
  });

  it('uses a demo signature in demo mode without touching the wallet', async () => {
    const wallet = { signAndSendTransaction: vi.fn(async () => 'SIG') };
    const api = {
      startTeamGoalStake: vi.fn(async () => ({ goalId: 'g1', demoMode: true })),
      confirmStake: vi.fn(async () => ({ success: true }) as never),
    };
    await stakeOnTeamGoal(wallet, api, 'tg1');
    expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    expect(api.confirmStake).toHaveBeenCalledWith('g1', expect.stringMatching(/^demo_tx_\d+$/));
  });

  it('does not confirm when the wallet rejects', async () => {
    const wallet = { signAndSendTransaction: vi.fn(async () => Promise.reject(new Error('rejected'))) };
    const api = {
      startTeamGoalStake: vi.fn(async () => ({ goalId: 'g1', transaction: toBase64(tx) })),
      confirmStake: vi.fn(),
    };
    await expect(stakeOnTeamGoal(wallet, api, 'tg1')).rejects.toThrow('rejected');
    expect(api.confirmStake).not.toHaveBeenCalled();
  });
});

describe('invite codes match the web rules', () => {
  const samples = ['ABCDEFGHJK', 'abcde-fghjk', ' abcde fghjk ', 'ABCDEFGHJ0', 'SHORT', 'ABCDEFGHJKM'];
  it.each(samples)('agrees on %j', (s) => {
    expect(normalizeInviteCode(s)).toBe(webNormalize(s));
    expect(isValidInviteCode(normalizeInviteCode(s))).toBe(webValid(webNormalize(s)));
  });
  it('uses the same length', () => expect(INVITE_CODE_LENGTH).toBe(10));
});

const goal = (over: Partial<TeamGoalView> = {}): TeamGoalView => ({
  id: 'tg',
  team_id: 't',
  title: 't',
  description: 'd',
  category: 'work',
  deadline: new Date(Date.now() + 86_400_000).toISOString(),
  stake_per_member: 0.1,
  rule: 'team_first',
  status: 'open',
  created_by: 'o',
  myGoalId: null,
  progress: { members: [{ wallet: 'me', status: 'not_staked' }], completed: 0, staked: 0, total: 1 },
  ...over,
});

describe('stakeActionFor', () => {
  it('offers stake for an open future goal I have not staked', () => expect(stakeActionFor(goal(), 'me')).toBe('stake'));
  it('offers finish for an unconfirmed stake', () =>
    expect(
      stakeActionFor(goal({ progress: { members: [{ wallet: 'me', status: 'awaiting_stake' }], completed: 0, staked: 0, total: 1 } }), 'me')
    ).toBe('finish'));
  it('offers nothing past the deadline, when settled, or when already active', () => {
    expect(stakeActionFor(goal({ deadline: new Date(Date.now() - 1000).toISOString() }), 'me')).toBeNull();
    expect(stakeActionFor(goal({ status: 'settled' }), 'me')).toBeNull();
    expect(
      stakeActionFor(goal({ progress: { members: [{ wallet: 'me', status: 'active' }], completed: 0, staked: 1, total: 1 } }), 'me')
    ).toBeNull();
  });
});

describe('buildLeaderboard', () => {
  it('counts completed goals per member, highest first, zero for the rest', () => {
    const detail: Pick<TeamDetail, 'members' | 'goals'> = {
      members: [
        { wallet: 'a', role: 'owner', joined_at: '' },
        { wallet: 'b', role: 'member', joined_at: '' },
        { wallet: 'c', role: 'member', joined_at: '' },
      ],
      goals: [
        goal({ progress: { members: [{ wallet: 'a', status: 'failed' }, { wallet: 'b', status: 'completed' }], completed: 1, staked: 2, total: 2 } }),
        goal({ progress: { members: [{ wallet: 'b', status: 'completed' }, { wallet: 'a', status: 'completed' }], completed: 2, staked: 2, total: 2 } }),
      ],
    };
    expect(buildLeaderboard(detail)).toEqual([
      { wallet: 'b', completed: 2 },
      { wallet: 'a', completed: 1 },
      { wallet: 'c', completed: 0 },
    ]);
  });
});

describe('validateTeamGoalForm', () => {
  const base = { teamId: 't', title: 'T', description: 'D', category: 'work' as const, deadline: '2999-01-01', stake: '0.25' };
  it('accepts a valid form and converts the date to an ISO timestamp', () => {
    const r = validateTeamGoalForm(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.stakePerMember).toBe(0.25);
      expect(r.value.deadline).toMatch(/^2999-01-0[12]T/);
    }
  });
  it.each([
    [{ title: ' ' }, 'Add a title'],
    [{ deadline: 'nope' }, 'Deadline must look like YYYY-MM-DD'],
    [{ deadline: '2000-01-01' }, 'Deadline must be in the future'],
    [{ stake: '0' }, 'Stake must be greater than 0'],
    [{ stake: '0.00001' }, 'Stake supports up to 4 decimal places'],
    [{ stake: '5000' }, 'Stake is too large'],
  ])('rejects %j', (over, msg) => {
    const r = validateTeamGoalForm({ ...base, ...over });
    expect(r).toEqual({ ok: false, error: msg });
  });
});
