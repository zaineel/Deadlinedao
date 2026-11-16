import { fromBase58 } from '../wallet/encoding';

/**
 * Builds an unsigned legacy System Program transfer (the same bytes @solana/web3.js
 * `Transaction.serialize({ requireAllSignatures: false })` produces) so Phantom can sign it.
 * The web org dashboard builds this client-side too; the server only verifies the landed transfer.
 */
export function buildTransferTransaction(p: {
  from: string;
  to: string;
  lamports: number;
  recentBlockhash: string;
}): Uint8Array {
  if (!Number.isSafeInteger(p.lamports) || p.lamports <= 0) throw new Error('Amount must be greater than 0');
  const from = fromBase58(p.from);
  const to = fromBase58(p.to);
  const blockhash = fromBase58(p.recentBlockhash);
  if (from.length !== 32 || to.length !== 32 || blockhash.length !== 32) throw new Error('Invalid address or blockhash');

  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true); // SystemInstruction::Transfer
  view.setBigUint64(4, BigInt(p.lamports), true);

  const message = Uint8Array.from([
    1, 0, 1, // 1 signer, 0 readonly signed, 1 readonly unsigned (system program)
    3, ...from, ...to, ...new Uint8Array(32),
    ...blockhash,
    1, // one instruction
    2, // program id index (system program)
    2, 0, 1, // two accounts: from, to
    data.length, ...data,
  ]);
  return Uint8Array.from([1, ...new Uint8Array(64), ...message]);
}

export function solToLamports(sol: number): number {
  return Math.round(sol * 1_000_000_000);
}

export async function fetchLatestBlockhash(rpcUrl: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const res = await fetchFn(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }),
  });
  const body = (await res.json()) as { result?: { value?: { blockhash?: string } }; error?: { message?: string } };
  const hash = body.result?.value?.blockhash;
  if (!res.ok || !hash) throw new Error(body.error?.message ?? 'Could not reach the Solana network');
  return hash;
}
