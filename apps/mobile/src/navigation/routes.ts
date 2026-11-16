import type { Features } from '../features/features';

export type TabName = 'index' | 'goals' | 'teams' | 'orgs' | 'more';

export interface TabSpec {
  name: TabName;
  title: string;
  icon: 'home' | 'flag' | 'people' | 'briefcase' | 'person-circle';
}

export const ALL_TABS: TabSpec[] = [
  { name: 'index', title: 'Dashboard', icon: 'home' },
  { name: 'goals', title: 'Goals', icon: 'flag' },
  { name: 'teams', title: 'Teams', icon: 'people' },
  { name: 'orgs', title: 'Work', icon: 'briefcase' },
  { name: 'more', title: 'Profile', icon: 'person-circle' },
];

/** Whether a tab is shown. Teams/Work follow the server feature flags (hidden until flags load: fail closed). */
export function isTabVisible(name: TabName, features: Features | null): boolean {
  if (name === 'teams') return features?.teams === true;
  if (name === 'orgs') return features?.orgs === true;
  return true;
}

export function visibleTabs(features: Features | null): TabSpec[] {
  return ALL_TABS.filter((t) => isTabVisible(t.name, features));
}

/** Route targets used across the app (kept in one place so tab moves cannot silently break links). */
export const ROUTES = {
  dashboard: '/',
  goals: '/goals',
  newGoal: '/goals/new',
  teams: '/teams',
  orgs: '/orgs',
  more: '/more',
  settings: '/settings',
  governance: '/governance',
  onboarding: '/onboarding',
} as const;
