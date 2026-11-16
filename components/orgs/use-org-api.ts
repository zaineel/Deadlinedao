'use client';

import { useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * fetch wrapper for the orgs API. Uses the dd_session cookie; on a 401 it
 * signs in with the connected wallet (free message signature) and retries once.
 */
export function useOrgApi() {
  const { publicKey, signMessage } = useWallet();

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessage) return false;
    const wallet = publicKey.toBase58();
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
    const signature = toBase64(await signMessage(new TextEncoder().encode(message)));
    const verifyRes = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, nonce, issuedAt, signature }),
    });
    return verifyRes.ok;
  }, [publicKey, signMessage]);

  const api = useCallback(
    async (path: string, init?: { method?: string; body?: unknown }) => {
      const run = () =>
        fetch(path, {
          method: init?.method ?? 'GET',
          headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
          body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
          credentials: 'same-origin',
        });
      let res = await run();
      if (res.status === 401 && (await signIn())) res = await run();
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, data };
    },
    [signIn]
  );

  return { api, wallet: publicKey?.toBase58() ?? null };
}

export const lamportsToSol = (n: number) => (n / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 });
