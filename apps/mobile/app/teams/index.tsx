import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import type { TeamSummary } from '../../src/api/teams';
import { useTeamsApi, teamsErrorMessage } from '../../src/teams/use-teams-api';
import { Body, Button, Card, colors, ErrorText } from '../../src/ui/kit';

export default function TeamsList() {
  const teams = useTeamsApi();
  const router = useRouter();
  const [list, setList] = useState<TeamSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setList(await teams.listTeams());
    } catch (e) {
      setError(teamsErrorMessage(e));
    }
  }, [teams]);

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
      <Button title="Create team" onPress={() => router.push('/teams/new')} />
      <Button title="Join with invite code" variant="secondary" onPress={() => router.push('/teams/join')} />
      <ErrorText message={error} />
      {list === null && !error && <Body muted>Loading teams...</Body>}
      {list?.length === 0 && <Body muted>You are not in a team yet. Create one or join with a code.</Body>}
      {list?.map((t) => (
        <Card key={t.id} onPress={() => router.push({ pathname: '/teams/[id]', params: { id: t.id } })}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{t.name}</Text>
          <Text style={{ color: colors.muted }}>
            {t.member_count} {t.member_count === 1 ? 'member' : 'members'}
          </Text>
        </Card>
      ))}
    </ScrollView>
  );
}
