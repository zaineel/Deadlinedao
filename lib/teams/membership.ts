/** Membership rules (pure). */

export const MAX_TEAM_SIZE = 20;

export interface MemberLike {
  wallet_address: string;
  role: 'owner' | 'member';
}

export function isMember(members: MemberLike[], wallet: string): boolean {
  return members.some((m) => m.wallet_address === wallet);
}

export function isOwner(team: { owner_wallet: string }, wallet: string): boolean {
  return team.owner_wallet === wallet;
}

export type JoinDecision = { ok: true } | { ok: false; reason: 'already_member' | 'team_full' };

export function canJoinTeam(members: MemberLike[], wallet: string): JoinDecision {
  if (isMember(members, wallet)) return { ok: false, reason: 'already_member' };
  if (members.length >= MAX_TEAM_SIZE) return { ok: false, reason: 'team_full' };
  return { ok: true };
}

export type StakeDecision =
  | { ok: true }
  | { ok: false; reason: 'not_member' | 'team_goal_closed' | 'deadline_passed' | 'already_staked' };

/** A member may stake once per open team goal, before its deadline. */
export function canStakeOnTeamGoal(params: {
  members: MemberLike[];
  wallet: string;
  teamGoal: { status: string; deadline: string };
  alreadyStaked: boolean;
  now?: number;
}): StakeDecision {
  const { members, wallet, teamGoal, alreadyStaked, now = Date.now() } = params;
  if (!isMember(members, wallet)) return { ok: false, reason: 'not_member' };
  if (teamGoal.status !== 'open') return { ok: false, reason: 'team_goal_closed' };
  if (new Date(teamGoal.deadline).getTime() <= now) return { ok: false, reason: 'deadline_passed' };
  if (alreadyStaked) return { ok: false, reason: 'already_staked' };
  return { ok: true };
}
