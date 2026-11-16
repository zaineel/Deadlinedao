import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { ApiClient } from '../api/client';
import { fetchFeatures } from '../features/features';

export type PushResult = 'registered' | 'unavailable' | 'denied' | 'unsupported';

/** Expo Go (SDK 53+) removed remote push; importing expo-notifications there only logs errors. */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * Ask for notification permission, get an Expo push token and send it to the
 * backend. A safe no-op ('unavailable') when the server's push feature flag is
 * off and ('unsupported') in Expo Go, simulators or on any error: push is a
 * nicety and must never break sign-in. The native modules are loaded lazily so
 * Expo Go never touches them.
 */
export async function registerForPush(api: ApiClient): Promise<PushResult> {
  try {
    if (isExpoGo()) return 'unsupported';
    const features = await fetchFeatures(api);
    if (!features.push) return 'unavailable';

    const Device = await import('expo-device');
    if (!Device.isDevice) return 'unsupported'; // simulators cannot receive remote push
    const Notifications = await import('expo-notifications');
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const res = await api.registerPush({ token, platform: 'ios' });
    return res.available ? 'registered' : 'unavailable';
  } catch {
    return 'unsupported';
  }
}
