/** Drift guard for the dispute bond: excluded from the mobile tsconfig (imports web code and @solana/web3.js). */
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { describe, expect, it } from 'vitest';
import { bondLamports, expectedBondLamports } from '../src/disputes/appeal-flow';
import { buildTransferTransaction } from '../src/solana/transfer';
import { toBase58 } from '../src/wallet/encoding';
import { computeBond } from '../../../lib/disputes/logic';

const key = () => toBase58(nacl.sign.keyPair().publicKey);

describe('transfer drift vs @solana/web3.js', () => {
  it('serializes the same unsigned legacy transfer', () => {
    const from = key();
    const to = key();
    const blockhash = key();
    const lamports = 123_456_789;
    const web = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: new PublicKey(from), toPubkey: new PublicKey(to), lamports })
    );
    web.recentBlockhash = blockhash;
    web.feePayer = new PublicKey(from);
    const expected = web.serialize({ requireAllSignatures: false, verifySignatures: false });
    const mine = buildTransferTransaction({ from, to, lamports, recentBlockhash: blockhash });
    expect(Buffer.from(mine).toString('hex')).toBe(Buffer.from(expected).toString('hex'));
  });
});

describe('bond drift vs lib/disputes/logic', () => {
  it('lamports of the server quote equal the exact 5% bond (within the server >= check)', () => {
    for (const stake of [0.1, 0.5, 1, 2.5, 0.123456789, 0.3, 0.07, 1.000000001, 3.333333333]) {
      const bond = computeBond(stake);
      expect(bondLamports(bond)).toBe(Math.round(bond * 1e9));
      expect(expectedBondLamports(stake)).toBe(bondLamports(bond));
    }
  });
});
