/**
 * Employer-visible aggregate stats with k-anonymity. Pure.
 *
 * PRIVACY RULES (see docs/features/orgs.md):
 * - Only members with consent_aggregate = true are ever counted.
 * - Nothing is shown unless at least MIN_GROUP_SIZE consenting members exist.
 * - Rates and totals additionally need MIN_GROUP_SIZE consenting PARTICIPANTS,
 *   otherwise a single person's behaviour could be read from the aggregate.
 * - Output contains no wallets, goal ids, titles, descriptions or proofs.
 */
export const MIN_GROUP_SIZE = 5;

export interface StatsMember {
  wallet: string;
  joinedAtMs: number;
  consent: boolean;
}

export interface StatsGoal {
  wallet: string;
  status: string;
  createdAtMs: number;
  stakeLamports: number;
}

export interface StatsMatch {
  wallet: string;
  amountLamports: number;
}

export type OrgStats =
  | { suppressed: true; minGroupSize: number; reason: 'group_too_small' }
  | {
      suppressed: false;
      minGroupSize: number;
      consentingMembers: number;
      participants: number;
      /** null when fewer than MIN_GROUP_SIZE consenting participants */
      completionRate: number | null;
      totalStakedLamports: number | null;
      totalMatchedLamports: number | null;
    };

export function computeOrgStats(input: {
  members: StatsMember[];
  goals: StatsGoal[];
  matches: StatsMatch[];
  windowStartMs: number;
  windowEndMs: number;
}): OrgStats {
  const consenting = new Map<string, StatsMember>();
  for (const m of input.members) if (m.consent) consenting.set(m.wallet, m);

  if (consenting.size < MIN_GROUP_SIZE) {
    return { suppressed: true, minGroupSize: MIN_GROUP_SIZE, reason: 'group_too_small' };
  }

  const participants = new Set<string>();
  let completed = 0;
  let resolved = 0;
  let staked = 0;
  for (const g of input.goals) {
    const m = consenting.get(g.wallet);
    if (!m) continue;
    if (g.createdAtMs < m.joinedAtMs) continue;
    if (g.createdAtMs < input.windowStartMs || g.createdAtMs > input.windowEndMs) continue;
    participants.add(g.wallet);
    staked += g.stakeLamports;
    if (g.status === 'completed') {
      completed++;
      resolved++;
    } else if (g.status === 'failed') {
      resolved++;
    }
  }

  let matched = 0;
  for (const mt of input.matches) if (consenting.has(mt.wallet)) matched += mt.amountLamports;

  const enough = participants.size >= MIN_GROUP_SIZE;
  return {
    suppressed: false,
    minGroupSize: MIN_GROUP_SIZE,
    consentingMembers: consenting.size,
    participants: participants.size,
    completionRate: enough && resolved > 0 ? completed / resolved : null,
    totalStakedLamports: enough ? staked : null,
    totalMatchedLamports: enough ? matched : null,
  };
}
