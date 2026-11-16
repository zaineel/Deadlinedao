import { describe, it, expect, vi } from 'vitest';

const counts: Record<string, number> = {};
const errors: Record<string, { code: string } | undefined> = {};
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: async () => ({ count: counts[table] ?? 0, error: errors[table] ?? null }) }),
    }),
  },
}));

import { isSignatureUsed, SIGNATURE_SOURCES } from '@/lib/solana/signature-registry';

describe('isSignatureUsed', () => {
  it('covers goal stakes, org fundings and dispute bonds', () => {
    expect(SIGNATURE_SOURCES.map((s) => s.table)).toEqual(['goals', 'org_fundings', 'disputes']);
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
  it('a dispute bond signature counts as used', async () => {
    counts.goals = 0; counts.org_fundings = 0; counts.disputes = 1;
    expect(await isSignatureUsed('s')).toBe(true);
    counts.disputes = 0;
  });
  it('ignores a missing disputes table (flag off, migration 003 not applied) but not other errors', async () => {
    errors.disputes = { code: '42P01' };
    expect(await isSignatureUsed('s')).toBe(false);
    errors.disputes = { code: 'XX000' };
    await expect(isSignatureUsed('s')).rejects.toBeTruthy();
    errors.disputes = undefined;
    errors.goals = { code: '42P01' };
    await expect(isSignatureUsed('s')).rejects.toBeTruthy();
    errors.goals = undefined;
  });
});
