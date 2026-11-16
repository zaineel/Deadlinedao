import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/api/client';
import {
  createOrgsApi,
  describeStats,
  isValidOrgInviteCode,
  lamportsToSol,
  sendFundingTransfer,
  windowEnded,
} from '../src/api/orgs';
import { buildTransferTransaction } from '../src/orgs/funding-tx';
import { toBase64 } from '../src/wallet/encoding';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async (_url: unknown, _init?: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  );
}
const clientFor = (f: ReturnType<typeof mockFetch>) =>
  createApiClient({ baseUrl: 'https://x.test', getToken: () => 'TOK', fetchImpl: f as unknown as typeof fetch });

describe('orgs api request shaping', () => {
  it('lists orgs', async () => {
    const f = mockFetch(200, { organizations: [{ id: 'o1', name: 'Acme', isAdmin: false, membership: null, program: null }] });
    expect((await createOrgsApi(clientFor(f)).listOrgs())[0].id).toBe('o1');
    expect((f.mock.calls[0] as [string])[0]).toBe('https://x.test/api/orgs');
  });

  it('sets consent with PUT on the members route', async () => {
    const f = mockFetch(200, { success: true, consent: true });
    await createOrgsApi(clientFor(f)).setConsent('o1', true);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/orgs/o1/members');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ consent: true }));
  });

  it('submits a funding signature and hits the withdraw route', async () => {
    const f = mockFetch(200, { success: true, creditedLamports: 5, remainingLamports: 5 });
    const api = createOrgsApi(clientFor(f));
    await api.submitFunding('o1', 'SIG');
    expect((f.mock.calls[0] as [string, RequestInit])[1].body).toBe(JSON.stringify({ signature: 'SIG' }));
    await api.withdraw('o1');
    expect((f.mock.calls[1] as [string])[0]).toBe('https://x.test/api/orgs/o1/withdraw');
  });

  it('non-admins get a 404 from admin routes', async () => {
    const f = mockFetch(404, { error: 'Not found' });
    await expect(createOrgsApi(clientFor(f)).getStats('o1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('transfer transaction', () => {
  // Fixture generated with @solana/web3.js: Transaction({feePayer: from, recentBlockhash}).add(SystemProgram.transfer(...)).serialize({requireAllSignatures:false})
  const FROM = '11111111111111111111111111111112';
  const TO = 'SysvarRent111111111111111111111111111111111';
  const BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k';
  const WEB3_FIXTURE =
    'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEGp9UXGSxcUSGMyUw9SvF/WNruCJuh/UTj29mKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxJrndgN4IFTxep3s6kO0ROug7bEsbx0xxuDkqEvwUusBAgIAAQwCAAAAAC9oWQAAAAA=';

  it('is byte-identical to what @solana/web3.js serializes', () => {
    const bytes = buildTransferTransaction({ from: FROM, to: TO, lamports: 1_500_000_000, recentBlockhash: BLOCKHASH });
    expect(toBase64(bytes)).toBe(WEB3_FIXTURE);
  });

  it('rejects non-positive amounts and bad addresses', () => {
    expect(() => buildTransferTransaction({ from: FROM, to: TO, lamports: 0, recentBlockhash: BLOCKHASH })).toThrow();
    expect(() => buildTransferTransaction({ from: 'abc', to: TO, lamports: 1, recentBlockhash: BLOCKHASH })).toThrow();
  });

  it('sendFundingTransfer builds the transfer to the server-named escrow and has the wallet sign it', async () => {
    const wallet = { signAndSendTransaction: vi.fn(async (_tx: Uint8Array) => 'SIG') };
    const api = { getEscrowAddress: vi.fn(async () => TO) };
    const rpc = vi.fn(async () =>
      new Response(JSON.stringify({ result: { value: { blockhash: BLOCKHASH } } }), { status: 200 })
    );
    const sig = await sendFundingTransfer(wallet, api, {
      orgId: 'o1',
      from: FROM,
      sol: 1.5,
      rpcUrl: 'https://rpc.test',
      fetchFn: rpc as unknown as typeof fetch,
    });
    expect(sig).toBe('SIG');
    expect(toBase64(wallet.signAndSendTransaction.mock.calls[0][0])).toBe(WEB3_FIXTURE);
  });

  it('refuses a zero amount before touching the wallet', async () => {
    const wallet = { signAndSendTransaction: vi.fn() };
    await expect(
      sendFundingTransfer(wallet, { getEscrowAddress: vi.fn() }, { orgId: 'o', from: FROM, sol: 0, rpcUrl: 'x' })
    ).rejects.toThrow('Amount');
    expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
  });
});

describe('stats and helpers', () => {
  it('explains k-anonymity suppression', () => {
    expect(describeStats({ suppressed: true, minGroupSize: 5 })).toEqual({
      suppressed: 'Not enough opted-in members yet (minimum 5).',
    });
  });

  it('shows hidden metrics when too few participants', () => {
    const r = describeStats({
      suppressed: false,
      minGroupSize: 5,
      consentingMembers: 6,
      participants: 3,
      completionRate: null,
      totalStakedLamports: null,
      totalMatchedLamports: null,
    });
    expect(r).toEqual({
      lines: [
        { label: 'Participating', value: '3 of 6' },
        { label: 'Completion rate', value: 'hidden until 5 participants' },
        { label: 'Total staked', value: 'hidden' },
        { label: 'Total matched', value: 'hidden' },
      ],
    });
  });

  it('formats lamports, window end and invite codes', () => {
    expect(lamportsToSol(1_500_000_000)).toBe('1.5');
    expect(windowEnded({ windowEnd: '2000-01-01T00:00:00Z' })).toBe(true);
    expect(windowEnded({ windowEnd: '2999-01-01T00:00:00Z' })).toBe(false);
    expect(windowEnded(null)).toBe(false);
    expect(isValidOrgInviteCode('abcd1234')).toBe(true);
    expect(isValidOrgInviteCode('short')).toBe(false);
    expect(isValidOrgInviteCode('has space 123')).toBe(false);
  });
});
