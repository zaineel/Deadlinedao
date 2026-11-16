import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireSession } from '@/lib/auth/session';
import { parseValue, uuidSchema } from '@/lib/validation/schemas';
import { getOrg, type OrgRow } from './db';
import { isOrgAdmin } from './funding';

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export type OrgContext =
  | { ok: true; wallet: string; org: OrgRow; orgId: string }
  | { ok: false; response: Response };

/**
 * Common guard for /api/orgs/[id]/* routes: flag -> session -> valid id -> org
 * exists. When `requireAdmin` is set, a non-admin gets the same 404 as a
 * missing org so org ids cannot be probed.
 */
export async function orgRouteGuard(
  request: NextRequest,
  rawId: string,
  opts: { requireAdmin: boolean }
): Promise<OrgContext> {
  const disabled = featureDisabledResponse('orgs');
  if (disabled) return { ok: false, response: disabled };

  const session = requireSession(request);
  if (!session.ok) return { ok: false, response: session.response };

  const id = parseValue(rawId, uuidSchema);
  if (!id.ok) return { ok: false, response: id.response };

  const { data: org, error } = await getOrg(id.data);
  if (error) {
    console.error('orgRouteGuard: failed to load org:', error);
    return { ok: false, response: NextResponse.json({ error: 'Request failed' }, { status: 500 }) };
  }
  if (!org) return { ok: false, response: notFound() };
  if (opts.requireAdmin && !isOrgAdmin(org.admin_wallets, session.wallet)) {
    return { ok: false, response: notFound() };
  }
  return { ok: true, wallet: session.wallet, org, orgId: org.id };
}

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Fails closed if unset. */
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
