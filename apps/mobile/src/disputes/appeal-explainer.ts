import type { GovernanceParams } from '../api/governance';

type PanelParams = Partial<Pick<GovernanceParams, 'panelSize' | 'quorum' | 'votingWindowHours'>> | null | undefined;

/** Documented defaults (lib/governance/params.ts) used when the server does not tell us. */
export const DEFAULT_PANEL = { panelSize: 5, quorum: 3, votingWindowHours: 48 };

export function formatWindow(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const d = hours / 24;
    return d === 1 ? '1 day' : `${d} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** Plain-language "how your appeal is judged", shown BEFORE the user signs the bond. */
export function appealExplainer(params: PanelParams, panelEnabled = true): string[] {
  const p = { ...DEFAULT_PANEL, ...(params ?? {}) };
  if (!panelEnabled) {
    return [
      'An administrator reviews your appeal and decides.',
      'Overturned: your goal is marked completed, your stake is returned and your bond is refunded.',
      'Upheld: the rejection stands and your bond is forfeited.',
    ];
  }
  return [
    `A random panel of ${p.panelSize} eligible past winners reviews your proof and the AI's reasoning.`,
    `Each votes overturn or uphold within ${formatWindow(p.votingWindowHours)}. The majority decides (at least ${p.quorum} votes are needed).`,
    'Votes are sealed: nobody, including you, sees them until the dispute is resolved.',
    'An administrator can override the panel, for example after a tie.',
    'Overturned: your goal is marked completed, your stake is returned and your bond is refunded.',
    'Upheld: the rejection stands and your bond is forfeited.',
  ];
}

export interface DisputeProgress {
  headline: string;
  details: string[];
}

/** What the status screen can honestly say. The server does not expose votes or tallies for open disputes. */
export function disputeProgress(status: 'open' | 'overturned' | 'upheld', params: PanelParams, panelEnabled = true): DisputeProgress {
  const p = { ...DEFAULT_PANEL, ...(params ?? {}) };
  if (status === 'overturned') {
    return { headline: 'Overturned: your goal was marked completed', details: ['Your stake was returned and your bond refunded.'] };
  }
  if (status === 'upheld') {
    return { headline: 'Upheld: the rejection stands', details: ['Your bond was forfeited and stays in escrow.'] };
  }
  if (!panelEnabled) {
    return { headline: 'Under review by an administrator', details: ['You will be notified when it is resolved.'] };
  }
  return {
    headline: 'Under review by a panel',
    details: [
      `A panel of ${p.panelSize} is drawn shortly after you appeal, then has ${formatWindow(p.votingWindowHours)} to vote.`,
      'Votes stay sealed until the decision. If too few eligible voters exist or the vote ties, an administrator decides.',
      'You will be notified when it is resolved.',
    ],
  };
}
