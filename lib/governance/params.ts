/**
 * Governance parameters. Read from env with safe defaults and clamped to sane
 * ranges so a typo can never produce a 1-person panel or a 10-year window.
 * No on-chain or voted parameter changes in v1.
 */
export interface GovernanceParams {
  /** Completed goals a wallet needs to be eligible as a voter. */
  minCompletedGoals: number;
  /** Voters drawn per dispute. */
  panelSize: number;
  /** Votes needed for a panel decision to count (<= panelSize). */
  quorum: number;
  votingWindowHours: number;
  /** Share of the bond (basis points) split among majority voters when upheld. */
  rewardShareBps: number;
}

export const PARAM_LIMITS = {
  minCompletedGoals: { def: 3, min: 1, max: 100 },
  panelSize: { def: 5, min: 3, max: 25 },
  quorum: { def: 3, min: 2, max: 25 },
  votingWindowHours: { def: 48, min: 1, max: 168 },
  rewardShareBps: { def: 5000, min: 0, max: 10_000 },
} as const;

export function clampInt(raw: string | undefined, def: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function getGovernanceParams(env: Record<string, string | undefined> = process.env): GovernanceParams {
  const L = PARAM_LIMITS;
  const panelSize = clampInt(env.GOVERNANCE_PANEL_SIZE, L.panelSize.def, L.panelSize.min, L.panelSize.max);
  const quorum = Math.min(
    panelSize,
    clampInt(env.GOVERNANCE_QUORUM, L.quorum.def, L.quorum.min, L.quorum.max)
  );
  return {
    minCompletedGoals: clampInt(
      env.GOVERNANCE_MIN_COMPLETED_GOALS,
      L.minCompletedGoals.def,
      L.minCompletedGoals.min,
      L.minCompletedGoals.max
    ),
    panelSize,
    quorum,
    votingWindowHours: clampInt(
      env.GOVERNANCE_VOTING_WINDOW_HOURS,
      L.votingWindowHours.def,
      L.votingWindowHours.min,
      L.votingWindowHours.max
    ),
    rewardShareBps: clampInt(
      env.GOVERNANCE_REWARD_SHARE_BPS,
      L.rewardShareBps.def,
      L.rewardShareBps.min,
      L.rewardShareBps.max
    ),
  };
}
