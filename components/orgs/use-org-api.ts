'use client';

import { useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSession } from '@/components/auth/SessionProvider';

/**
 * fetch wrapper for the orgs API on the shared wallet session; a 401 with no
 * live session prompts sign-in once and retries.
 */
export function useOrgApi() {
  const { publicKey } = useWallet();
  const { authFetch } = useSession();

  const api = useCallback(
    async (path: string, init?: { method?: string; body?: unknown }) => {
      const res = await authFetch(path, {
        method: init?.method ?? 'GET',
        headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, data };
    },
    [authFetch]
  );

  return { api, wallet: publicKey?.toBase58() ?? null };
}

export const lamportsToSol = (n: number) => (n / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 });
