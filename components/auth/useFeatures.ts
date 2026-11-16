'use client';

import { useEffect, useState } from 'react';

export interface Features {
  disputes: boolean;
  teams: boolean;
  orgs: boolean;
  push: boolean;
  governance: boolean;
}

const OFF: Features = { disputes: false, teams: false, orgs: false, push: false, governance: false };

let cached: Features | null = null;
let pending: Promise<Features> | null = null;

function load(): Promise<Features> {
  if (cached) return Promise.resolve(cached);
  pending ??= fetch('/api/features')
    .then((r) => (r.ok ? (r.json() as Promise<Partial<Features>>) : {}))
    .then((d) => {
      cached = { ...OFF, ...d };
      return cached;
    })
    .catch(() => OFF)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Public feature flags from GET /api/features. Everything is false until loaded (UI stays hidden). */
export function useFeatures(): Features {
  const [features, setFeatures] = useState<Features>(cached ?? OFF);
  useEffect(() => {
    let alive = true;
    load().then((f) => {
      if (alive) setFeatures(f);
    });
    return () => {
      alive = false;
    };
  }, []);
  return features;
}
