import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/features';

export const dynamic = 'force-dynamic';

/** The whole /teams tree 404s unless FEATURE_TEAMS=true. */
export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabled('teams')) notFound();
  return <>{children}</>;
}
