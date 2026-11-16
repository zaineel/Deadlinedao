import { deriveVoteState, type Assignment } from '../api/governance';

/** Assignments where the signed-in user can still cast a vote right now. */
export function pendingAssignments(assignments: Assignment[], now: number): Assignment[] {
  return assignments.filter((a) => deriveVoteState(a, now).kind === 'can_vote');
}

export function pendingBannerText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? 'You were selected to review an appeal. Your vote stays sealed until the dispute is resolved.'
    : `You were selected to review ${count} appeals. Your votes stay sealed until each dispute is resolved.`;
}
