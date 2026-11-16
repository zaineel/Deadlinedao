import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import type { GoalCategory } from '../../src/api/types';
import { useAuth } from '../../src/auth/auth-context';
import { createAndStakeGoal } from '../../src/flows';
import { Body, Button, ErrorText, errorMessage, Field, Screen } from '../../src/ui/kit';

const CATEGORIES: GoalCategory[] = ['learning', 'work', 'health'];

function defaultDeadline(): string {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export default function NewGoal() {
  const { api, wallet, session } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [stake, setStake] = useState('0.1');
  const [category, setCategory] = useState<GoalCategory>('learning');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!session) return;
    const stakeAmount = Number(stake);
    // Treat a bare date as end of that day (local time) so "today" is not already past.
    const deadlineIso = new Date(`${deadline}T23:59:59`).toISOString();
    setBusy(true);
    setError(null);
    try {
      const { goalId } = await createAndStakeGoal(
        wallet,
        api,
        { title: title.trim(), description: description.trim(), deadline: deadlineIso, category, stakeAmount },
        session.wallet
      );
      router.replace({ pathname: '/goals/[id]', params: { id: goalId } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={100} placeholder="Ship the mobile app" />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        maxLength={1000}
        multiline
        placeholder="What exactly will you do, and how will you prove it?"
        style={{ minHeight: 90 }}
      />
      <Field label="Deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} autoCapitalize="none" />
      <Field label="Stake (SOL)" value={stake} onChangeText={setStake} keyboardType="decimal-pad" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {CATEGORIES.map((c) => (
          <View key={c} style={{ flex: 1 }}>
            <Button title={c} variant={c === category ? 'primary' : 'secondary'} onPress={() => setCategory(c)} />
          </View>
        ))}
      </View>
      <Body muted>
        Staking sends this amount of SOL to the DeadlineDAO escrow. Phantom will open to approve the transaction.
      </Body>
      <ErrorText message={error} />
      <Button
        title="Stake and create goal"
        onPress={submit}
        loading={busy}
        disabled={!title.trim() || !description.trim() || !(Number(stake) > 0)}
      />
    </Screen>
  );
}
