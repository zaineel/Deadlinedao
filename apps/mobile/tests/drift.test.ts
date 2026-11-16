/**
 * Drift guard: the mobile copies of the signed-message builders must match the
 * web app's builders byte for byte, otherwise signature verification fails
 * on the server. This is the ONLY file that imports from the web app (../../lib),
 * and it is excluded from the mobile tsconfig (the web code uses the '@/' alias).
 */
import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

// session.ts pulls in next/server and wallet verification (@solana/web3.js); the
// message builders under test do not need either, so stub them to keep this test
// free of web dependencies.
vi.mock('next/server', () => ({ NextResponse: {}, NextRequest: class {} }));
vi.mock('@/lib/auth/wallet', () => ({ verifyWalletSignature: () => false }));

import { buildSignInMessage as webSignIn } from '../../../lib/auth/session';
import {
  buildProofMessage as webProofMessage,
  proofPayload as webProofPayload,
} from '../../../lib/auth/proof-message';
import { buildSignInMessage as mobileSignIn } from '../src/auth/signin-message';
import { buildProofMessage, hashProofPayload, proofPayload } from '../src/proof/proof-message';

describe('mobile message builders match the web builders', () => {
  const wallet = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

  it('sign-in message', () => {
    for (const issuedAt of [1_700_000_000_000, Date.now(), 1]) {
      const p = { wallet, nonce: 'eyJyIjoiYWJjIn0.c2ln', issuedAt };
      expect(mobileSignIn(p)).toBe(webSignIn(p));
    }
  });

  it('proof message and payload', () => {
    expect(buildProofMessage('goal-1', 1234, 'abc')).toBe(webProofMessage('goal-1', 1234, 'abc'));
    expect(proofPayload('text', 'https://x/y.jpg')).toBe(webProofPayload('text', 'https://x/y.jpg'));
    expect(proofPayload('text', null)).toBe(webProofPayload('text', null));
    expect(proofPayload('text', undefined)).toBe(webProofPayload('text', undefined));
  });

  it('payload hash equals the hex sha256 the web server computes', () => {
    for (const [t, u] of [['hello é 🎉', 'https://x/y.jpg'], ['plain', null]] as const) {
      const webHash = createHash('sha256').update(webProofPayload(t, u)).digest('hex');
      expect(hashProofPayload(t, u)).toBe(webHash);
    }
  });
});
