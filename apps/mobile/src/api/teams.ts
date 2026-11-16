import type { ApiClient } from './client';
import type { WalletProvider } from '../wallet/types';
import { fromBase64 } from '../wallet/encoding';

/** Types mirror app/api/teams/**, app/api/team-goals/** and lib/supabase/teams.ts. */
export type TeamGoalCategory = 'learning' | 'work' | 'health';
export type MemberProgressStatus = 'not_staked' | 'awaiting_stake' | 'active' | 'completed' | 'failed' | 'in_review';

export interface TeamSummary {
  id: string;
  name: string;
  owner_wallet: string;
  invite_code: string;
  created_at: string;
  member_count: number;
}

export interface TeamGoalProgress {
  members: Array<{ wallet: string; status: MemberProgressStatus }>;
  completed: number;
  staked: number;
  total: number;
}

export interface TeamGoalView {
  id: string;
  team_id: string;
  title: string;
  description: string;
  category: TeamGoalCategory;
  deadline: string;
  /** SOL decimal */
  stake_per_member: number;
  rule: 'team_first';
  status: 'open' | 'settled';
  created_by: string;
  progress: TeamGoalProgress;
  myGoalId: string | null;
}

export interface TeamDetail {
  team: { id: string; name: string; owner_wallet: string; invite_code: string; created_at: string };
  isOwner: boolean;
  members: Array<{ wallet: string; role: 'owner' | 'member'; joined_at: string }>;
  goals: TeamGoalView[];
}

export interface CreateTeamGoalInput {
  teamId: string;
  title: string;
  description: string;
  category: TeamGoalCategory;
  /** ISO timestamp in the future */
  deadline: string;
  /** SOL, up to 4 decimals */
  stakePerMember: number;
}

export interface TeamStakeStart {
  goalId: string;
  transaction?: string;
  escrowAddress?: string;
  demoMode?: boolean;
}

export function createTeamsApi(client: Pick<ApiClient, 'request' | 'confirmGoal'>) {
  const { request } = client;
  return {
    listTeams: async () => (await request<{ teams: TeamSummary[] }>('GET', '/api/teams')).teams ?? [],
    createTeam: async (name: string) =>
      (await request<{ team: { id: string; name: string; invite_code: string } }>('POST', '/api/teams', { json: { name } }))
        .team,
    joinTeam: (inviteCode: string) =>
      request<{ teamId: string; name: string }>('POST', '/api/teams/join', { json: { inviteCode } }),
    getTeam: (id: string) => request<TeamDetail>('GET', `/api/teams/${encodeURIComponent(id)}`),
    createTeamGoal: async (input: CreateTeamGoalInput) =>
      (await request<{ teamGoal: { id: string } }>('POST', '/api/team-goals', { json: input })).teamGoal,
    startTeamGoalStake: (teamGoalId: string) =>
      request<TeamStakeStart>('POST', `/api/team-goals/${encodeURIComponent(teamGoalId)}/join`, { json: {} }),
    /** The same confirm endpoint the web uses (POST /api/goals/confirm). */
    confirmStake: (goalId: string, signature: string) => client.confirmGoal(goalId, signature),
  };
}

export type TeamsApi = ReturnType<typeof createTeamsApi>;

/**
 * Member stake flow: server inserts the member goal and builds the unsigned escrow transfer,
 * Phantom signs (the app broadcasts), then /api/goals/confirm verifies on chain.
 * Calling again after an abandoned attempt re-issues the transaction for the same goal.
 */
export async function stakeOnTeamGoal(
  wallet: Pick<WalletProvider, 'signAndSendTransaction'>,
  api: Pick<TeamsApi, 'startTeamGoalStake' | 'confirmStake'>,
  teamGoalId: string
): Promise<{ goalId: string }> {
  const started = await api.startTeamGoalStake(teamGoalId);
  if (started.demoMode || !started.transaction) {
    await api.confirmStake(started.goalId, `demo_tx_${Date.now()}`);
    return { goalId: started.goalId };
  }
  const signature = await wallet.signAndSendTransaction(fromBase64(started.transaction));
  await api.confirmStake(started.goalId, signature);
  return { goalId: started.goalId };
}

// ---- pure helpers -------------------------------------------------------

/** Same alphabet/length as lib/teams/invite.ts (no 0/O/1/I/L). */
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 10;

export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidInviteCode(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return false;
  return true;
}

export const shortWallet = (w: string): string => (w.length > 9 ? `${w.slice(0, 4)}...${w.slice(-4)}` : w);

/** Goals completed per member, highest first (ties keep join order). */
export function buildLeaderboard(
  detail: Pick<TeamDetail, 'members' | 'goals'>
): Array<{ wallet: string; completed: number }> {
  const counts = new Map<string, number>();
  for (const m of detail.members) counts.set(m.wallet, 0);
  for (const g of detail.goals)
    for (const m of g.progress.members)
      if (m.status === 'completed') counts.set(m.wallet, (counts.get(m.wallet) ?? 0) + 1);
  return [...counts.entries()].map(([wallet, completed]) => ({ wallet, completed })).sort((a, b) => b.completed - a.completed);
}

export type StakeAction = 'stake' | 'finish' | null;

/** Mirrors the web detail page: stake while open and before the deadline, or finish an unconfirmed stake. */
export function stakeActionFor(goal: TeamGoalView, wallet: string, now = Date.now()): StakeAction {
  const mine = goal.progress.members.find((m) => m.wallet === wallet)?.status;
  if (mine === 'awaiting_stake') return 'finish';
  if (mine === 'not_staked' && goal.status === 'open' && new Date(goal.deadline).getTime() > now) return 'stake';
  return null;
}

export type FormResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateTeamGoalForm(
  f: { teamId: string; title: string; description: string; category: TeamGoalCategory; deadline: string; stake: string },
  now = Date.now()
): FormResult<CreateTeamGoalInput> {
  const title = f.title.trim();
  const description = f.description.trim();
  if (!title) return { ok: false, error: 'Add a title' };
  if (!description) return { ok: false, error: 'Add a description' };
  // A bare date means end of that day (local time), like the personal goal form.
  const raw = f.deadline.trim();
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59` : raw);
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'Deadline must look like YYYY-MM-DD' };
  if (d.getTime() <= now) return { ok: false, error: 'Deadline must be in the future' };
  const stake = Number(f.stake);
  if (!Number.isFinite(stake) || stake <= 0) return { ok: false, error: 'Stake must be greater than 0' };
  if (stake > 1000) return { ok: false, error: 'Stake is too large' };
  if (Math.round(stake * 1e4) / 1e4 !== stake) return { ok: false, error: 'Stake supports up to 4 decimal places' };
  return {
    ok: true,
    value: { teamId: f.teamId, title, description, category: f.category, deadline: d.toISOString(), stakePerMember: stake },
  };
}
