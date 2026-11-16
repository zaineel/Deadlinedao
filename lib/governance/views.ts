import { createHmac } from 'crypto';
import type { GovernanceState, Tally, Vote } from './logic';
import { countVotes } from './logic';

/**
 * Response builders. Sealed votes: while a dispute is unresolved a panelist
 * sees ONLY their own vote; the owner never sees votes at all (the owner's
 * routes do not use these builders). Nothing here ever includes the owner's
 * wallet; the owner is shown as a short pseudonym.
 */

/** Stable label for a wallet within one dispute (keyed so it cannot be brute-forced from a wallet list). */
export function pseudonym(disputeId: string, wallet: string, secret: string): string {
  const h = createHmac('sha256', secret || 'deadlinedao-governance').update(`${disputeId}:${wallet}`).digest('hex');
  return `Anon-${h.slice(0, 6)}`;
}

export interface AssignmentSource {
  dispute: { id: string; reason: string; extra_image_url: string | null; created_at: string };
  governance: {
    state: GovernanceState;
    voting_ends_at: string | null;
    decision: Vote | null;
  };
  goal: { title: string; description: string; wallet_address: string };
  proof: {
    text_description: string;
    image_url: string | null;
    ai_verdict: string | null;
    ai_confidence: number | null;
    ai_reasoning: string | null;
  } | null;
  ownVote: { vote: Vote; reason: string | null } | null;
  /** all votes of the dispute (only used once resolved) */
  allVotes: ReadonlyArray<{ voter_wallet: string; vote: Vote; reason: string | null }>;
}

export interface AssignmentView {
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
  /** Only present once the dispute is resolved. */
  result: { decision: Vote | null; tally: Tally; votes: Array<{ voter: string; vote: Vote }> } | null;
}

export function buildAssignmentView(src: AssignmentSource, secret: string): AssignmentView {
  const resolved = src.governance.state === 'resolved';
  return {
    disputeId: src.dispute.id,
    state: src.governance.state,
    votingEndsAt: src.governance.voting_ends_at,
    owner: pseudonym(src.dispute.id, src.goal.wallet_address, secret),
    goal: { title: src.goal.title, description: src.goal.description },
    appeal: { reason: src.dispute.reason, extraImageUrl: src.dispute.extra_image_url },
    proof: src.proof
      ? {
          text: src.proof.text_description,
          imageUrl: src.proof.image_url,
          aiVerdict: src.proof.ai_verdict,
          aiConfidence: src.proof.ai_confidence === null ? null : Number(src.proof.ai_confidence),
          aiReasoning: src.proof.ai_reasoning,
        }
      : null,
    myVote: src.ownVote?.vote ?? null,
    result: resolved
      ? {
          decision: src.governance.decision,
          tally: countVotes(src.allVotes),
          votes: src.allVotes.map((v) => ({ voter: pseudonym(src.dispute.id, v.voter_wallet, secret), vote: v.vote })),
        }
      : null,
  };
}

/** Admin queue view: tallies are revealed only once voting is over (escalated or resolved). */
export function buildAdminGovernanceView(
  g: {
    dispute_id: string;
    state: GovernanceState;
    mode: string;
    fallback_reason: string | null;
    escalated_reason: string | null;
    voting_ends_at: string | null;
  },
  votes: ReadonlyArray<{ vote: Vote }>,
  panelSize: number
) {
  const reveal = g.state === 'escalated' || g.state === 'resolved';
  return {
    disputeId: g.dispute_id,
    state: g.state,
    mode: g.mode,
    fallbackReason: g.fallback_reason,
    escalatedReason: g.escalated_reason,
    votingEndsAt: g.voting_ends_at,
    panelSize,
    tally: reveal ? countVotes(votes) : null,
  };
}
