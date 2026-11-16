import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { DashboardGoal } from '../api/disputes';
import { useAuth } from '../auth/auth-context';
import { useDisputesApi, useDisputesData } from '../disputes/use-disputes';
import { useFeatures } from '../features/use-features';
import { errorMessage } from '../ui/kit';

/** Goals + dispute quotes for the signed-in wallet; reloads on focus and exposes pull-to-refresh. */
export function useGoalsData(extraReload?: () => Promise<void>) {
  const { session } = useAuth();
  const goalsApi = useDisputesApi();
  const { features } = useFeatures();
  const disputes = useDisputesData();
  const [goals, setGoals] = useState<DashboardGoal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const disputesOn = features?.disputes === true;
  const reloadDisputes = disputes.reload;

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      setGoals(await goalsApi.goals(session.wallet));
    } catch (e) {
      setError(errorMessage(e));
    }
    setNow(Date.now());
  }, [goalsApi, session]);

  const reloadAll = useCallback(async () => {
    await Promise.all([load(), disputesOn ? reloadDisputes() : Promise.resolve(), extraReload ? extraReload() : Promise.resolve()]);
  }, [load, disputesOn, reloadDisputes, extraReload]);

  useFocusEffect(
    useCallback(() => {
      void reloadAll();
    }, [reloadAll])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  }, [reloadAll]);

  return {
    goals,
    error,
    disputesError: disputes.error,
    refreshing,
    refresh,
    now,
    features,
    disputeFor: (id: string) => disputes.data?.disputes.find((d) => d.goalId === id),
    quoteFor: (id: string) => disputes.data?.appealable.find((a) => a.goalId === id),
  };
}
