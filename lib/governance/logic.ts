import { randomInt } from 'crypto';

/**
 * Pure governance rules: eligibility, panel draw, voting checks, tally and
 * reward math. No I/O so everything is unit testable.
 */

export type Vote = 'overturn' | 'uphold';
/** voting: panel drawn, collecting votes. escalated: needs an admin. admin: no panel (fallback). resolved: done. */
export type GovernanceState = 'voting' | 'escalated' | 'admin' | 'resolved';

const LAMPORTS_PER_SOL = 1_000_000_000;

/* ---------- eligibility ---------- */

export interface EligibilityInput {
  /** wallet -> number of completed goals */
  completedCounts: ReadonlyMap<string, number>;
  /** the dispute owner: never eligible */
  ownerWallet: string;
  /** wallets with their own pending/open dispute (or an appealable rejection) */
  walletsWithPendingDispute: ReadonlySet<string>;
  /** wallets sharing a team or an org with the owner */
  conflictedWallets: ReadonlySet<string>;
  minCompletedGoals: number;
}

/** Sorted (deterministic) list of wallets allowed to sit on this dispute's panel. */
export function selectEligible(input: EligibilityInput): string[] {
  const out: string[] = [];
  for (const [wallet, count] of input.completedCounts) {
    if (wallet === input.ownerWallet) continue;
    if (count < input.minCompletedGoals) continue;
    if (input.walletsWithPendingDispute.has(wallet)) continue;
    if (input.conflictedWallets.has(wallet)) continue;
    out.push(wallet);
  }
  return out.sort();
}

/* ---------- panel draw ---------- */

export type RandomInt = (maxExclusive: number) => number;
const cryptoRandomInt: RandomInt = (max) => randomInt(max);

/**
 * Uniform draw without replacement (partial Fisher-Yates over a copy) using
 * crypto randomness (randomInt is unbiased: it rejects modulo bias).
 */
export function drawPanel(eligible: readonly string[], size: number, rng: RandomInt = cryptoRandomInt): string[] {
  const unique = Array.from(new Set(eligible));
  const n = Math.max(0, Math.min(Math.trunc(size), unique.length));
  for (let i = 0; i < n; i++) {
    const j = i + rng(unique.length - i);
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, n);
}

export type PanelPlan = { mode: 'panel'; panelSize: number } | { mode: 'admin'; fallbackReason: string };

/** Panel when at least `quorum` wallets are eligible, otherwise the admin flow with a recorded reason. */
export function planPanel(eligibleCount: number, params: { panelSize: number; quorum: number }): PanelPlan {
  if (eligibleCount < params.quorum) {
    return { mode: 'admin', fallbackReason: `insufficient_eligible_voters:${eligibleCount}<${params.quorum}` };
  }
  return { mode: 'panel', panelSize: Math.min(params.panelSize, eligibleCount) };
}

/* ---------- voting ---------- */

export function computeVotingEnd(drawnAt: Date | number, windowHours: number): Date {
  const t = drawnAt instanceof Date ? drawnAt.getTime() : drawnAt;
  return new Date(t + windowHours * 3_600_000);
}

export function isVotingOpen(votingEndsAt: string | null | undefined, now: Date | number): boolean {
  if (!votingEndsAt) return false;
  const end = new Date(votingEndsAt).getTime();
  if (Number.isNaN(end)) return false;
  return (now instanceof Date ? now.getTime() : now) < end;
}

export type VoteRefusal = 'not_panelist' | 'not_voting' | 'window_closed' | 'already_voted';
export type VoteCheck = { ok: true; replay: boolean } | { ok: false; reason: VoteRefusal };

