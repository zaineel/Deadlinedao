'use client';

import { useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSession } from '@/components/auth/SessionProvider';

/**
 * Calls team APIs with the shared wallet session. On a 401 with no live
 * session, the session provider prompts sign-in once and retries.
 */
export function useTeamsApi() {
  const { publicKey } = useWallet();
  const { authFetch } = useSession();

  const api = useCallback(
    async <T = Record<string, unknown>>(
      path: string,
      init?: { method?: string; body?: unknown }
    ): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> => {
      const res = await authFetch(path, {
        method: init?.method ?? 'GET',
        headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      return { ok: res.ok, status: res.status, data };
    },
    [authFetch]
  );

  return { api, connected: !!publicKey, wallet: publicKey?.toString() ?? null };
}
