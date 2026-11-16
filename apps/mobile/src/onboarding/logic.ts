export type Entry = 'onboarding' | 'connect' | 'app';

export interface EntryState {
  onboardingDone: boolean;
  signedIn: boolean;
}

/** Which top-level experience to show. Signed-in always wins; first-run users see the intro before Connect. */
export function entryFor({ onboardingDone, signedIn }: EntryState): Entry {
  if (signedIn) return 'app';
  return onboardingDone ? 'connect' : 'onboarding';
}

/**
 * Stack.Protected guards. The intro stays reachable while signed in so Settings can replay it,
 * but a signed-out user who already finished it can never land on it again.
 */
export function guardsFor({ onboardingDone, signedIn }: EntryState) {
  return {
    onboarding: signedIn || !onboardingDone,
    connect: !signedIn && onboardingDone,
    app: signedIn,
  };
}

export const ONBOARDING_KEY = 'dd.onboarding.v1';

export function parseOnboardingDone(raw: string | null | undefined): boolean {
  return raw === 'done';
}

export interface IntroStep {
  id: 'what' | 'proof' | 'wallet' | 'start';
  icon: 'flag' | 'shield-checkmark' | 'wallet' | 'rocket';
  title: string;
  body: string[];
}

export const INTRO_STEPS: IntroStep[] = [
  {
    id: 'what',
    icon: 'flag',
    title: 'Put SOL behind your goals',
    body: [
      'Stake SOL on a goal with a deadline.',
      'Prove you did it and you get your stake back.',
      'If you miss, your stake goes to the people who delivered.',
    ],
  },
  {
    id: 'proof',
    icon: 'shield-checkmark',
    title: 'Proof is checked by AI',
    body: [
      'Submit a photo or a short description when you are done.',
      'An AI reviews it within moments.',
      'Think it got it wrong? You can appeal and a panel of people decides.',
    ],
  },
  {
    id: 'wallet',
    icon: 'wallet',
    title: 'You need a Phantom wallet',
    body: [
      'DeadlineDAO runs on Solana devnet: test SOL only, no real money.',
      'Install Phantom, then turn on Testnet Mode in Phantom (Settings, Developer Settings) and pick Solana Devnet.',
    ],
  },
  {
    id: 'start',
    icon: 'rocket',
    title: 'Ready to go',
    body: ['Connect your wallet, create your first goal and stake a little devnet SOL.'],
  },
];

export const PHANTOM_APP_STORE_URL = 'https://apps.apple.com/app/phantom-crypto-wallet/id1598432977';

export function isLastStep(i: number): boolean {
  return i >= INTRO_STEPS.length - 1;
}
export function clampStep(i: number): number {
  return Math.min(Math.max(0, Math.trunc(i) || 0), INTRO_STEPS.length - 1);
}
