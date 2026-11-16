import type { ApiClient } from './client';
import type { WalletProvider } from '../wallet/types';
import { buildTransferTransaction, fetchLatestBlockhash, solToLamports } from '../orgs/funding-tx';

/** Types mirror app/api/orgs/** (amounts are lamports) and lib/orgs/stats.ts. */
export interface OrgProgram {
  matchRateBps: number;
  perMemberCapLamports: number;
  windowStart: string;
  windowEnd: string;
  /** admins only */
  fundedLamports?: number;
  remainingLamports?: number;
  withdrawnLamports?: number;
}

export interface OrgView {
  id: string;
  name: string;
  isAdmin: boolean;
  /** admins only */
  inviteCode?: string;
  membership: { joinedAt: string; consent: boolean } | null;
  program: OrgProgram | null;
}

export type OrgStats =
  | { suppressed: true; minGroupSize: number; reason?: string }
  | {
      suppressed: false;
      minGroupSize: number;
      consentingMembers: number;
      participants: number;
      completionRate: number | null;
      totalStakedLamports: number | null;
      totalMatchedLamports: number | null;
    };

export interface OrgMembersInfo {
  membership: { joinedAt: string; consent: boolean } | null;
  headcount?: { total: number; consenting: number };
}

export function createOrgsApi(client: Pick<ApiClient, 'request'>) {
  const { request } = client;
  const id = encodeURIComponent;
  return {
    listOrgs: async () => (await request<{ organizations: OrgView[] }>('GET', '/api/orgs')).organizations ?? [],
    joinOrg: (inviteCode: string) =>
      request<{ orgId: string; orgName: string; alreadyMember: boolean }>('POST', '/api/orgs/join', {
        json: { inviteCode },
      }),
    getMembers: (orgId: string) => request<OrgMembersInfo>('GET', `/api/orgs/${id(orgId)}/members`),
    setConsent: (orgId: string, consent: boolean) =>
      request<{ success: boolean; consent: boolean }>('PUT', `/api/orgs/${id(orgId)}/members`, { json: { consent } }),
    getEscrowAddress: async (orgId: string) =>
      (await request<{ escrowAddress: string }>('GET', `/api/orgs/${id(orgId)}/fund`)).escrowAddress,
    submitFunding: (orgId: string, signature: string) =>
      request<{ success: boolean; creditedLamports: number; remainingLamports: number }>(
        'POST',
        `/api/orgs/${id(orgId)}/fund`,
        { json: { signature } }
      ),
    getStats: async (orgId: string) => (await request<{ stats: OrgStats }>('GET', `/api/orgs/${id(orgId)}/stats`)).stats,
    withdraw: (orgId: string) =>
      request<{ success: boolean; amountLamports: number; signature: string }>('POST', `/api/orgs/${id(orgId)}/withdraw`, {
        json: {},
      }),
  };
}

export type OrgsApi = ReturnType<typeof createOrgsApi>;

/**
 * Admin funding: the app builds a plain SOL transfer to the escrow the server named, Phantom signs it and the
 * app broadcasts. The signature is returned BEFORE the server call so a failed verification can be retried
 * (the server credits a signature once, based on what actually moved on chain).
 */
export async function sendFundingTransfer(
  wallet: Pick<WalletProvider, 'signAndSendTransaction'>,
  api: Pick<OrgsApi, 'getEscrowAddress'>,
  p: { orgId: string; from: string; sol: number; rpcUrl: string; fetchFn?: typeof fetch }
): Promise<string> {
  const lamports = solToLamports(p.sol);
  if (!(lamports > 0)) throw new Error('Amount must be greater than 0');
  const [escrow, recentBlockhash] = await Promise.all([
    api.getEscrowAddress(p.orgId),
    fetchLatestBlockhash(p.rpcUrl, p.fetchFn),
  ]);
  return wallet.signAndSendTransaction(buildTransferTransaction({ from: p.from, to: escrow, lamports, recentBlockhash }));
}

// ---- pure helpers -------------------------------------------------------

export const lamportsToSol = (n: number): string =>
  (n / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 4 });

export function windowEnded(program: Pick<OrgProgram, 'windowEnd'> | null, now = Date.now()): boolean {
  return program ? now > Date.parse(program.windowEnd) : false;
}

export type StatsLine = { label: string; value: string };

/** k-anonymity wording like the web dashboard. */
export function describeStats(stats: OrgStats): { suppressed: string } | { lines: StatsLine[] } {
  if (stats.suppressed) return { suppressed: `Not enough opted-in members yet (minimum ${stats.minGroupSize}).` };
  return {
    lines: [
      { label: 'Participating', value: `${stats.participants} of ${stats.consentingMembers}` },
      {
        label: 'Completion rate',
        value:
          stats.completionRate === null
            ? `hidden until ${stats.minGroupSize} participants`
            : `${Math.round(stats.completionRate * 100)}%`,
      },
      {
        label: 'Total staked',
        value: stats.totalStakedLamports === null ? 'hidden' : `${lamportsToSol(stats.totalStakedLamports)} SOL`,
      },
      {
        label: 'Total matched',
        value: stats.totalMatchedLamports === null ? 'hidden' : `${lamportsToSol(stats.totalMatchedLamports)} SOL`,
      },
    ],
  };
}

/** Org invite codes: 8-64 chars of [A-Za-z0-9_-] (joinOrgSchema). */
export function isValidOrgInviteCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(code.trim());
}
