import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadOnboardingDone, saveOnboardingDone } from './store';

interface OnboardingState {
  ready: boolean;
  done: boolean;
  complete: () => Promise<void>;
}
const Ctx = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadOnboardingDone().then((d) => {
      if (cancelled) return;
      setDone(d);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const complete = useCallback(async () => {
    setDone(true);
    await saveOnboardingDone();
  }, []);
  const value = useMemo(() => ({ ready, done, complete }), [ready, done, complete]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding(): OnboardingState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return v;
}
