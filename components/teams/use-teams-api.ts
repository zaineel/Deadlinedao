'use client';

import { useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

/**
 * Calls team APIs with the wallet-session cookie. On a 401 it runs the
 * sign-in-with-wallet flow (nonce -> signMessage -> verify) once and retries.
 */
export function useTeamsApi() {
  const { publicKey, signMessage } = useWallet();

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessage) return false;
    const wallet = publicKey.toString();
    const nonceRes = await fetch('/api/auth/nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    });
    if (!nonceRes.ok) return false;
    const { nonce, issuedAt, message } = (await nonceRes.json()) as {
      nonce: string;
      issuedAt: number;
      message: string;
    };
    const sig = await signMessage(new TextEncoder().encode(message));
    const signature = btoa(String.fromCharCode(...sig));
    const verifyRes = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, nonce, issuedAt, signature }),
    });
    return verifyRes.ok;
  }, [publicKey, signMessage]);

  const api = useCallback(
    async <T = Record<string, unknown>>(
      path: string,
      init?: { method?: string; body?: unknown }
    ): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> => {
      const run = async () => {
        const res = await fetch(path, {
          method: init?.method ?? 'GET',
          credentials: 'same-origin',
          headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
          body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
        const data = (await res.json().catch(() => ({}))) as T & { error?: string };
        return { ok: res.ok, status: res.status, data };
      };
      let result = await run();
      if (result.status === 401 && (await signIn())) result = await run();
      return result;
    },
    [signIn]
  );

  return { api, connected: !!publicKey, wallet: publicKey?.toString() ?? null };
}
