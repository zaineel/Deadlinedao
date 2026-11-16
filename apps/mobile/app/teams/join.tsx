import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { isValidInviteCode, normalizeInviteCode } from '../../src/api/teams';
import { useTeamsApi, teamsErrorMessage } from '../../src/teams/use-teams-api';
import { Body, Button, ErrorText, Field, Screen } from '../../src/ui/kit';

export default function JoinTeam() {
  const teams = useTeamsApi();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(typeof params.code === 'string' ? params.code : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeInviteCode(code);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const joined = await teams.joinTeam(normalized);
      router.replace({ pathname: '/teams/[id]', params: { id: joined.teamId } });
    } catch (e) {
      setError(teamsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Body muted>Paste the 10-character invite code a teammate shared with you.</Body>
      <Field
        label="Invite code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="ABCDE-FGHJ2"
        accessibilityLabel="Team invite code"
      />
      <ErrorText message={error} />
      <Button title="Join team" onPress={submit} loading={busy} disabled={!isValidInviteCode(normalized)} />
    </Screen>
  );
}
