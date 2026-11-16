import type { PhantomCluster } from './wallet/phantom/links';

const cluster = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as PhantomCluster;

export const config = {
  /** Base URL of the DeadlineDAO web app. Set EXPO_PUBLIC_API_URL (see .env.example). */
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  urlScheme: 'deadlinedao',
  cluster,
  /** JSON-RPC endpoint used to submit transactions the wallet signed. */
  rpcUrl:
    process.env.EXPO_PUBLIC_SOLANA_RPC_URL ??
    (cluster === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com'),
};
