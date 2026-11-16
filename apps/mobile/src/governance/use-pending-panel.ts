import { useCallback, useMemo, useState } from 'react';
import { createGovernanceApi } from '../api/governance';
import { useAuth } from '../auth/auth-context';
import { pendingAssignments } from './pending';

/** Pending panel assignments for the signed-in user. Fails quietly (flag off, 404, network) -> 0. */
export function usePendingPanel(enabled: boolean) {
  const { api } = useAuth();
  const gov = useMemo(() => createGovernanceApi(api), [api]);
  const [count, setCount] = useState(0);
  const reload = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const o = await gov.getOverview();
      setCount(pendingAssignments(o.assignments, Date.now()).length);
    } catch {
      setCount(0);
    }
  }, [gov, enabled]);
  return { count, reload };
}
