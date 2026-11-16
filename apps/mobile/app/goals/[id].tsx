import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Share, Text, View } from 'react-native';
import type { Goal } from '../../src/api/types';
import { useAuth } from '../../src/auth/auth-context';
import { Body, Button, Card, colors, ErrorText, errorMessage, H1, Screen, StatusBadge } from '../../src/ui/kit';

export default function GoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .getGoal(id)
        .then(setGoal)
        .catch((e) => setError(errorMessage(e)));
    }, [api, id])
  );

  const share = async () => {
    setNotice(null);
    try {
      // Capability check: the share endpoint ships in the mobile-backend PR; tolerate 404.
      const res = await api.shareGoal(id);
      if (!res.available) {
        setNotice('Sharing is not available on this server yet.');
        return;
      }
      const url = res.data.url;
      const message = res.data.message ?? `I staked on my goal "${goal?.title}" on DeadlineDAO.`;
      await Share.share({ message: url ? `${message} ${url}` : message, url });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!goal) {
    return (
      <Screen>
        <ErrorText message={error} />
      </Screen>
    );
  }

  return (
    <Screen>
      <StatusBadge status={goal.status} />
      <H1>{goal.title}</H1>
      <Body>{goal.description}</Body>
      <Card>
        <Row k="Stake" v={`${goal.stake_amount} SOL`} />
        <Row k="Deadline" v={new Date(goal.deadline).toLocaleString()} />
        <Row k="Category" v={goal.category} />
      </Card>
      <ErrorText message={error} />
      {notice && <Body muted>{notice}</Body>}
      {goal.status === 'active' && (
        <Button title="Submit proof" onPress={() => router.push({ pathname: '/proof/[id]', params: { id: goal.id } })} />
      )}
      <Button title="Share" variant="secondary" onPress={share} />
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: colors.muted }}>{k}</Text>
      <Text style={{ color: colors.text }}>{v}</Text>
    </View>
  );
}
