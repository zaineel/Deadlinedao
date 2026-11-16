import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Keypair } from '@solana/web3.js';
import { issueSession } from '@/lib/auth/session';

vi.mock('@/lib/supabase/teams', () => ({
  createTeamWithOwner: vi.fn(),
  getTeamById: vi.fn(),
  getTeamByInviteCode: vi.fn(),
  getTeamMembers: vi.fn(),
  addTeamMember: vi.fn(),
  listTeamsForWallet: vi.fn(),
  createTeamGoal: vi.fn(),
  getTeamGoal: vi.fn(),
  listTeamGoals: vi.fn(),
  getMemberGoals: vi.fn(),
  getMemberGoal: vi.fn(),
  insertMemberGoal: vi.fn(),
  markTeamGoalSettled: vi.fn(),
}));
vi.mock('@/lib/teams/stake-tx', () => ({
  buildStakeTransaction: vi.fn(async () => ({ transaction: 'dHg=', escrowAddress: 'ESCROW' })),
}));
vi.mock('@/lib/supabase/payouts', () => ({ claimPayout: vi.fn(), finalizePayout: vi.fn(), releasePayout: vi.fn(), markPayoutUnconfirmed: vi.fn(), getPayoutsByGoal: vi.fn() }));
vi.mock('@/lib/solana/escrow', () => ({ sendPayoutFromEscrow: vi.fn() }));

import * as db from '@/lib/supabase/teams';
import { POST as createTeam } from '@/app/api/teams/route';
import { POST as joinByCode } from '@/app/api/teams/join/route';
import { GET as teamDetail } from '@/app/api/teams/[id]/route';
import { POST as createGoal } from '@/app/api/team-goals/route';
import { POST as stakeOnGoal } from '@/app/api/team-goals/[id]/join/route';
import { POST as settle } from '@/app/api/admin/team-settlement/route';

const OWNER = Keypair.generate().publicKey.toString();
const MEMBER = Keypair.generate().publicKey.toString();
const OUTSIDER = Keypair.generate().publicKey.toString();
const TEAM_ID = '3f2b8c1e-5d4a-4e8b-9c1d-2a3b4c5d6e7f';
const GOAL_ID = '4f2b8c1e-5d4a-4e8b-9c1d-2a3b4c5d6e7f';

const team = { id: TEAM_ID, name: 'T', owner_wallet: OWNER, invite_code: 'ABCDEFGHJ2', created_at: '' };
const members = [
  { id: '1', team_id: TEAM_ID, wallet_address: OWNER, role: 'owner' as const, joined_at: '' },
  { id: '2', team_id: TEAM_ID, wallet_address: MEMBER, role: 'member' as const, joined_at: '' },
];
const future = new Date(Date.now() + 86_400_000).toISOString();
const teamGoal = {
  id: GOAL_ID, team_id: TEAM_ID, title: 't', description: 'd', category: 'work' as const,
  deadline: future, stake_per_member: 0.5, rule: 'team_first' as const, status: 'open' as const,
  created_by: OWNER, created_at: '', settled_at: null,
};

