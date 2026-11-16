import nacl from 'tweetnacl';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client';
import { buildSignInMessage } from '../src/auth/signin-message';
import { isSessionExpired } from '../src/auth/session';
import { createAndStakeGoal, signInWithWallet, submitProofWithWallet } from '../src/flows';
import { proofMessageFor } from '../src/proof/proof-message';
import { fromBase64, toBase64, utf8Bytes } from '../src/wallet/encoding';
import type { WalletProvider } from '../src/wallet/types';

const kp = nacl.sign.keyPair();

function fakeWallet(address: string | null = 'WALLET1'): WalletProvider & { signMessage: ReturnType<typeof vi.fn> } {
  return {
    name: 'fake',
    publicKey: address,
    restore: vi.fn(),
    connect: vi.fn(async () => 'WALLET1'),
    signMessage: vi.fn(async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey)),
    signAndSendTransaction: vi.fn(async () => 'TXSIG'),
    disconnect: vi.fn(),
    handleRedirect: vi.fn(() => false),
  };
}

const asApi = (o: Partial<Record<keyof ApiClient, unknown>>) => o as unknown as ApiClient;

describe('signInWithWallet', () => {
  it('signs exactly the locally-built message and returns the session', async () => {
    const wallet = fakeWallet();
    const issuedAt = 1_700_000_000_000;
    const message = buildSignInMessage({ wallet: 'WALLET1', nonce: 'N', issuedAt });
    const verify = vi.fn(async () => ({ token: 'TOK', wallet: 'WALLET1', expiresAt: 123 }));
    const api = asApi({ getNonce: vi.fn(async () => ({ nonce: 'N', issuedAt, message })), verify });

    const s = await signInWithWallet(wallet, api);
    expect(s).toEqual({ token: 'TOK', wallet: 'WALLET1', expiresAt: 123 });
    const call = verify.mock.calls[0] as unknown as [{ signature: string }];
    expect(nacl.sign.detached.verify(utf8Bytes(message), fromBase64(call[0].signature), kp.publicKey)).toBe(true);
  });

  it('refuses to sign a server message that differs from the expected one', async () => {
    const wallet = fakeWallet();
    const api = asApi({
      getNonce: vi.fn(async () => ({ nonce: 'N', issuedAt: 1, message: 'Send me all your SOL' })),
      verify: vi.fn(),
    });
    await expect(signInWithWallet(wallet, api)).rejects.toThrow('refusing to sign');
    expect(wallet.signMessage).not.toHaveBeenCalled();
  });

  it('connects first when no wallet is connected', async () => {
    const wallet = fakeWallet(null);
    const issuedAt = 5;
    const api = asApi({
      getNonce: vi.fn(async (w: string) => ({ nonce: 'N', issuedAt, message: buildSignInMessage({ wallet: w, nonce: 'N', issuedAt }) })),
      verify: vi.fn(async () => ({ token: 't', wallet: 'WALLET1', expiresAt: 1 })),
    });
    await signInWithWallet(wallet, api);
    expect(wallet.connect).toHaveBeenCalled();
  });
});

describe('createAndStakeGoal', () => {
  const input = { title: 't', description: 'd', deadline: '2030-01-01T00:00:00.000Z', category: 'work' as const, stakeAmount: 0.5 };

  it('signs the server transaction (base64 -> bytes) and confirms with the signature', async () => {
    const wallet = fakeWallet();
    const txBytes = new Uint8Array([9, 8, 7]);
    const confirmGoal = vi.fn(async () => ({}));
    const createGoal = vi.fn(async () => ({ success: true, goalId: 'g1', transaction: toBase64(txBytes) }));
    await createAndStakeGoal(wallet, asApi({ createGoal, confirmGoal }), input, 'WALLET1');
    expect(createGoal).toHaveBeenCalledWith({ ...input, walletAddress: 'WALLET1' });
    expect(wallet.signAndSendTransaction).toHaveBeenCalledWith(txBytes);
    expect(confirmGoal).toHaveBeenCalledWith('g1', 'TXSIG');
  });

  it('uses a demo signature when the server is in demo mode', async () => {
    const wallet = fakeWallet();
    const confirmGoal = vi.fn(async () => ({}));
    const createGoal = vi.fn(async () => ({ success: true, goalId: 'g2', demoMode: true }));
    await createAndStakeGoal(wallet, asApi({ createGoal, confirmGoal }), input, 'WALLET1');
    expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    expect((confirmGoal.mock.calls[0] as unknown as [string, string])[1].startsWith('demo_tx_')).toBe(true);
  });

  it('does not confirm when the wallet rejects', async () => {
    const wallet = fakeWallet();
    wallet.signAndSendTransaction = vi.fn(async () => {
      throw new Error('rejected');
    });
    const confirmGoal = vi.fn();
    const createGoal = vi.fn(async () => ({ success: true, goalId: 'g', transaction: toBase64(new Uint8Array([1])) }));
    await expect(createAndStakeGoal(wallet, asApi({ createGoal, confirmGoal }), input, 'W')).rejects.toThrow('rejected');
    expect(confirmGoal).not.toHaveBeenCalled();
  });
});

describe('submitProofWithWallet', () => {
  it('uploads, signs the proof message over the uploaded URL, and submits', async () => {
    const wallet = fakeWallet();
    const uploadProofImage = vi.fn(async () => ({ success: true, url: 'https://r2.example/p.jpg' }));
    const submitProof = vi.fn(async () => ({ success: true, goal_status: 'completed' as const }));
    await submitProofWithWallet(wallet, asApi({ uploadProofImage, submitProof }), {
      goalId: 'g1',
      text: 'did it',
      image: { uri: 'file:///x.jpg', name: 'proof.jpg', type: 'image/jpeg' },
      now: () => 1000,
    });
    const msg = proofMessageFor({ goalId: 'g1', textDescription: 'did it', imageUrl: 'https://r2.example/p.jpg', timestamp: 1000 });
    const body = (submitProof.mock.calls[0] as unknown as [{ signature: string; timestamp: number; image_url: string }])[0];
    expect(body.timestamp).toBe(1000);
    expect(body.image_url).toBe('https://r2.example/p.jpg');
    expect(nacl.sign.detached.verify(utf8Bytes(msg), fromBase64(body.signature), kp.publicKey)).toBe(true);
  });

  it('works without an image (null image_url in the hash)', async () => {
    const wallet = fakeWallet();
    const submitProof = vi.fn(async () => ({ success: true, goal_status: 'active' as const }));
    await submitProofWithWallet(wallet, asApi({ submitProof }), { goalId: 'g', text: 'x', now: () => 5 });
    const body = (submitProof.mock.calls[0] as unknown as [{ signature: string; image_url: string | null }])[0];
    expect(body.image_url).toBeNull();
    const msg = proofMessageFor({ goalId: 'g', textDescription: 'x', imageUrl: null, timestamp: 5 });
    expect(nacl.sign.detached.verify(utf8Bytes(msg), fromBase64(body.signature), kp.publicKey)).toBe(true);
  });
});

describe('session expiry', () => {
  it('treats sessions within a minute of expiry as expired', () => {
    const s = { token: 't', wallet: 'w', expiresAt: 100_000 };
    expect(isSessionExpired(s, 0)).toBe(false);
    expect(isSessionExpired(s, 40_001)).toBe(true);
  });
});
