import { NextRequest, NextResponse } from 'next/server';
import { governanceDisabledResponse } from '@/lib/governance/flag';
import { requireAdmin } from '@/lib/auth/admin';
import { parseBody } from '@/lib/validation/schemas';
import { adminGovernanceSchema } from '@/lib/validation/governance-schemas';
import { adminOverride, runGovernanceCycle } from '@/lib/governance/resolve';
import { buildAdminGovernanceView } from '@/lib/governance/views';
import { listGovernanceByState, listVotes } from '@/lib/supabase/governance';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/governance: disputes the admin must decide (escalated:
 * tie / no quorum, admin: too few eligible voters) and disputes still voting.
 * Tallies of disputes still in voting are NOT included (sealed).
 */
export async function GET(request: NextRequest) {
  const disabled = governanceDisabledResponse();
  if (disabled) return disabled;
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const [escalated, admin, voting] = await Promise.all([
      listGovernanceByState('escalated'),
      listGovernanceByState('admin'),
      listGovernanceByState('voting'),
    ]);
    if (!escalated.data || !admin.data || !voting.data) {
      return NextResponse.json({ error: 'Failed to load governance queue' }, { status: 500 });
    }
    const rows = [...escalated.data, ...admin.data, ...voting.data];
    const items = await Promise.all(
      rows.map(async (g) => {
        const votes = g.state === 'escalated' ? ((await listVotes(g.dispute_id)).data ?? []) : [];
        return buildAdminGovernanceView(g, votes, g.panel_size);
      })
    );
    return NextResponse.json({ success: true, count: items.length, items });
  } catch (error) {
    console.error('[Admin] governance list error:', error);
    return NextResponse.json({ error: 'Failed to load governance queue' }, { status: 500 });
  }
}

/**
 * POST /api/admin/governance
 *   { action: 'run' }                                        run one governance pass now
 *   { action: 'override', disputeId, decision, reason }      decide a dispute (always allowed)
 * An override is written to the audit log with its reason before anything
 * moves, then resolved through the existing dispute resolution path.
 */
export async function POST(request: NextRequest) {
  const disabled = governanceDisabledResponse();
  if (disabled) return disabled;
  const denied = requireAdmin(request);
  if (denied) return denied;

  const parsed = await parseBody(request, adminGovernanceSchema);
  if (!parsed.ok) return parsed.response;

  try {
    if (parsed.data.action === 'run') {
      const summary = await runGovernanceCycle();
      return NextResponse.json({ success: true, ...summary });
    }

    const result = await adminOverride({
      disputeId: parsed.data.disputeId,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    });
    switch (result.status) {
      case 'not_found':
        return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
      case 'noop':
        return NextResponse.json({ success: true, noop: true, status: result.disputeStatus });
      case 'payout_failed':
        return NextResponse.json({ error: 'A payout failed; the dispute is still open. Try again.' }, { status: 502 });
      case 'payout_unconfirmed':
        return NextResponse.json(
          {
            error:
              'A payout may have been sent but is not confirmed. The dispute stays open: reconcile via /api/admin/payouts/reconcile, then retry.',
          },
          { status: 202 }
        );
      case 'resolved':
        return NextResponse.json({ success: true, noop: false, status: result.outcome });
      default:
        return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Admin] governance error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
