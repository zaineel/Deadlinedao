import { supabase } from '@/lib/supabase/client';

/**
 * One on-chain transfer must be credited exactly once, across every feature
 * that accepts a user-submitted funding signature. Add each new table that
 * stores a stake/bond/funding signature here (disputes.bond_tx_signature,
 * team stakes, ...) when it lands.
 */
export const SIGNATURE_SOURCES: ReadonlyArray<{ table: string; column: string; optional?: boolean }> = [
  { table: 'goals', column: 'stake_tx_signature' },
  { table: 'org_fundings', column: 'tx_signature' },
  { table: 'disputes', column: 'bond_tx_signature', optional: true },
];

/** True when the signature already backs a goal stake or an org funding. Throws on a DB error (fail closed). */
export async function isSignatureUsed(signature: string): Promise<boolean> {
  const results = await Promise.all(
    SIGNATURE_SOURCES.map((s) => supabase.from(s.table).select('*', { head: true, count: 'exact' }).eq(s.column, signature))
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    // Feature tables (disputes) may not exist yet while their flag is off and
    // the migration is unapplied: a missing table cannot hold a signature.
    if (r.error && SIGNATURE_SOURCES[i].optional && isMissingTable(r.error)) continue;
    if (r.error) throw r.error;
  }
  return results.some((r) => (r.count ?? 0) > 0);
}

function isMissingTable(error: { code?: string }): boolean {
  // 42P01 undefined_table (Postgres), PGRST205 table not in schema cache (PostgREST)
  return error.code === '42P01' || error.code === 'PGRST205';
}
