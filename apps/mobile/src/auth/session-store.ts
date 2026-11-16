import * as SecureStore from 'expo-secure-store';
import { isSessionExpired, StoredSession } from './session';

const KEY = 'dd.session.v1';

/** Session token lives in the iOS Keychain via expo-secure-store. */
export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s.token || !s.wallet || isSessionExpired(s)) {
      await SecureStore.deleteItemAsync(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export async function saveSession(s: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
