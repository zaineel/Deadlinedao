import * as SecureStore from 'expo-secure-store';
import { ONBOARDING_KEY, parseOnboardingDone } from './logic';

/** "Onboarding completed" flag (per install, kept in SecureStore like the session). Fails to "not done". */
export async function loadOnboardingDone(): Promise<boolean> {
  try {
    return parseOnboardingDone(await SecureStore.getItemAsync(ONBOARDING_KEY));
  } catch {
    return false;
  }
}

export async function saveOnboardingDone(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ONBOARDING_KEY, 'done');
  } catch {
    // Non-fatal: the in-memory flag still applies for this launch.
  }
}
