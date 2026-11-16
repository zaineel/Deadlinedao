import React, { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../src/auth/auth-context';
import { Body, Button, ErrorText, errorMessage, H1, Screen } from '../src/ui/kit';

export default function ConnectScreen() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ height: 80 }} />
      <H1>DeadlineDAO</H1>
      <Body muted>Stake SOL on your goals. Prove you did it. Get your stake back.</Body>
      <Body>
        Connect your Phantom wallet. You will be sent to Phantom to approve the connection, then asked to sign a free
        message to sign in. No transaction is sent.
      </Body>
      <ErrorText message={error} />
      <Button title="Connect Phantom" onPress={onConnect} loading={busy} />
    </Screen>
  );
}
