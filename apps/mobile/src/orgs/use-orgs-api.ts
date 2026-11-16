import { useMemo } from 'react';
import { useAuth } from '../auth/auth-context';
import { createOrgsApi } from '../api/orgs';
import { ApiError } from '../api/client';
import { errorMessage } from '../ui/kit';

export function useOrgsApi() {
  const { api } = useAuth();
  return useMemo(() => createOrgsApi(api), [api]);
}

export function orgsErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 404 && /^Request failed/.test(e.message)) return 'Organizations are not available right now.';
  return errorMessage(e);
}
