import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTeamsApi, teamsErrorMessage } from '../../src/teams/use-teams-api';
import { Button, ErrorText, Field, Screen } from '../../src/ui/kit';

export default function NewTeam() {
  const teams = useTeamsApi();
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const team = await teams.createTeam(name.trim());
      router.replace({ pathname: '/teams/[id]', params: { id: team.id } });
    } catch (e) {
      setError(teamsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Field label="Team name" value={name} onChangeText={setName} maxLength={60} placeholder="Study group" />
      <ErrorText message={error} />
      <Button title="Create team" onPress={submit} loading={busy} disabled={!name.trim()} />
    </Screen>
  );
}
