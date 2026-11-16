import { describe, expect, it, vi } from 'vitest';
import { broadcastTransaction } from '../src/wallet/broadcast';

const ok = (result: unknown) => ({ ok: true, json: async () => ({ result }) });

describe('broadcastTransaction', () => {
  it('sends base64 and resolves once confirmed', async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const statuses = [{ value: [null] }, { value: [{ err: null, confirmationStatus: 'processed' }] }, { value: [{ err: null, confirmationStatus: 'confirmed' }] }];
    const fetchFn = vi.fn(async (_u: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      calls.push(b);
      return b.method === 'sendTransaction' ? ok('SIG1') : ok(statuses.shift());
    });
    const sig = await broadcastTransaction('http://rpc', new Uint8Array([1, 2, 3]), { fetchFn, pollMs: 1 });
    expect(sig).toBe('SIG1');
    expect(calls[0].params[0]).toBe('AQID');
    expect(calls.filter((c) => c.method === 'getSignatureStatuses')).toHaveLength(3);
  });

  it('fails when the transaction errors on-chain', async () => {
    const fetchFn = vi.fn(async (_u: string, init: { body: string }) =>
      JSON.parse(init.body).method === 'sendTransaction' ? ok('S') : ok({ value: [{ err: { x: 1 } }] })
    );
    await expect(broadcastTransaction('http://rpc', new Uint8Array([1]), { fetchFn, pollMs: 1 })).rejects.toThrow('failed on-chain');
  });

  it('surfaces RPC errors and times out', async () => {
    const bad = vi.fn(async () => ({ ok: true, json: async () => ({ error: { message: 'Blockhash not found' } }) }));
    await expect(broadcastTransaction('http://rpc', new Uint8Array([1]), { fetchFn: bad })).rejects.toThrow('Blockhash not found');
    const never = vi.fn(async (_u: string, init: { body: string }) =>
      JSON.parse(init.body).method === 'sendTransaction' ? ok('S') : ok({ value: [null] })
    );
    await expect(broadcastTransaction('http://rpc', new Uint8Array([1]), { fetchFn: never, timeoutMs: 20, pollMs: 5 })).rejects.toThrow('Timed out');
  });
});
