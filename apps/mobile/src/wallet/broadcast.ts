import { toBase64 } from './encoding';
import { WalletError } from './types';

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

interface RpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

async function rpc<T>(fetchFn: Fetch, url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await res.json()) as RpcResponse<T>;
  if (!res.ok || body.error) throw new WalletError(body.error?.message ?? `Solana RPC ${method} failed`);
  return body.result as T;
}

/**
 * Submits a wallet-signed transaction over JSON-RPC and waits until it is confirmed.
 * Resolves with the base58 transaction signature.
 */
export async function broadcastTransaction(
  rpcUrl: string,
  signedTransaction: Uint8Array,
  opts: { fetchFn?: Fetch; timeoutMs?: number; pollMs?: number } = {}
): Promise<string> {
  const fetchFn: Fetch = opts.fetchFn ?? ((u, i) => fetch(u, i));
  const signature = await rpc<string>(fetchFn, rpcUrl, 'sendTransaction', [
    toBase64(signedTransaction),
    { encoding: 'base64', preflightCommitment: 'confirmed' },
  ]);

  const deadline = Date.now() + (opts.timeoutMs ?? 45_000);
  for (;;) {
    const status = await rpc<{ value: Array<{ err: unknown; confirmationStatus?: string } | null> }>(
      fetchFn,
      rpcUrl,
      'getSignatureStatuses',
      [[signature], { searchTransactionHistory: false }]
    );
    const s = status.value[0];
    if (s) {
      if (s.err) throw new WalletError('The transaction failed on-chain');
      if (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized') return signature;
    }
    if (Date.now() > deadline) throw new WalletError('Timed out waiting for the transaction to confirm');
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 1500));
  }
}
