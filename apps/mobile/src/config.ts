import type { PhantomCluster } from './wallet/phantom/links';

const cluster = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as PhantomCluster;

export const config = {
  /** Base URL of the DeadlineDAO web app. Set EXPO_PUBLIC_API_URL (see .env.example). */
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  urlScheme: 'deadlinedao',
  cluster,
};
