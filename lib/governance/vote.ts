import { getDisputeById } from '@/lib/supabase/disputes';
import { getGovernance, getVote, insertVote, isPanelist } from '@/lib/supabase/governance';
import { checkCanVote, type Vote, type VoteRefusal } from './logic';

export type CastVoteResult =
  | { status: 'recorded'; vote: Vote }
  | { status: 'replay'; vote: Vote }
  | { status: 'refused'; reason: VoteRefusal }
  | { status: 'error' };

/**
 * Record one sealed vote for the session wallet. The caller must have been
 * drawn for the dispute, the window must be open, and one wallet votes once;
 * an identical replay is acknowledged without writing. The DB enforces the
 * same rules (unique + composite FK to the drawn panel), so a race cannot
 * produce two votes.
 */
export async function castVote(input: {
  wallet: string;
  disputeId: string;
  vote: Vote;
  reason?: string;
  now?: Date;
}): Promise<CastVoteResult> {
  const now = input.now ?? new Date();

  const panelist = await isPanelist(input.disputeId, input.wallet);
  if (panelist.error) return { status: 'error' };
  // Not drawn: look no further (reveals nothing about the dispute).
  if (!panelist.is) return { status: 'refused', reason: 'not_panelist' };

  const [gov, dispute, existing] = await Promise.all([
    getGovernance(input.disputeId),
    getDisputeById(input.disputeId),
    getVote(input.disputeId, input.wallet),
  ]);
  if (gov.error || dispute.error || existing.error) return { status: 'error' };

  const check = checkCanVote({
    isPanelist: true,
    state: gov.data?.state ?? null,
    disputeOpen: dispute.data?.status === 'open',
    votingEndsAt: gov.data?.voting_ends_at ?? null,
    existingVote: existing.data?.vote ?? null,
    vote: input.vote,
    now,
  });
  if (!check.ok) return { status: 'refused', reason: check.reason };
  if (check.replay) return { status: 'replay', vote: input.vote };

  const ins = await insertVote({
    dispute_id: input.disputeId,
    voter_wallet: input.wallet,
    vote: input.vote,
    reason: input.reason ? input.reason : null,
  });
  if (ins.duplicate) {
    // Lost a race with ourselves: compare with what was stored.
    const again = await getVote(input.disputeId, input.wallet);
    if (again.data?.vote === input.vote) return { status: 'replay', vote: input.vote };
    return { status: 'refused', reason: 'already_voted' };
  }
  if (!ins.inserted) return { status: 'error' };
  return { status: 'recorded', vote: input.vote };
}
