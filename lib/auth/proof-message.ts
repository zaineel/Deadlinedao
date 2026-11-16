/**
 * Message a wallet signs to authorize a proof submission.
 * Shared by the client (to sign) and the server (to verify).
 * `payloadHash` is the hex SHA-256 of `${text_description}\n${image_url ?? ''}`
 * so a signature can't be reused with different proof content.
 */
export const PROOF_AUTH_MAX_AGE_MS = 5 * 60 * 1000;

export function buildProofMessage(goalId: string, timestamp: number, payloadHash: string): string {
  return `DeadlineDAO:submit-proof\ngoal:${goalId}\nts:${timestamp}\nhash:${payloadHash}`;
}

export function proofPayload(textDescription: string, imageUrl: string | null | undefined): string {
  return `${textDescription}\n${imageUrl ?? ''}`;
}
