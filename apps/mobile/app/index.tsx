import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { Goal } from '../src/api/types';
import { useAuth } from '../src/auth/auth-context';
import { Body, Button, Card, colors, ErrorText, errorMessage, StatusBadge } from '../src/ui/kit';

export default function Dashboard() {
  const { api, session } = useAuth();
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      setGoals(await api.getGoals(session.wallet));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api, session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 12 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Button title="New goal" onPress={() => router.push('/goals/new')} />
      <ErrorText message={error} />
      {goals?.length === 0 && <Body muted>No goals yet. Stake your first one.</Body>}
      {goals?.map((g) => (
        <Card key={g.id} onPress={() => router.push({ pathname: '/goals/[id]', params: { id: g.id } })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <StatusBadge status={g.status} />
            <Text style={{ color: colors.muted }}>{g.stake_amount} SOL</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{g.title}</Text>
          <Text style={{ color: colors.muted }}>Due {new Date(g.deadline).toLocaleDateString()}</Text>
        </Card>
      ))}
      <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
    </ScrollView>
  );
}
