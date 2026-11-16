import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

const h = vi.hoisted(() => ({
  conn: {
    sendRawTransaction: vi.fn(),
    confirmTransaction: vi.fn(),
  },
  balance: { sol: 10 },
  keypairHolder: { kp: null as unknown as import('@solana/web3.js').Keypair },
}));

vi.mock('@/lib/solana/client', () => ({
  connection: h.conn,
  getEscrowKeypair: () => h.keypairHolder.kp,
  getEscrowPublicKey: () => h.keypairHolder.kp.publicKey,
  solToLamports: (s: number) => Math.floor(s * 1e9),
  lamportsToSol: (l: number) => l / 1e9,
  getBalance: async () => h.balance.sol,
  confirmTransaction: vi.fn(),
  getRecentBlockhash: async () => ({
    blockhash: '11111111111111111111111111111111',
    lastValidBlockHeight: 100,
  }),
}));

const db = vi.hoisted(() => ({
  claimPayout: vi.fn(),
  finalizePayout: vi.fn(),
  releasePayout: vi.fn(),
  markPayoutUnconfirmed: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  claimPayout: db.claimPayout,
  finalizePayout: db.finalizePayout,
  releasePayout: db.releasePayout,
}));
vi.mock('@/lib/supabase/payouts', () => ({
  markPayoutUnconfirmed: db.markPayoutUnconfirmed,
}));

import { sendPayoutFromEscrow } from '@/lib/solana/escrow';
import { returnStake } from '@/lib/solana/stake-return';
import {
  encodeBase58,
  isAmbiguousFailure,
  decideReconcile,
  parseUnconfirmed,
  toUnconfirmedMarker,
  BLOCKHASH_EXPIRY_MS,
  PENDING_GRACE_MS,
} from '@/lib/solana/payout-classify';
import type { Goal } from '@/types';

const recipient = Keypair.generate().publicKey.toBase58();

beforeEach(() => {
  vi.clearAllMocks();
  h.keypairHolder.kp = Keypair.generate();
  h.balance.sol = 10;
  db.claimPayout.mockResolvedValue({ claimed: true, payoutId: 'p1', error: null });
});

describe('base58 + classification helpers', () => {
  it('encodes like web3.js PublicKey.toBase58', () => {
    for (let i = 0; i < 5; i++) {
      const pk = Keypair.generate().publicKey;
      expect(encodeBase58(pk.toBytes())).toBe(pk.toBase58());
    }
    expect(encodeBase58(new PublicKey('11111111111111111111111111111111').toBytes())).toBe(
      '11111111111111111111111111111111'
    );
  });

  it('only failures after submission are ambiguous', () => {
    expect(isAmbiguousFailure('prepare')).toBe(false);
    expect(isAmbiguousFailure('submitted')).toBe(true);
  });

  it('round-trips the unconfirmed marker', () => {
    expect(parseUnconfirmed(toUnconfirmedMarker('abc'))).toBe('abc');
    expect(parseUnconfirmed('pending')).toBeNull();
    expect(parseUnconfirmed('unconfirmed:')).toBeNull();
    expect(parseUnconfirmed('realSig')).toBeNull();
  });
});

