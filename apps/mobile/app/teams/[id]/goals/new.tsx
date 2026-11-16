import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { TeamGoalCategory, validateTeamGoalForm } from '../../../../src/api/teams';
import { useTeamsApi, teamsErrorMessage } from '../../../../src/teams/use-teams-api';
import { Body, Button, ErrorText, Field, Screen } from '../../../../src/ui/kit';

const CATEGORIES: TeamGoalCategory[] = ['learning', 'work', 'health'];

function defaultDeadline(): string {
  return new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function NewTeamGoal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teams = useTeamsApi();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [stake, setStake] = useState('0.1');
  const [category, setCategory] = useState<TeamGoalCategory>('learning');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const form = validateTeamGoalForm({ teamId: id, title, description, category, deadline, stake });
    if (!form.ok) {
      setError(form.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await teams.createTeamGoal(form.value);
      router.back();
    } catch (e) {
      setError(teamsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={100} placeholder="Ship the demo" />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        maxLength={1000}
        multiline
        placeholder="What must each member do, and how will they prove it?"
        style={{ minHeight: 90 }}
      />
      <Field label="Deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} autoCapitalize="none" />
      <Field label="Stake per member (SOL)" value={stake} onChangeText={setStake} keyboardType="decimal-pad" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {CATEGORIES.map((c) => (
          <View key={c} style={{ flex: 1 }}>
            <Button title={c} variant={c === category ? 'primary' : 'secondary'} onPress={() => setCategory(c)} />
          </View>
        ))}
      </View>
      <Body muted>
        Rule: team first. Members who fail forfeit their stake into the team pool, which is split among teammates who
        completed. Each member stakes from their own wallet after you create the goal.
      </Body>
      <ErrorText message={error} />
      <Button title="Create team goal" onPress={submit} loading={busy} disabled={!title.trim() || !description.trim()} />
    </Screen>
  );
}
