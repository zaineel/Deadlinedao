import { describe, expect, it } from 'vitest';
import type { Assignment } from '../src/api/governance';
import type { DashboardGoal } from '../src/api/disputes';
import { appealExplainer, disputeProgress, formatWindow } from '../src/disputes/appeal-explainer';
import { NO_FEATURES, type Features } from '../src/features/features';
import { filterGoals, matchesFilter } from '../src/goals/filters';
import { pendingAssignments, pendingBannerText } from '../src/governance/pending';
import { ALL_TABS, isTabVisible, ROUTES, visibleTabs } from '../src/navigation/routes';
import {
  clampStep,
  entryFor,
  guardsFor,
  INTRO_STEPS,
  isLastStep,
  parseOnboardingDone,
  PHANTOM_APP_STORE_URL,
} from '../src/onboarding/logic';

const F: Features = { ...NO_FEATURES, teams: true, orgs: true, governance: true };

describe('entry / guards', () => {
  it('first run goes to onboarding, then connect, then app', () => {
    expect(entryFor({ onboardingDone: false, signedIn: false })).toBe('onboarding');
    expect(entryFor({ onboardingDone: true, signedIn: false })).toBe('connect');
    expect(entryFor({ onboardingDone: true, signedIn: true })).toBe('app');
    expect(entryFor({ onboardingDone: false, signedIn: true })).toBe('app');
  });
  it('guards are consistent with the entry and never show the intro to returning signed-out users', () => {
    expect(guardsFor({ onboardingDone: false, signedIn: false })).toEqual({ onboarding: true, connect: false, app: false });
    expect(guardsFor({ onboardingDone: true, signedIn: false })).toEqual({ onboarding: false, connect: true, app: false });
    // signed in: intro stays reachable for "Show intro again"
    expect(guardsFor({ onboardingDone: true, signedIn: true })).toEqual({ onboarding: true, connect: false, app: true });
  });
  it('parses the stored flag strictly', () => {
    expect(parseOnboardingDone('done')).toBe(true);
    expect(parseOnboardingDone(null)).toBe(false);
    expect(parseOnboardingDone('true')).toBe(false);
  });
  it('intro has 4 steps covering the required content and a Phantom store link', () => {
    expect(INTRO_STEPS.map((s) => s.id)).toEqual(['what', 'proof', 'wallet', 'start']);
    const wallet = INTRO_STEPS.find((s) => s.id === 'wallet')!.body.join(' ');
    expect(wallet).toMatch(/Testnet Mode/);
    expect(wallet).toMatch(/no real money/);
    expect(PHANTOM_APP_STORE_URL).toMatch(/^https:\/\/apps\.apple\.com\//);
    expect(isLastStep(2)).toBe(false);
    expect(isLastStep(3)).toBe(true);
    expect(clampStep(-4)).toBe(0);
    expect(clampStep(99)).toBe(3);
    expect(clampStep(Number.NaN)).toBe(0);
  });
});

describe('tabs', () => {
  it('always shows Dashboard, Goals and Profile; Teams / Work follow flags (fail closed)', () => {
    expect(visibleTabs(null).map((t) => t.name)).toEqual(['index', 'goals', 'more']);
    expect(visibleTabs(F).map((t) => t.name)).toEqual(['index', 'goals', 'teams', 'orgs', 'more']);
    expect(isTabVisible('teams', { ...F, teams: false })).toBe(false);
    expect(isTabVisible('orgs', { ...F, orgs: false })).toBe(false);
  });
  it('labels the orgs tab "Work" and has no governance tab or route entry in the tab set', () => {
    expect(ALL_TABS.find((t) => t.name === 'orgs')?.title).toBe('Work');
    expect(ALL_TABS.some((t) => /governance/i.test(t.name + t.title))).toBe(false);
    expect(ROUTES.dashboard).toBe('/');
  });
});

function goal(status: DashboardGoal['status'], deadline: string, id = status + deadline): DashboardGoal {
  return { id, status, deadline } as unknown as DashboardGoal;
}

describe('goal filters', () => {
  const goals = [
    goal('completed', '2026-01-03T00:00:00Z'),
    goal('active', '2026-03-01T00:00:00Z'),
    goal('active', '2026-02-01T00:00:00Z'),
    goal('failed', '2026-01-01T00:00:00Z'),
    goal('rejected_appealable', '2026-01-15T00:00:00Z'),
    goal('disputed', '2026-01-16T00:00:00Z'),
  ];
  it('Active includes unsettled review/appeal states, ordered by nearest deadline', () => {
    const a = filterGoals(goals, 'active');
    expect(a.map((g) => g.status)).toEqual(['rejected_appealable', 'disputed', 'active', 'active']);
    expect(a[2].deadline < a[3].deadline).toBe(true);
  });
  it('Completed / Failed / All', () => {
    expect(filterGoals(goals, 'completed')).toHaveLength(1);
    expect(filterGoals(goals, 'failed')).toHaveLength(1);
    expect(filterGoals(goals, 'all')).toHaveLength(6);
    expect(matchesFilter({ status: 'pending_validation' }, 'active')).toBe(true);
  });
});

function assignment(over: Partial<Assignment>): Assignment {
  return {
    disputeId: 'd',
    state: 'voting',
    votingEndsAt: '2099-01-01T00:00:00Z',
    owner: 'Anon',
    goal: { title: '', description: '' },
    appeal: { reason: '', extraImageUrl: null },
    proof: null,
    myVote: null,
    result: null,
    ...over,
  };
}

describe('pending panel banner', () => {
  const now = Date.now();
  it('counts only assignments the user can still vote on', () => {
    const list = [
      assignment({ disputeId: '1' }),
      assignment({ disputeId: '2', myVote: 'uphold' }),
      assignment({ disputeId: '3', state: 'resolved' }),
      assignment({ disputeId: '4', votingEndsAt: '2000-01-01T00:00:00Z' }),
    ];
    expect(pendingAssignments(list, now).map((a) => a.disputeId)).toEqual(['1']);
  });
  it('has no banner text without assignments and never mentions votes content', () => {
    expect(pendingBannerText(0)).toBeNull();
    expect(pendingBannerText(1)).toMatch(/selected to review/);
    expect(pendingBannerText(3)).toMatch(/3 appeals/);
  });
});

describe('appeal explainer', () => {
  it('uses documented defaults when the server gives no params', () => {
    const t = appealExplainer(null).join(' ');
    expect(t).toMatch(/panel of 5/);
    expect(t).toMatch(/48 hours|2 days/);
    expect(t).toMatch(/sealed/);
    expect(t).toMatch(/administrator can override/);
    expect(t).toMatch(/refunded/);
    expect(t).toMatch(/forfeited/);
  });
  it('uses server params when present', () => {
    const t = appealExplainer({ panelSize: 7, quorum: 4, votingWindowHours: 72 }).join(' ');
    expect(t).toMatch(/panel of 7/);
    expect(t).toMatch(/3 days/);
    expect(t).toMatch(/at least 4 votes/);
  });
  it('falls back to an admin-only description when the panel is off', () => {
    expect(appealExplainer(null, false).join(' ')).not.toMatch(/panel of/);
  });
  it('formats windows', () => {
    expect(formatWindow(24)).toBe('1 day');
    expect(formatWindow(36)).toBe('36 hours');
    expect(formatWindow(1)).toBe('1 hour');
  });
  it('dispute progress never claims vote counts', () => {
    const open = disputeProgress('open', null);
    expect(open.headline).toMatch(/panel/);
    expect(open.details.join(' ')).toMatch(/sealed/);
    expect(disputeProgress('open', null, false).headline).toMatch(/administrator/);
    expect(disputeProgress('overturned', null).headline).toMatch(/Overturned/);
    expect(disputeProgress('upheld', null).details.join(' ')).toMatch(/forfeited/);
  });
});
