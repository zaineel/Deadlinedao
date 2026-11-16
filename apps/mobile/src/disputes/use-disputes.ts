import { useCallback, useMemo, useState } from 'react';
import { createDisputesApi, DisputesResponse } from '../api/disputes';
import { useAuth } from '../auth/auth-context';
import { errorMessage } from '../ui/kit';

/** The dispute API bound to the signed-in client. */
export function useDisputesApi() {
  const { api } = useAuth();
  return useMemo(() => createDisputesApi(api), [api]);
}

/** Loads GET /api/disputes on demand. `enabled` false (flag off / 404) leaves `data` null. */
export function useDisputesData() {
  const disputes = useDisputesApi();
  const [data, setData] = useState<DisputesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const res = await disputes.list();
      setData(res.available ? res.data : null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [disputes]);

  return { data, error, reload };
}
