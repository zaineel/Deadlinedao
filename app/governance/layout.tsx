import { notFound } from 'next/navigation';
import { isGovernanceEnabled } from '@/lib/governance/flag';

export const dynamic = 'force-dynamic';

/** The whole /governance tree 404s unless FEATURE_GOVERNANCE and FEATURE_DISPUTES are true. */
export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  if (!isGovernanceEnabled()) notFound();
  return <>{children}</>;
}