export function checkCanVote(input: {
  isPanelist: boolean;
  state: GovernanceState | null;
  disputeOpen: boolean;
  votingEndsAt: string | null;
  existingVote: Vote | null;
  vote: Vote;
  now: Date | number;
}): VoteCheck {
  if (!input.isPanelist || input.state === null) return { ok: false, reason: 'not_panelist' };
  // A replay of the identical vote is idempotent, even after the window closed.
  if (input.existingVote) {
    return input.existingVote === input.vote
      ? { ok: true, replay: true }
      : { ok: false, reason: 'already_voted' };
  }
  if (input.state !== 'voting' || !input.disputeOpen) return { ok: false, reason: 'not_voting' };
  if (!isVotingOpen(input.votingEndsAt, input.now)) return { ok: false, reason: 'window_closed' };
  return { ok: true, replay: false };
}

/* ---------- tally ---------- */

export interface Tally {
  overturn: number;
  uphold: number;
  cast: number;
}

export function countVotes(votes: ReadonlyArray<{ vote: Vote }>): Tally {
  let overturn = 0;
  let uphold = 0;
  for (const v of votes) {
    if (v.vote === 'overturn') overturn++;
    else if (v.vote === 'uphold') uphold++;
  }
  return { overturn, uphold, cast: overturn + uphold };
}

export type TallyOutcome =
  | { kind: 'decision'; decision: Vote; tally: Tally }
  | { kind: 'escalate'; reason: 'no_quorum' | 'tie'; tally: Tally };

/** Majority of CAST votes decides, but only with quorum. Ties and missing quorum go to the admin. */
export function tallyVotes(votes: ReadonlyArray<{ vote: Vote }>, quorum: number): TallyOutcome {
  const tally = countVotes(votes);
  if (tally.cast < quorum) return { kind: 'escalate', reason: 'no_quorum', tally };
  if (tally.overturn === tally.uphold) return { kind: 'escalate', reason: 'tie', tally };
  return { kind: 'decision', decision: tally.overturn > tally.uphold ? 'overturn' : 'uphold', tally };
}

/** A voting dispute is due when the window closed or every panelist has voted. */
export function isResolutionDue(input: {
  votingEndsAt: string | null;
  panelSize: number;
  castVotes: number;
  now: Date | number;
}): boolean {
  if (input.panelSize > 0 && input.castVotes >= input.panelSize) return true;
  if (!input.votingEndsAt) return false;
  return !isVotingOpen(input.votingEndsAt, input.now);
}

/* ---------- incentives ---------- */

export function bondToLamports(bondSol: number): number {
  return Math.round(Number(bondSol) * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Reward pool = floor(bond * shareBps / 10000); each majority voter gets an
 * equal integer share. Never exceeds the bond; the remainder stays in escrow.
 */
export function computeRewardSplit(
  bondLamports: number,
  winners: number,
  shareBps: number
): { poolLamports: number; perVoterLamports: number; totalLamports: number } {
  const bond = Math.max(0, Math.floor(bondLamports));
  const bps = Math.min(10_000, Math.max(0, Math.floor(shareBps)));
  const w = Math.floor(winners);
  if (!Number.isFinite(bond) || !Number.isFinite(w) || w <= 0) {
    return { poolLamports: 0, perVoterLamports: 0, totalLamports: 0 };
  }
  const poolLamports = Math.floor((bond * bps) / 10_000);
  const perVoterLamports = Math.floor(poolLamports / w);
  return { poolLamports, perVoterLamports, totalLamports: perVoterLamports * w };
}

/** Voters who voted for the final outcome. */
export function majorityVoters(votes: ReadonlyArray<{ voter_wallet: string; vote: Vote }>, outcome: Vote): string[] {
  return votes.filter((v) => v.vote === outcome).map((v) => v.voter_wallet);
}

/** Stats deltas applied once at resolution. */
export function statsDeltas(
  panel: readonly string[],
  votes: ReadonlyArray<{ voter_wallet: string; vote: Vote }>,
  outcome: Vote
): Array<{ wallet: string; cast: number; agreed: number; missed: number }> {
  const byWallet = new Map(votes.map((v) => [v.voter_wallet, v.vote]));
  return panel.map((wallet) => {
    const v = byWallet.get(wallet);
    return {
      wallet,
      cast: v ? 1 : 0,
      agreed: v === outcome ? 1 : 0,
      missed: v ? 0 : 1,
    };
  });
}
