import { createHash, createPublicKey, verify } from 'crypto';
import { PublicKey } from '@solana/web3.js';
import {
  buildProofMessage,
  proofPayload,
  PROOF_AUTH_MAX_AGE_MS,
} from './proof-message';

// DER prefix for an Ed25519 SubjectPublicKeyInfo; append the 32-byte key
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Verify an ed25519 signature (base64) of `message` by `walletAddress`. */
export function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signatureB64: string
): boolean {
  try {
    const keyBytes = new PublicKey(walletAddress).toBytes();
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(keyBytes)]),
      format: 'der',
      type: 'spki',
    });
    const signature = Buffer.from(signatureB64, 'base64');
    if (signature.length !== 64) return false;
    return verify(null, Buffer.from(message, 'utf8'), key, signature);
  } catch {
    return false;
  }
}

/**
 * Check that a proof submission was signed by the goal owner's wallet,
 * is fresh, and matches the submitted content.
 */
export function verifyProofAuth(params: {
  walletAddress: string;
  goalId: string;
  textDescription: string;
  imageUrl: string | null | undefined;
  timestamp: unknown;
  signature: unknown;
}): { ok: true } | { ok: false; error: string } {
  const { walletAddress, goalId, textDescription, imageUrl, timestamp, signature } = params;

  if (typeof timestamp !== 'number' || typeof signature !== 'string') {
    return { ok: false, error: 'Missing wallet signature' };
  }
  if (Math.abs(Date.now() - timestamp) > PROOF_AUTH_MAX_AGE_MS) {
    return { ok: false, error: 'Signature expired. Please sign again.' };
  }

  const hash = createHash('sha256')
    .update(proofPayload(textDescription, imageUrl))
    .digest('hex');
  const message = buildProofMessage(goalId, timestamp, hash);

  if (!verifyWalletSignature(walletAddress, message, signature)) {
    return { ok: false, error: 'Invalid wallet signature' };
  }
  return { ok: true };
}
