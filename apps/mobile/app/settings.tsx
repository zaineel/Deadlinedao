import React, { useState } from 'react';
import { useAuth } from '../src/auth/auth-context';
import { config } from '../src/config';
import { registerForPush, PushResult } from '../src/push/register';
import { Body, Button, Card, Screen } from '../src/ui/kit';

const PUSH_TEXT: Record<PushResult, string> = {
  registered: 'Notifications enabled.',
  unavailable: 'Notifications are not enabled on this server.',
  denied: 'Notification permission was denied. Enable it in iOS Settings.',
  unsupported: 'Notifications need a physical device.',
};

export default function Settings() {
  const { session, signOut, api, wallet } = useAuth();
  const [push, setPush] = useState<string | null>(null);

  return (
    <Screen>
      <Card>
        <Body muted>Wallet ({wallet.name})</Body>
        <Body>{session?.wallet}</Body>
        <Body muted>Server</Body>
        <Body>{config.apiUrl}</Body>
      </Card>
      <Button
        title="Enable push notifications"
        variant="secondary"
        onPress={async () => setPush(PUSH_TEXT[await registerForPush(api)])}
      />
      {push && <Body muted>{push}</Body>}
      <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
    </Screen>
  );
}
