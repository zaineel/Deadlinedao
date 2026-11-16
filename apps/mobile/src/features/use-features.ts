import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { fetchFeatures, Features } from './features';

export { NO_FEATURES, parseFeatures, fetchFeatures } from './features';
export type { Features } from './features';

export function useFeatures(): { features: Features | null; loading: boolean } {
  const { api } = useAuth();
  const [features, setFeatures] = useState<Features | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void fetchFeatures(api).then((f) => {
      if (cancelled) return;
      setFeatures(f);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [api]);
  return { features, loading };
}
