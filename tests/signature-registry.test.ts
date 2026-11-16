import { describe, it, expect, vi } from 'vitest';

const counts: Record<string, number> = {};
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: async () => ({ count: counts[table] ?? 0, error: null }) }),
    }),
  },
}));

import { isSignatureUsed, SIGNATURE_SOURCES } from '@/lib/solana/signature-registry';

describe('isSignatureUsed', () => {
  it('covers goal stakes and org fundings', () => {
    expect(SIGNATURE_SOURCES.map((s) => s.table)).toEqual(['goals', 'org_fundings']);
  });
  it('is true when any table has the signature', async () => {
    counts.goals = 0; counts.org_fundings = 1;
    expect(await isSignatureUsed('s')).toBe(true);
    counts.goals = 1; counts.org_fundings = 0;
    expect(await isSignatureUsed('s')).toBe(true);
  });
  it('is false when none has it', async () => {
    counts.goals = 0; counts.org_fundings = 0;
    expect(await isSignatureUsed('s')).toBe(false);
  });
});
