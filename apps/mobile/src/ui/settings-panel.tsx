import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { config } from '../config';
import { PushResult, registerForPush } from '../push/register';
import { Body, Button, Card } from './kit';

const PUSH_TEXT: Record<PushResult, string> = {
  registered: 'Notifications enabled.',
  unavailable: 'Notifications are not enabled on this server.',
  denied: 'Notification permission was denied. Enable it in iOS Settings.',
  unsupported: 'Notifications need a physical device.',
};

/** Wallet, server, app version, push preference, intro replay and sign out. Used by Profile and Settings. */
export function SettingsPanel() {
  const { session, signOut, api, wallet } = useAuth();
  const router = useRouter();
  const [push, setPush] = useState<string | null>(null);
  const version = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <>
      <Card>
        <Body muted>Wallet ({wallet.name})</Body>
        <Body>{session?.wallet}</Body>
        <Body muted>Server</Body>
        <Body>{config.apiUrl}</Body>
        <Body muted>App version</Body>
        <Body>{version}</Body>
      </Card>
      <Button
        title="Enable push notifications"
        variant="secondary"
        onPress={async () => setPush(PUSH_TEXT[await registerForPush(api)])}
      />
      {push && <Body muted>{push}</Body>}
      <Button title="Show intro again" variant="secondary" onPress={() => router.push('/onboarding')} />
      <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
    </>
  );
}
