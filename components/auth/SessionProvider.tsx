'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

/**
 * Sign-in-with-wallet for the web app.
 *
 * nonce -> wallet.signMessage -> verify. The server sets the httpOnly
 * `dd_session` cookie; the token is never readable from JS. The provider
 * restores the session on load (GET /api/auth/session) and treats a session
 * for a different wallet than the connected one as signed out (re-prompt).
 */

export type SessionStatus = 'checking' | 'signed_out' | 'signing_in' | 'signed_in';

interface SessionContextValue {
  /** Session wallet when signed in for the currently connected wallet, else null. */
  wallet: string | null;
  status: SessionStatus;
  error: string | null;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  /**
   * fetch with the session cookie. On a 401 it prompts sign-in once and retries.
   * Resolves with the final Response (a 401 stays a 401 if the user declines).
   */
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const NO_SIGN_MESSAGE =
  'Your wallet does not support message signing, which is needed to sign in. Try Phantom or Solflare.';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, signMessage, connected } = useWallet();
  const connectedWallet = publicKey?.toString() ?? null;
  const [sessionWallet, setSessionWallet] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);

  // Restore on load / whenever the connected wallet changes
  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        const data = res.ok ? ((await res.json()) as { wallet?: string }) : null;
        if (cancelled) return;
        setSessionWallet(data?.wallet ?? null);
        if (data?.wallet && connectedWallet && data.wallet !== connectedWallet) {
          setError('Your session belongs to a different wallet. Sign in with the connected wallet.');
        } else {
          setError(null);
        }
      } catch {
        if (!cancelled) setSessionWallet(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedWallet]);

  const signIn = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const run = async (): Promise<boolean> => {
      if (!connectedWallet) {
        setError('Connect your wallet first.');
        return false;
      }
      if (!signMessage) {
        setError(NO_SIGN_MESSAGE);
        return false;
      }
      setSigningIn(true);
      setError(null);
      try {
        const nonceRes = await fetch('/api/auth/nonce', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: connectedWallet }),
        });
        if (!nonceRes.ok) {
          setError('Sign-in is unavailable right now. Please try again later.');
          return false;
        }
        const { nonce, issuedAt, message } = (await nonceRes.json()) as {
          nonce: string;
          issuedAt: number;
          message: string;
        };
        const sigBytes = await signMessage(new TextEncoder().encode(message));
        const signature = btoa(String.fromCharCode(...sigBytes));
        const verifyRes = await fetch('/api/auth/verify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: connectedWallet, nonce, issuedAt, signature }),
        });
        if (!verifyRes.ok) {
          setError('Sign-in failed or expired. Please try again.');
          return false;
        }
        setSessionWallet(connectedWallet);
        return true;
      } catch {
        // user rejected the signature prompt, or the network failed
        setError('Sign-in was cancelled or failed. Please try again.');
        return false;
      } finally {
        setSigningIn(false);
        inFlight.current = null;
      }
    };
    inFlight.current = run();
    return inFlight.current;
  }, [connectedWallet, signMessage]);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // cookie clearing is best effort; local state resets regardless
    }
    setSessionWallet(null);
    setError(null);
  }, []);

  const authFetch = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      const opts: RequestInit = { ...init, credentials: 'include' };
      const res = await fetch(input, opts);
      if (res.status !== 401) return res;
      // A 401 can also be a route-level check (e.g. a bad proof signature) while
      // the session is fine: only prompt sign-in when the session is really gone.
      try {
        const check = await fetch('/api/auth/session', { credentials: 'include' });
        if (check.ok) return res;
      } catch {
        return res;
      }
      setSessionWallet(null);
      if (!(await signIn())) return res;
      return fetch(input, opts);
    },
    [signIn]
  );

  const signedIn = !!sessionWallet && sessionWallet === connectedWallet;
  const status: SessionStatus = signingIn
    ? 'signing_in'
    : checking
      ? 'checking'
      : signedIn && connected
        ? 'signed_in'
        : 'signed_out';

  const value = useMemo<SessionContextValue>(
    () => ({ wallet: signedIn ? sessionWallet : null, status, error, signIn, signOut, authFetch }),
    [signedIn, sessionWallet, status, error, signIn, signOut, authFetch]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
