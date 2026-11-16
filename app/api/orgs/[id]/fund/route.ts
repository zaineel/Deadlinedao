import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { fundOrgSchema } from '@/lib/validation/orgs-schemas';
import { creditFunding, fundingSignatureUsed, getPool } from '@/lib/orgs/db';
import { orgRouteGuard } from '@/lib/orgs/route-helpers';
import { verifyFundingTransfer } from '@/lib/orgs/verify-funding';
import { windowHasEnded } from '@/lib/orgs/funding';
import { getEscrowAddress } from '@/lib/solana/escrow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/orgs/[id]/fund: where to send funds (admin only). */
export async function GET(request: NextRequest, { params }: Ctx) {
  const guard = await orgRouteGuard(request, (await params).id, { requireAdmin: true });
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ escrowAddress: getEscrowAddress() });
  } catch {
    return NextResponse.json({ error: 'Escrow is not configured' }, { status: 503 });
  }
}

/**
 * POST /api/orgs/[id]/fund { signature }
 * The admin first sends SOL from their (session) wallet to the escrow, then
 * submits the signature. The server verifies the transfer (sender, destination)
 * and credits the amount that actually moved. A signature is credited once
 * (unique), and cannot be one already used as a goal stake.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const guard = await orgRouteGuard(request, (await params).id, { requireAdmin: true });
  if (!guard.ok) return guard.response;
  const limited = rateLimit(request, { name: 'orgs-fund', limit: 20, windowMs: 60 * 60_000, key: guard.wallet });
  if (limited) return limited;

  const parsed = await parseBody(request, fundOrgSchema);
  if (!parsed.ok) return parsed.response;
  const { signature } = parsed.data;

  const { data: pool } = await getPool(guard.orgId);
  if (!pool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (windowHasEnded(Date.now(), Date.parse(pool.window_end))) {
    return NextResponse.json({ error: 'The program window has ended' }, { status: 409 });
  }

  if (await fundingSignatureUsed(signature)) {
    return NextResponse.json({ error: 'Transaction already used' }, { status: 409 });
  }

  const verified = await verifyFundingTransfer(signature, guard.wallet);
  if (!verified.ok) {
    if (verified.reason === 'rpc_error') {
      return NextResponse.json({ error: 'Could not verify the transaction yet. Try again shortly.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Funding transaction could not be verified' }, { status: 400 });
  }

  const result = await creditFunding(guard.orgId, guard.wallet, signature, verified.lamports);
  if (result.status === 'duplicate') {
    return NextResponse.json({ error: 'Transaction already used' }, { status: 409 });
  }
  if (result.status === 'pool_closed') {
    return NextResponse.json({ error: 'The program window has ended' }, { status: 409 });
  }
  if (result.status === 'error') {
    return NextResponse.json({ error: 'Failed to record funding' }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    creditedLamports: verified.lamports,
    remainingLamports: result.remainingLamports,
  });
}
