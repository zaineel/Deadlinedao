/**
 * Pure helpers for verifying an org funding transfer and org authorization.
 */

/** Minimal shape of a parsed transaction (what getParsedTransaction returns). */
export interface ParsedTxLike {
  meta?: { err?: unknown } | null;
  transaction: {
    message: {
      instructions: Array<{
        program?: string;
        parsed?: { type?: string; info?: { source?: string; destination?: string; lamports?: number } };
      }>;
    };
  };
}

export type FundingCheck =
  | { ok: true; lamports: number }
  | { ok: false; reason: 'tx_failed' | 'no_transfer' };

/**
 * Sum of top-level system transfers `source -> destination`. The credited
 * amount is what actually moved on-chain, never a client-supplied number.
 */
export function extractFundingLamports(tx: ParsedTxLike, source: string, destination: string): FundingCheck {
  if (tx.meta?.err) return { ok: false, reason: 'tx_failed' };
  let total = 0;
  for (const ix of tx.transaction.message.instructions) {
    if (ix.program !== 'system' || ix.parsed?.type !== 'transfer') continue;
    const info = ix.parsed.info;
    if (info?.source === source && info.destination === destination && Number.isSafeInteger(info.lamports)) {
      total += info.lamports as number;
    }
  }
  return total > 0 ? { ok: true, lamports: total } : { ok: false, reason: 'no_transfer' };
}

export function isOrgAdmin(adminWallets: readonly string[], wallet: string): boolean {
  return adminWallets.includes(wallet);
}

/** Withdrawals open strictly after the program window ends. */
export function windowHasEnded(nowMs: number, windowEndMs: number): boolean {
  return nowMs > windowEndMs;
}
