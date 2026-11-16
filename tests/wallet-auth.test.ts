import { describe, it, expect } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { sign } from 'crypto';
import { createHash, createPrivateKey } from 'crypto';
import { verifyProofAuth } from '@/lib/auth/wallet';
import { buildProofMessage, proofPayload } from '@/lib/auth/proof-message';

// Ed25519 PKCS8 prefix + 32-byte seed lets Node sign with a Solana keypair
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function signedProof(kp: Keypair, goalId: string, text: string, ts: number) {
  const hash = createHash('sha256').update(proofPayload(text, null)).digest('hex');
  const key = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, Buffer.from(kp.secretKey.slice(0, 32))]),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, Buffer.from(buildProofMessage(goalId, ts, hash)), key).toString('base64');
}

describe('verifyProofAuth', () => {
  const kp = Keypair.generate();
  const goalId = 'goal-1';
  const text = 'I finished the thing';
  const ts = Date.now();
  const base = {
    walletAddress: kp.publicKey.toBase58(),
    goalId,
    textDescription: text,
    imageUrl: null,
    timestamp: ts,
    signature: signedProof(kp, goalId, text, ts),
  };

  it('accepts a valid signature from the goal owner', () => {
    expect(verifyProofAuth(base)).toEqual({ ok: true });
  });
  it('rejects changed content', () => {
    expect(verifyProofAuth({ ...base, textDescription: 'something else' }).ok).toBe(false);
  });
  it('rejects a different wallet', () => {
    expect(verifyProofAuth({ ...base, walletAddress: Keypair.generate().publicKey.toBase58() }).ok).toBe(false);
  });
  it('rejects a stale timestamp', () => {
    const old = ts - 10 * 60_000;
    expect(verifyProofAuth({ ...base, timestamp: old, signature: signedProof(kp, goalId, text, old) }).ok).toBe(false);
  });
  it('rejects missing fields', () => {
    expect(verifyProofAuth({ ...base, signature: undefined }).ok).toBe(false);
  });
});