let ip = 0;
function req(url: string, wallet: string | null, body?: unknown, method = 'POST') {
  const headers: Record<string, string> = { 'x-forwarded-for': `10.0.0.${++ip}` };
  if (wallet) headers.authorization = `Bearer ${issueSession(wallet)}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  process.env.SESSION_SECRET = 'x'.repeat(40);
  process.env.FEATURE_TEAMS = 'true';
  process.env.ADMIN_API_KEY = 'adminkey';
  vi.mocked(db.getTeamById).mockResolvedValue(team);
  vi.mocked(db.getTeamMembers).mockResolvedValue(members);
  vi.mocked(db.getTeamGoal).mockResolvedValue(teamGoal);
  vi.mocked(db.getMemberGoal).mockResolvedValue(null);
  vi.mocked(db.insertMemberGoal).mockResolvedValue('goal-1');
});
afterEach(() => {
  vi.clearAllMocks();
  delete process.env.FEATURE_TEAMS;
  delete process.env.DEMO_MODE;
});

describe('feature flag and auth', () => {
  it('404s every route when the flag is off', async () => {
    delete process.env.FEATURE_TEAMS;
    expect((await createTeam(req('/api/teams', OWNER, { name: 'x' }))).status).toBe(404);
    expect((await joinByCode(req('/api/teams/join', OWNER, { inviteCode: 'ABCDEFGHJ2' }))).status).toBe(404);
    expect((await teamDetail(req('/api/teams/x', OWNER, undefined, 'GET'), ctx(TEAM_ID))).status).toBe(404);
    expect((await createGoal(req('/api/team-goals', OWNER, {}))).status).toBe(404);
    expect((await stakeOnGoal(req('/x', OWNER, {}), ctx(GOAL_ID))).status).toBe(404);
    expect((await settle(req('/x', null, {}))).status).toBe(404);
  });
  it('requires a session', async () => {
    expect((await createTeam(req('/api/teams', null, { name: 'x' }))).status).toBe(401);
    expect((await teamDetail(req('/x', null, undefined, 'GET'), ctx(TEAM_ID))).status).toBe(401);
    expect((await stakeOnGoal(req('/x', null, {}), ctx(GOAL_ID))).status).toBe(401);
  });
  it('admin settlement requires the admin key', async () => {
    const r = await settle(req('/x', OWNER, { teamGoalId: GOAL_ID }));
    expect(r.status).toBe(401);
  });
});

describe('team access control', () => {
  it('shows team detail to members only', async () => {
    vi.mocked(db.listTeamGoals).mockResolvedValue([]);
    vi.mocked(db.getMemberGoals).mockResolvedValue([]);
    expect((await teamDetail(req('/x', OUTSIDER, undefined, 'GET'), ctx(TEAM_ID))).status).toBe(404);
    const ok = await teamDetail(req('/x', MEMBER, undefined, 'GET'), ctx(TEAM_ID));
    expect(ok.status).toBe(200);
    expect((await ok.json()).isOwner).toBe(false);
  });
  it('only the owner creates team goals', async () => {
    const body = {
      teamId: TEAM_ID, title: 't', description: 'd', category: 'work', deadline: future, stakePerMember: 0.5,
    };
    vi.mocked(db.createTeamGoal).mockResolvedValue(teamGoal);
    expect((await createGoal(req('/x', MEMBER, body))).status).toBe(404);
    expect(db.createTeamGoal).not.toHaveBeenCalled();
    expect((await createGoal(req('/x', OWNER, body))).status).toBe(201);
  });
  it('validates bodies', async () => {
    expect((await createGoal(req('/x', OWNER, { teamId: 'nope' }))).status).toBe(400);
    expect((await joinByCode(req('/x', MEMBER, { inviteCode: 'bad' }))).status).toBe(400);
  });
});

describe('join by invite code', () => {
  it('joins, and rejects duplicates', async () => {
    vi.mocked(db.getTeamByInviteCode).mockResolvedValue(team);
    vi.mocked(db.addTeamMember).mockResolvedValue(true);
    expect((await joinByCode(req('/x', OUTSIDER, { inviteCode: 'abcde-fghj2' }))).status).toBe(200);
    expect(db.getTeamByInviteCode).toHaveBeenCalledWith('ABCDEFGHJ2');
    expect((await joinByCode(req('/x', MEMBER, { inviteCode: 'ABCDEFGHJ2' }))).status).toBe(409);
  });
  it('404s an unknown code', async () => {
    vi.mocked(db.getTeamByInviteCode).mockResolvedValue(null);
    expect((await joinByCode(req('/x', OUTSIDER, { inviteCode: 'ABCDEFGHJ2' }))).status).toBe(404);
  });
});

describe('member stake endpoint', () => {
  it('returns an unsigned tx and a pending goal for members', async () => {
    const res = await stakeOnGoal(req('/x', MEMBER, {}), ctx(GOAL_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ goalId: 'goal-1', transaction: 'dHg=' });
    expect(db.insertMemberGoal).toHaveBeenCalledWith(teamGoal, MEMBER);
  });
  it('hides the team goal from non-members', async () => {
    expect((await stakeOnGoal(req('/x', OUTSIDER, {}), ctx(GOAL_ID))).status).toBe(404);
    expect(db.insertMemberGoal).not.toHaveBeenCalled();
  });
  it('rejects double staking but re-issues for an unconfirmed goal', async () => {
    const row = { id: 'g', wallet_address: MEMBER, stake_amount: 0.5, status: 'active' };
    vi.mocked(db.getMemberGoal).mockResolvedValue({ ...row, stake_tx_signature: 'sig' });
    expect((await stakeOnGoal(req('/x', MEMBER, {}), ctx(GOAL_ID))).status).toBe(409);
    vi.mocked(db.getMemberGoal).mockResolvedValue({ ...row, stake_tx_signature: 'pending', status: 'pending_validation' });
    const again = await stakeOnGoal(req('/x', MEMBER, {}), ctx(GOAL_ID));
    expect(again.status).toBe(200);
    expect((await again.json()).goalId).toBe('g');
    expect(db.insertMemberGoal).not.toHaveBeenCalled();
  });
  it('rejects after the deadline', async () => {
    vi.mocked(db.getTeamGoal).mockResolvedValue({ ...teamGoal, deadline: new Date(Date.now() - 1000).toISOString() });
    expect((await stakeOnGoal(req('/x', MEMBER, {}), ctx(GOAL_ID))).status).toBe(409);
  });
});

describe('admin settlement route', () => {
  const adminReq = (body: unknown) => {
    const r = req('/x', null, body);
    r.headers.set('x-admin-key', 'adminkey');
    return r;
  };
  it('refuses with 409 while a member goal is non-final', async () => {
    vi.mocked(db.getTeamGoal).mockResolvedValue({ ...teamGoal, deadline: new Date(Date.now() - 1000).toISOString() });
    vi.mocked(db.getMemberGoals).mockResolvedValue([
      { id: 'a', wallet_address: OWNER, stake_amount: 1, stake_tx_signature: 's', status: 'completed', team_goal_id: GOAL_ID },
      { id: 'b', wallet_address: MEMBER, stake_amount: 1, stake_tx_signature: 's', status: 'active', team_goal_id: GOAL_ID },
    ]);
    const res = await settle(adminReq({ teamGoalId: GOAL_ID }));
    expect(res.status).toBe(409);
    expect((await res.json()).blockingGoalIds).toEqual(['b']);
    expect(db.markTeamGoalSettled).not.toHaveBeenCalled();
  });
});
