import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { ApiClient } from '../api/client';

export type PushResult = 'registered' | 'unavailable' | 'denied' | 'unsupported';

/**
 * Ask for notification permission, get an Expo push token and send it to the
 * backend. Returns 'unavailable' when the server has FEATURE_PUSH off (404).
 * Never throws: push is a nicety and must not break sign-in.
 */
export async function registerForPush(api: ApiClient): Promise<PushResult> {
  try {
    if (!Device.isDevice) return 'unsupported'; // simulators cannot receive remote push
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
