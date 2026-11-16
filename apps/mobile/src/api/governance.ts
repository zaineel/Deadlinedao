import { ApiError, type createApiClient } from './client';

export type Vote = 'overturn' | 'uphold';
export type GovernanceState = 'voting' | 'escalated' | 'admin' | 'resolved';

/** Mirrors lib/governance/views.ts AssignmentView. The owner is a pseudonym only; others' votes appear only once resolved. */
export interface Assignment {
  disputeId: string;
  state: GovernanceState;
  votingEndsAt: string | null;
  owner: string;
  goal: { title: string; description: string };
  appeal: { reason: string; extraImageUrl: string | null };
  proof: {
    text: string;
    imageUrl: string | null;
    aiVerdict: string | null;
    aiConfidence: number | null;
    aiReasoning: string | null;
  } | null;
  myVote: Vote | null;
  result: { decision: Vote | null; tally: { overturn: number; uphold: number; cast: number } } | null;
}

export interface VoterStats {
  votesCast: number;
  votesAgreed: number;
  votesMissed: number;
  agreementRate: number | null;
}

export interface GovernanceReward {
  disputeId: string;
  amountLamports: number;
  status: string;
}

export interface GovernanceParams {
  votingWindowHours: number;
  minCompletedGoals: number;
  panelSize: number;
  quorum: number;
}

export interface GovernanceOverview {
  assignments: Assignment[];
  stats: VoterStats;
  rewards: GovernanceReward[];
  params: GovernanceParams | null;
}

export const MAX_REASON_LENGTH = 500;

type Client = Pick<ReturnType<typeof createApiClient>, 'request'>;

export function createGovernanceApi(client: Client) {
  return {
    /** GET /api/governance. 404 when FEATURE_GOVERNANCE/FEATURE_DISPUTES are off. */
    getOverview: async (): Promise<GovernanceOverview> => {
      const res = await client.request<Partial<GovernanceOverview>>('GET', '/api/governance');
      return {
        assignments: res.assignments ?? [],
        stats: res.stats ?? { votesCast: 0, votesAgreed: 0, votesMissed: 0, agreementRate: null },
        rewards: res.rewards ?? [],
        params: res.params ?? null,
      };
    },
    /**
     * POST /api/governance/votes {disputeId, vote, reason?}. Bearer session only: the route requires no wallet
     * signature. 201 = recorded, 200 = identical replay (idempotent); both resolve here.
     */
    castVote: (disputeId: string, vote: Vote, reason?: string) => {
      const trimmed = reason?.trim();
      return client.request<{ success: boolean; replay: boolean; vote: unknown }>('POST', '/api/governance/votes', {
        json: { disputeId, vote, ...(trimmed ? { reason: trimmed } : {}) },
      });
    },
  };
}

export type GovernanceApi = ReturnType<typeof createGovernanceApi>;

/* ---------- pure logic ---------- */

export interface Countdown {
  expired: boolean;
  remainingMs: number;
  label: string;
}

export function countdown(endsAt: string | null, now: number): Countdown {
  if (!endsAt) return { expired: false, remainingMs: 0, label: 'No deadline' };
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return { expired: false, remainingMs: 0, label: 'No deadline' };
  const remainingMs = end - now;
  if (remainingMs <= 0) return { expired: true, remainingMs: 0, label: 'Voting closed' };
  const mins = Math.floor(remainingMs / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const label = d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${Math.max(m, 1)}m left`;
  return { expired: false, remainingMs, label };
}

export type VoteUiState =
  | { kind: 'can_vote' }
  | { kind: 'already_voted'; vote: Vote }
  | { kind: 'window_closed' }
  | { kind: 'resolved'; decision: Vote | null };

export function deriveVoteState(a: Assignment, now: number): VoteUiState {
  if (a.state === 'resolved') return { kind: 'resolved', decision: a.result?.decision ?? null };
  if (a.myVote) return { kind: 'already_voted', vote: a.myVote };
  if (a.state !== 'voting') return { kind: 'window_closed' };
  if (countdown(a.votingEndsAt, now).expired) return { kind: 'window_closed' };
  return { kind: 'can_vote' };
}

export function validateReason(reason: string): string | null {
  return reason.trim().length > MAX_REASON_LENGTH ? `Reason must be ${MAX_REASON_LENGTH} characters or fewer` : null;
}

/** Maps a vote failure to a clear message; the server uses 404 for "not on this panel". */
export function voteErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : 'Could not record vote';
  if (e.status === 404) return 'You are not on the panel for this dispute.';
  if (e.status === 409 && /already voted/i.test(e.message)) return 'You already voted differently on this dispute. Votes cannot be changed.';
  if (e.status === 409) return 'The voting window has closed for this dispute.';
  if (e.status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (e.status === 401) return 'Your session expired. Sign in again.';
  return e.message;
}

export function eligibilityText(p: GovernanceParams | null): string {
  if (!p) return 'Panelists are drawn at random from wallets with enough completed goals.';
  return (
    `You can be drawn onto a panel once you have at least ${p.minCompletedGoals} completed goals, no open dispute of your own, ` +
    `and no team or org in common with the appellant. Each panel has ${p.panelSize} members and needs ${p.quorum} votes ` +
    `to decide. You have ${p.votingWindowHours} hours to vote after the draw.`
  );
}

export function lamportsToSol(lamports: number): string {
  return (lamports / 1e9).toFixed(6);
}

export function agreementLabel(rate: number | null): string {
  return rate === null ? '' : ` (${Math.round(rate * 100)}%)`;
}
