/**
 * Pure helpers for payout safety. No I/O, so they are unit-testable.
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Minimal base58 encoder (so we can know a tx signature before sending it). */
export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

/** Where in the send pipeline a failure happened. */
export type SendStage = 'prepare' | 'submitted';

/**
 * 'prepare'   = failed before anything could have reached the network
 *               (bad address, low balance, blockhash fetch, signing): DEFINITIVE.
 * 'submitted' = the signed transaction may have been broadcast (send or
 *               confirmation threw/timed out): AMBIGUOUS, funds may have moved.
 */
export function isAmbiguousFailure(stage: SendStage): boolean {
  return stage === 'submitted';
}

export const UNCONFIRMED_PREFIX = 'unconfirmed:';

export function toUnconfirmedMarker(signature: string): string {
  return `${UNCONFIRMED_PREFIX}${signature}`;
}

/** Real signature from an 'unconfirmed:<sig>' marker, else null. */
export function parseUnconfirmed(txSignature: string): string | null {
  return txSignature.startsWith(UNCONFIRMED_PREFIX) && txSignature.length > UNCONFIRMED_PREFIX.length
    ? txSignature.slice(UNCONFIRMED_PREFIX.length)
    : null;
}

/**
 * Blockhashes are valid ~150 slots (~1-2 min). After this long a transaction
 * that is still unknown to the cluster can never land.
 */
export const BLOCKHASH_EXPIRY_MS = 5 * 60_000;
/** Do not touch 'pending' rows younger than this: the original request may still be running. */
export const PENDING_GRACE_MS = 2 * 60_000;

export type SignatureStatus = {
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized' | null;
  err: unknown;
} | null;

export type ReconcileDecision =
  | { action: 'finalize'; signature: string }
  | { action: 'release' }
  | { action: 'wait' }
  | { action: 'manual' };

/**
 * Decide what to do with an unresolved payout row.
 * - landed (confirmed/finalized, no error) -> finalize with the real signature
 * - landed with an error, or unknown after blockhash expiry -> release (nothing moved)
 * - still processing / not yet expired -> wait
 * - 'pending' with no signature recorded -> cannot be checked on-chain: manual
 */
export function decideReconcile(params: {
  txSignature: string;
  ageMs: number;
  status: SignatureStatus;
}): ReconcileDecision {
  const { txSignature, ageMs, status } = params;
  const signature = parseUnconfirmed(txSignature);

  if (!signature) {
    if (txSignature !== 'pending') return { action: 'wait' }; // already finalized, nothing to do
    return ageMs < PENDING_GRACE_MS ? { action: 'wait' } : { action: 'manual' };
  }

  if (status) {
    if (status.err) return { action: 'release' };
    if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
      return { action: 'finalize', signature };
    }
    return { action: 'wait' }; // processed only
  }
  return ageMs > BLOCKHASH_EXPIRY_MS ? { action: 'release' } : { action: 'wait' };
}
