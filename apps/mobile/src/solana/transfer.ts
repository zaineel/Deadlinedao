import { fromBase58 } from '../wallet/encoding';

const SYSTEM_PROGRAM = new Uint8Array(32); // 11111111111111111111111111111111
export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Serialized UNSIGNED legacy transaction with one SystemProgram.transfer,
 * byte-identical to @solana/web3.js `new Transaction().add(SystemProgram.transfer(...))`
 * with recentBlockhash/feePayer set (see tests/transfer.test.ts). The wallet adds the signature.
 */
export function buildTransferTransaction(p: {
  from: string;
  to: string;
  lamports: number;
  recentBlockhash: string;
}): Uint8Array {
  if (!Number.isSafeInteger(p.lamports) || p.lamports <= 0) throw new RangeError('Invalid lamports');
  const from = fromBase58(p.from);
  const to = fromBase58(p.to);
  const blockhash = fromBase58(p.recentBlockhash);
  if (from.length !== 32 || to.length !== 32 || blockhash.length !== 32) throw new Error('Invalid address or blockhash');

  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true); // SystemInstruction::Transfer
  view.setBigUint64(4, BigInt(p.lamports), true);

  const parts = [
    Uint8Array.of(1), // one signature slot
    new Uint8Array(64), // placeholder, filled by the wallet
    Uint8Array.of(1, 0, 1), // 1 signer, 0 readonly signed, 1 readonly unsigned (system program)
    Uint8Array.of(3), // account keys
    from,
    to,
    SYSTEM_PROGRAM,
    blockhash,
    Uint8Array.of(1), // instructions
    Uint8Array.of(2, 2, 0, 1, 12), // program index, 2 accounts [0,1], data length
    data,
  ];
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of parts) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export async function fetchLatestBlockhash(rpcUrl: string, fetchFn?: Fetch): Promise<string> {
  const f: Fetch = fetchFn ?? ((u, i) => fetch(u, i));
  const res = await f(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }),
  });
  const body = (await res.json()) as { result?: { value?: { blockhash?: string } }; error?: { message?: string } };
  const hash = body.result?.value?.blockhash;
  if (!res.ok || !hash) throw new Error(body.error?.message ?? 'Could not fetch a recent blockhash');
  return hash;
}
