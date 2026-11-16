import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { claimWithdrawal, finalizeWithdrawal, releaseWithdrawal } from '@/lib/orgs/db';
import { orgRouteGuard } from '@/lib/orgs/route-helpers';
import { isDefiniteSendFailure, lamportsToSolNumber } from '@/lib/orgs/match';
import { sendPayoutFromEscrow } from '@/lib/solana/escrow';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const REASONS: Record<string, { status: number; message: string }> = {
  window_open: { status: 409, message: 'The program window has not ended yet' },
  nothing_to_withdraw: { status: 409, message: 'No unspent balance to withdraw' },
  goals_in_progress: { status: 409, message: 'Member goals from the program are still in progress' },
  withdrawal_in_flight: { status: 409, message: 'A withdrawal is already in progress' },
  no_pool: { status: 404, message: 'Not found' },
  not_admin: { status: 404, message: 'Not found' },
};

/**
 * POST /api/orgs/[id]/withdraw
 * Org admin withdraws the UNSPENT pool balance, only after the program window
 * has ended. Claim-before-send: the pool is zeroed and a pending
 * org_withdrawals row (one in flight per org) is written in one DB
 * transaction BEFORE any SOL moves. Definite failure returns the balance;
 * an ambiguous failure leaves it claimed for manual reconciliation.
 * Funds are always sent to the session wallet.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await orgRouteGuard(request, (await params).id, { requireAdmin: true });
  if (!guard.ok) return guard.response;
  const limited = rateLimit(request, { name: 'orgs-withdraw', limit: 5, windowMs: 60 * 60_000, key: guard.wallet });
  if (limited) return limited;

  const claim = await claimWithdrawal(guard.orgId, guard.wallet);
  if (!claim.ok) {
    const known = REASONS[claim.reason];
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    return NextResponse.json({ error: 'Withdrawal failed' }, { status: 500 });
  }

  const sol = lamportsToSolNumber(claim.amountLamports);
  const result = await sendPayoutFromEscrow(guard.wallet, sol);
  const { signature } = result;
  if (signature && !result.ambiguous && !result.error) {
    await finalizeWithdrawal(claim.id, signature);
    return NextResponse.json({ success: true, amountLamports: claim.amountLamports, signature });
  }
  if (isDefiniteSendFailure(result)) {
    await releaseWithdrawal(claim.id);
    return NextResponse.json({ error: 'Transfer failed; your balance was kept in the pool' }, { status: 502 });
  }
  console.error(`[orgs] withdrawal ${claim.id} is in an ambiguous state (signature ${signature ?? 'unknown'}); left claimed for manual review`);
  return NextResponse.json(
    { error: 'Transfer status is unconfirmed; do not retry. Contact support to reconcile.' },
    { status: 502 }
  );
}
