import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { isValidOrgInviteCode } from '../../src/api/orgs';
import { useOrgsApi, orgsErrorMessage } from '../../src/orgs/use-orgs-api';
import { Body, Button, ErrorText, Field, Screen } from '../../src/ui/kit';

export default function JoinOrg() {
  const orgs = useOrgsApi();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(typeof params.code === 'string' ? params.code : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const joined = await orgs.joinOrg(code.trim());
      router.replace({ pathname: '/orgs/[id]', params: { id: joined.orgId } });
    } catch (e) {
      setError(orgsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Body muted>Enter the invite code from your employer.</Body>
      <Field
        label="Invite code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Organization invite code"
      />
      <Body muted>
        Joining shares nothing. Anonymous group statistics stay OFF until you turn them on yourself, and you can turn
        them off again any time. Matching applies to goals you create after joining.
      </Body>
      <ErrorText message={error} />
      <Button title="Join organization" onPress={submit} loading={busy} disabled={!isValidOrgInviteCode(code)} />
    </Screen>
  );
}
