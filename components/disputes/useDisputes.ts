'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSession } from '@/components/auth/SessionProvider';

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

/** Loads the wallet's disputes and signs in through the shared session on request. */
export function useDisputes(refreshKey: unknown) {
  const { publicKey } = useWallet();
  const session = useSession();
  const [state, setState] = useState<DisputesState>(OFF);

  const load = useCallback(async () => {
    if (!publicKey) return setState(OFF);
    try {
      const res = await fetch('/api/disputes', { credentials: 'include' });
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

  // One shared sign-in for the whole app; reload once the session is established.
  const signIn = useCallback(async (): Promise<boolean> => {
    const ok = await session.signIn();
    if (ok) await load();
    return ok;
  }, [session, load]);

  return { ...state, reload: load, signIn };
}
