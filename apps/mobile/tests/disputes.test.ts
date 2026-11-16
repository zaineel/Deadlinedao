import nacl from 'tweetnacl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/api/client';
import { createDisputesApi } from '../src/api/disputes';
import { bondLamports, fileAppeal, validateReason } from '../src/disputes/appeal-flow';
import { fetchFeatures, parseFeatures } from '../src/features/features';
import { canShare, computeStats, countdown } from '../src/goals/dashboard';
import { buildTransferTransaction, fetchLatestBlockhash } from '../src/solana/transfer';
import { toBase58 } from '../src/wallet/encoding';
import type { WalletProvider } from '../src/wallet/types';

const key = () => toBase58(nacl.sign.keyPair().publicKey);

function client(status: number, body: unknown) {
  const f = vi.fn(async (_u: unknown, _i?: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  );
  return { f, api: createApiClient({ baseUrl: 'https://x.test', getToken: () => 'TOK', fetchImpl: f as unknown as typeof fetch }) };
}

describe('disputes api', () => {
  it('maps 404 to unavailable and keeps 401 as an error', async () => {
    expect(await createDisputesApi(client(404, { error: 'x' }).api).list()).toEqual({ available: false });
    await expect(createDisputesApi(client(401, { error: 'no' }).api).list()).rejects.toBeInstanceOf(ApiError);
  });
  it('normalizes the list response', async () => {
    const r = await createDisputesApi(client(200, { success: true }).api).list();
    expect(r).toEqual({ available: true, data: { escrowAddress: null, appealable: [], disputes: [] } });
  });
  it('POSTs goalId, trimmed reason and bondSignature only', async () => {
    const c = client(201, { success: true, disputeId: 'd', bondAmount: 0.05, goal_status: 'disputed' });
    await createDisputesApi(c.api).openDispute({ goalId: 'g', reason: '  because it was fine  ', bondSignature: 'SIG' });
    const [url, init] = c.f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/disputes');
    expect(JSON.parse(init.body as string)).toEqual({ goalId: 'g', reason: 'because it was fine', bondSignature: 'SIG' });
  });
});

describe('fileAppeal', () => {
  it('signs a transfer of the bond to escrow, then files the dispute with the signature', async () => {
    const from = key();
    const escrow = key();
    const sent: Uint8Array[] = [];
    const wallet = {
      signAndSendTransaction: vi.fn(async (tx: Uint8Array) => {
        sent.push(tx);
        return 'BONDSIG';
      }),
    } as unknown as WalletProvider;
    const openDispute = vi.fn(async () => ({ success: true, disputeId: 'd', bondAmount: 0.05, goal_status: 'disputed' as const }));
    const blockhash = key();
    await fileAppeal(
      { wallet, disputes: { openDispute }, getBlockhash: async () => blockhash },
      { goalId: 'g', reason: 'the proof was valid', bondAmount: 0.05, escrowAddress: escrow, walletAddress: from }
    );
    expect(Buffer.from(sent[0]).toString('hex')).toBe(
      Buffer.from(buildTransferTransaction({ from, to: escrow, lamports: 50_000_000, recentBlockhash: blockhash })).toString('hex')
    );
    expect(openDispute).toHaveBeenCalledWith({ goalId: 'g', reason: 'the proof was valid', bondSignature: 'BONDSIG' });
  });
  it('does not touch the wallet when the reason is too short', async () => {
    const signAndSendTransaction = vi.fn();
    const wallet = { signAndSendTransaction } as unknown as WalletProvider;
    await expect(
      fileAppeal(
        { wallet, disputes: { openDispute: vi.fn() }, getBlockhash: async () => key() },
        { goalId: 'g', reason: 'no', bondAmount: 0.05, escrowAddress: key(), walletAddress: key() }
      )
    ).rejects.toThrow();
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });
});

describe('features', () => {
  it('only strict true enables a feature', () => {
    expect(parseFeatures({ disputes: true, teams: 'yes', orgs: 1 })).toEqual({
      disputes: true, teams: false, orgs: false, push: false, governance: false,
    });
    expect(parseFeatures(null).disputes).toBe(false);
  });
  it('fails closed on errors and requests without auth', async () => {
    expect((await fetchFeatures(client(500, {}).api)).push).toBe(false);
    const c = client(200, { push: true });
    expect((await fetchFeatures(c.api)).push).toBe(true);
    const init = (c.f.mock.calls[0] as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('dashboard helpers', () => {
  const g = (status: string, stake: number) =>
    ({ id: status, status, stake_amount: stake }) as unknown as Parameters<typeof computeStats>[0][number];
  it('counts statuses and sums unsettled stake', () => {
    const s = computeStats([g('active', 0.1), g('completed', 1), g('failed', 2), g('rejected_appealable', 0.2), g('disputed', 0.3)]);
    expect(s).toEqual({ active: 1, completed: 1, failed: 1, inReview: 2, totalStaked: 0.6 });
  });
  it('formats countdowns', () => {
    const now = Date.UTC(2026, 0, 1);
    expect(countdown(new Date(now + 50 * 3600_000 + 5 * 60_000).toISOString(), now)).toBe('2d 2h left');
    expect(countdown(new Date(now + 90 * 60_000).toISOString(), now)).toBe('1h 30m left');
    expect(countdown(new Date(now - 1).toISOString(), now)).toBe('closed');
    expect(countdown(null, now)).toBeNull();
  });
  it('only completed goals are shareable', () => {
    expect(canShare({ status: 'completed' })).toBe(true);
    expect(canShare({ status: 'failed' })).toBe(false);
  });
});

describe('transfer helpers', () => {
  it('rejects bad lamports and keys', () => {
    expect(() => buildTransferTransaction({ from: key(), to: key(), lamports: 0, recentBlockhash: key() })).toThrow();
    expect(() => buildTransferTransaction({ from: 'abc', to: key(), lamports: 1, recentBlockhash: key() })).toThrow();
  });
  it('reads the blockhash from RPC', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ result: { value: { blockhash: 'BH' } } }) }));
    expect(await fetchLatestBlockhash('https://rpc', f)).toBe('BH');
    const bad = vi.fn(async () => ({ ok: true, json: async () => ({ error: { message: 'nope' } }) }));
    await expect(fetchLatestBlockhash('https://rpc', bad)).rejects.toThrow('nope');
  });
  it('bond rounds up to a lamport and validates the reason length', () => {
    expect(bondLamports(0.05)).toBe(50_000_000);
    expect(validateReason('short')).not.toBeNull();
    expect(validateReason('this is long enough')).toBeNull();
    expect(validateReason('x'.repeat(1001))).not.toBeNull();
  });
});
