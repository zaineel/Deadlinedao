import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { utf8Bytes } from '../wallet/encoding';

/**
 * DUPLICATED from the web app: lib/auth/proof-message.ts (buildProofMessage, proofPayload)
 * and the hashing in lib/auth/wallet.ts (verifyProofAuth: hex SHA-256 of the payload).
 * tests/drift.test.ts checks these against the web implementations.
 */
export function buildProofMessage(goalId: string, timestamp: number, payloadHash: string): string {
  return `DeadlineDAO:submit-proof\ngoal:${goalId}\nts:${timestamp}\nhash:${payloadHash}`;
}

export function proofPayload(textDescription: string, imageUrl: string | null | undefined): string {
  return `${textDescription}\n${imageUrl ?? ''}`;
}

export function hashProofPayload(textDescription: string, imageUrl: string | null | undefined): string {
  return bytesToHex(sha256(utf8Bytes(proofPayload(textDescription, imageUrl))));
}

/** Everything the wallet must sign for a proof submission, ready to send. */
export function proofMessageFor(params: {
  goalId: string;
  textDescription: string;
  imageUrl: string | null | undefined;
  timestamp: number;
}): string {
  return buildProofMessage(
    params.goalId,
    params.timestamp,
    hashProofPayload(params.textDescription, params.imageUrl)
  );
}
