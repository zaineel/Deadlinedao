'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export interface AppealableGoal {
  goalId: string;
  appealDeadline: string;
  bondAmount: number;
}

export interface DisputeSummary {
  id: string;
  goalId: string;
  reason: string;
  bondAmount: number;
  status: 'open' | 'overturned' | 'upheld';
}

interface DisputesState {
  /** false while the feature flag is off (server answers 404): UI stays hidden. */
  enabled: boolean;
  needsSignIn: boolean;
  escrowAddress: string | null;
  appealable: AppealableGoal[];
  disputes: DisputeSummary[];
}

const OFF: DisputesState = { enabled: false, needsSignIn: false, escrowAddress: null, appealable: [], disputes: [] };

/** Loads the wallet's disputes and signs in with the wallet (free message signature) on request. */
export function useDisputes(refreshKey: unknown) {
  const { publicKey, signMessage } = useWallet();
  const [state, setState] = useState<DisputesState>(OFF);

  const load = useCallback(async () => {
    if (!publicKey) return setState(OFF);
    try {
      const res = await fetch('/api/disputes');
      if (res.status === 404) return setState(OFF);
      if (res.status === 401) return setState({ ...OFF, enabled: true, needsSignIn: true });
      if (!res.ok) return setState(OFF);
      const data = await res.json();
      setState({
        enabled: true,
        needsSignIn: false,
        escrowAddress: data.escrowAddress ?? null,
        appealable: data.appealable ?? [],
        disputes: data.disputes ?? [],
      });
    } catch {
      setState(OFF);
    }
  }, [publicKey]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessage) return false;
    const wallet = publicKey.toString();
    const nonceRes = await fetch('/api/auth/nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    });
    if (!nonceRes.ok) return false;
    const { nonce, issuedAt, message } = await nonceRes.json();
    const bytes = await signMessage(new TextEncoder().encode(message));
    const signature = btoa(String.fromCharCode(...bytes));
    const verifyRes = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, nonce, issuedAt, signature }),
    });
    if (!verifyRes.ok) return false;
    await load();
    return true;
  }, [publicKey, signMessage, load]);

  return { ...state, reload: load, signIn };
}
