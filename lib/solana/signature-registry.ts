import { supabase } from '@/lib/supabase/client';

/**
 * One on-chain transfer must be credited exactly once, across every feature
 * that accepts a user-submitted funding signature. Add each new table that
 * stores a stake/bond/funding signature here (disputes.bond_tx_signature,
 * team stakes, ...) when it lands.
 */
export const SIGNATURE_SOURCES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'goals', column: 'stake_tx_signature' },
  { table: 'org_fundings', column: 'tx_signature' },
];

/** True when the signature already backs a goal stake or an org funding. Throws on a DB error (fail closed). */
export async function isSignatureUsed(signature: string): Promise<boolean> {
  const results = await Promise.all(
    SIGNATURE_SOURCES.map((s) => supabase.from(s.table).select('*', { head: true, count: 'exact' }).eq(s.column, signature))
  );
  for (const r of results) {
    if (r.error) throw r.error;
  }
  return results.some((r) => (r.count ?? 0) > 0);
}
