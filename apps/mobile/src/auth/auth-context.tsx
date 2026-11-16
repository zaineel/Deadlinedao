import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient, createApiClient } from '../api/client';
import { config } from '../config';
import { signInWithWallet } from '../flows';
import { registerForPush } from '../push/register';
import { getWalletProvider, WalletProvider } from '../wallet';
import { StoredSession } from './session';
import { clearSession, loadSession, saveSession } from './session-store';

interface AuthState {
  ready: boolean;
  session: StoredSession | null;
  wallet: WalletProvider;
  api: ApiClient;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const wallet = useMemo(() => getWalletProvider(), []);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const signOut = useCallback(async () => {
    tokenRef.current = null;
    setSession(null);
    await Promise.all([clearSession(), wallet.disconnect()]);
  }, [wallet]);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: config.apiUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: () => {
          void signOut();
        },
      }),
    [signOut]
  );

  // Restore session + wallet connection, and listen for wallet redirects.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stored] = await Promise.all([loadSession(), wallet.restore()]);
      if (cancelled) return;
      // A stored session without a restorable wallet cannot sign proofs: require reconnect.
      if (stored && wallet.publicKey === stored.wallet) {
        tokenRef.current = stored.token;
        setSession(stored);
      }
      setReady(true);
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      wallet.handleRedirect(url);
    });
    // Cold start from a wallet redirect (app was killed while in Phantom)
    void Linking.getInitialURL().then((url) => {
      if (url) wallet.handleRedirect(url);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [wallet]);

  const signIn = useCallback(async () => {
    const s = await signInWithWallet(wallet, api);
    tokenRef.current = s.token;
    await saveSession(s);
    setSession(s);
    void registerForPush(api);
  }, [wallet, api]);

  const value = useMemo(
    () => ({ ready, session, wallet, api, signIn, signOut }),
    [ready, session, wallet, api, signIn, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
