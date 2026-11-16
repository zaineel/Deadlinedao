/** Pure redaction for the public share card. Only whitelisted fields leave this module. */

export interface ShareableGoalRow {
  id: string;
  title: string;
  category: string;
  stake_amount: number | string;
  status: string;
  share_public: boolean | null;
  wallet_address: string;
}

export interface ShareCard {
  title: string;
  category: 'learning' | 'work' | 'health';
  stakeSol: string;
  walletShort: string;
}

const CATEGORIES = ['learning', 'work', 'health'] as const;

export function shortenWallet(wallet: string): string {
  return wallet.length > 10 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : '***';
}

export function isShareable(
  row: Pick<ShareableGoalRow, 'status' | 'share_public'> | null | undefined
): boolean {
  return !!row && row.share_public === true && row.status === 'completed';
}

/** Returns null unless the goal is completed AND opted in. */
export function buildShareCard(row: ShareableGoalRow | null | undefined): ShareCard | null {
  if (!row || !isShareable(row)) return null;
  const category = (CATEGORIES as readonly string[]).includes(row.category)
    ? (row.category as ShareCard['category'])
    : 'learning';
  const stake = Number(row.stake_amount);
  return {
    title: String(row.title).slice(0, 100),
    category,
    stakeSol: Number.isFinite(stake) ? String(Math.round(stake * 1e4) / 1e4) : '0',
    walletShort: shortenWallet(row.wallet_address),
  };
}