describe('sendPayoutFromEscrow classification', () => {
  it('bad recipient address is definitive', async () => {
    const r = await sendPayoutFromEscrow('not-an-address', 1);
    expect(r).toMatchObject({ signature: null, ambiguous: false });
    expect(r.error).toBeTruthy();
    expect(h.conn.sendRawTransaction).not.toHaveBeenCalled();
  });

  it('insufficient escrow balance is definitive', async () => {
    h.balance.sol = 0.5;
    const r = await sendPayoutFromEscrow(recipient, 1);
    expect(r).toMatchObject({ signature: null, ambiguous: false });
    expect(h.conn.sendRawTransaction).not.toHaveBeenCalled();
  });

  it('success returns the signature, not ambiguous', async () => {
    h.conn.sendRawTransaction.mockResolvedValue('x');
    h.conn.confirmTransaction.mockResolvedValue({ value: { err: null } });
    const r = await sendPayoutFromEscrow(recipient, 1);
    expect(r.error).toBeNull();
    expect(r.ambiguous).toBe(false);
    expect(r.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
  });

  it('send throwing is AMBIGUOUS and still exposes the precomputed signature', async () => {
    h.conn.sendRawTransaction.mockRejectedValue(new Error('rpc timeout'));
    const r = await sendPayoutFromEscrow(recipient, 1);
    expect(r.ambiguous).toBe(true);
    expect(r.error).toBeTruthy();
    expect(r.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
  });

  it('confirmation timing out is AMBIGUOUS with the same signature that was sent', async () => {
    h.conn.sendRawTransaction.mockResolvedValue('x');
    h.conn.confirmTransaction.mockRejectedValue(new Error('timeout'));
    const r = await sendPayoutFromEscrow(recipient, 1);
    expect(r.ambiguous).toBe(true);
    expect(r.signature).toBeTruthy();
    expect(h.conn.confirmTransaction.mock.calls[0][0].signature).toBe(r.signature);
  });

  it('a transaction that landed with an error is definitive', async () => {
    h.conn.sendRawTransaction.mockResolvedValue('x');
    h.conn.confirmTransaction.mockResolvedValue({ value: { err: { InstructionError: [0, 'x'] } } });
    const r = await sendPayoutFromEscrow(recipient, 1);
    expect(r).toMatchObject({ signature: null, ambiguous: false });
  });
});

describe('returnStake claim handling', () => {
  const goal = { id: 'g1', wallet_address: recipient, stake_amount: 1 } as unknown as Goal;

  it('definitive failure releases the claim', async () => {
    h.balance.sol = 0;
    const r = await returnStake(goal);
    expect(r.status).toBe('failed');
    expect(db.releasePayout).toHaveBeenCalledWith('p1');
  });

  it('ambiguous failure keeps the claim and records unconfirmed:<sig>', async () => {
    h.conn.sendRawTransaction.mockResolvedValue('x');
    h.conn.confirmTransaction.mockRejectedValue(new Error('timeout'));
    const r = await returnStake(goal);
    expect(r.status).toBe('unconfirmed');
    expect(db.releasePayout).not.toHaveBeenCalled();
    expect(db.finalizePayout).not.toHaveBeenCalled();
    expect(db.markPayoutUnconfirmed).toHaveBeenCalledWith('p1', (r as { signature: string }).signature);
  });

  it('success finalizes', async () => {
    h.conn.sendRawTransaction.mockResolvedValue('x');
    h.conn.confirmTransaction.mockResolvedValue({ value: { err: null } });
    const r = await returnStake(goal);
    expect(r.status).toBe('sent');
    expect(db.finalizePayout).toHaveBeenCalledOnce();
    expect(db.releasePayout).not.toHaveBeenCalled();
  });
});

describe('decideReconcile', () => {
  const sig = toUnconfirmedMarker('SIG');
  const young = 30_000;
  const old = BLOCKHASH_EXPIRY_MS + 1;

  it('confirmed or finalized -> finalize with the real signature', () => {
    for (const confirmationStatus of ['confirmed', 'finalized'] as const) {
      expect(
        decideReconcile({ txSignature: sig, ageMs: young, status: { confirmationStatus, err: null } })
      ).toEqual({ action: 'finalize', signature: 'SIG' });
    }
  });

  it('processed only -> wait', () => {
    expect(
      decideReconcile({ txSignature: sig, ageMs: old, status: { confirmationStatus: 'processed', err: null } })
    ).toEqual({ action: 'wait' });
  });

  it('failed on-chain -> release', () => {
    expect(
      decideReconcile({ txSignature: sig, ageMs: young, status: { confirmationStatus: 'confirmed', err: { x: 1 } } })
    ).toEqual({ action: 'release' });
  });

  it('not found: wait before blockhash expiry, release after', () => {
    expect(decideReconcile({ txSignature: sig, ageMs: young, status: null })).toEqual({ action: 'wait' });
    expect(decideReconcile({ txSignature: sig, ageMs: old, status: null })).toEqual({ action: 'release' });
  });

  it('pending with no signature is never auto-released', () => {
    expect(decideReconcile({ txSignature: 'pending', ageMs: PENDING_GRACE_MS - 1, status: null })).toEqual({
      action: 'wait',
    });
    expect(decideReconcile({ txSignature: 'pending', ageMs: 10 * 60_000, status: null })).toEqual({
      action: 'manual',
    });
  });

  it('an already finalized signature is left alone', () => {
    expect(decideReconcile({ txSignature: 'RealSig', ageMs: old, status: null })).toEqual({ action: 'wait' });
  });
});
