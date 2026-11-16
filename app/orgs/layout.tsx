import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/features';

export const dynamic = 'force-dynamic';

/** The whole /orgs tree 404s unless FEATURE_ORGS=true. */
export default function OrgsLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabled('orgs')) notFound();
  return <>{children}</>;
}
