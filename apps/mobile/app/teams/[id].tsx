import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { buildLeaderboard, shortWallet, stakeActionFor, stakeOnTeamGoal, TeamDetail } from '../../src/api/teams';
import { useAuth } from '../../src/auth/auth-context';
import { useTeamsApi, teamsErrorMessage } from '../../src/teams/use-teams-api';
import { Body, Button, Card, colors, ErrorText, errorMessage } from '../../src/ui/kit';

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wallet, session } = useAuth();
  const teams = useTeamsApi();
  const router = useRouter();
  const [data, setData] = useState<TeamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [staking, setStaking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await teams.getTeam(id));
    } catch (e) {
      setError(teamsErrorMessage(e));
    }
  }, [teams, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const stake = async (teamGoalId: string) => {
    setStaking(teamGoalId);
    setError(null);
    try {
      await stakeOnTeamGoal(wallet, teams, teamGoalId);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStaking(null);
    }
  };

  const board = useMemo(() => (data ? buildLeaderboard(data) : []), [data]);
  const me = session?.wallet ?? '';

  const shareInvite = async () => {
    if (!data) return;
    const code = data.team.invite_code;
    const link = Linking.createURL('teams/join', { queryParams: { code } });
    try {
      await Share.share({ message: `Join my team "${data.team.name}" on DeadlineDAO. Invite code: ${code}\n${link}` });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 14 }}
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
      <ErrorText message={error} />
      {!data && !error && <Body muted>Loading team...</Body>}
      {data && (
        <>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{data.team.name}</Text>
          <Card>
            <Text style={{ color: colors.muted }}>Invite code</Text>
            <Text selectable style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: 2 }}>
              {data.team.invite_code}
            </Text>
            <Button title="Share invite" variant="secondary" onPress={shareInvite} />
          </Card>

          {data.isOwner && (
            <Button
              title="New team goal"
              onPress={() => router.push({ pathname: '/teams/[id]/goals/new', params: { id: data.team.id } })}
            />
          )}

          {data.goals.length === 0 && <Body muted>No team goals yet.</Body>}
          {data.goals.map((g) => {
            const action = stakeActionFor(g, me);
            const pct = g.progress.total ? (g.progress.completed / g.progress.total) * 100 : 0;
            return (
              <Card key={g.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', flex: 1 }}>{g.title}</Text>
                  <Text style={{ color: g.status === 'open' ? colors.primary : colors.muted }}>{g.status}</Text>
                </View>
                <Text style={{ color: colors.muted }}>
                  {g.stake_per_member} SOL each, due {new Date(g.deadline).toLocaleString()}
                </Text>
                <Body>{g.description}</Body>
                <View
                  accessible
                  accessibilityLabel={`${g.progress.completed} of ${g.progress.total} members completed`}
                  style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}
                >
                  <View style={{ height: 8, width: `${pct}%`, backgroundColor: colors.ok }} />
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {g.progress.completed} of {g.progress.total} completed, {g.progress.staked} staked
                </Text>
                {g.progress.members.map((m) => (
                  <View key={m.wallet} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.text }}>
                      {shortWallet(m.wallet)}
                      {m.wallet === me ? ' (you)' : ''}
                    </Text>
                    <Text style={{ color: colors.muted }}>{m.status.replace('_', ' ')}</Text>
                  </View>
                ))}
                {action && (
                  <Button
                    title={action === 'finish' ? 'Finish staking' : `Stake ${g.stake_per_member} SOL`}
                    onPress={() => stake(g.id)}
                    loading={staking === g.id}
                    disabled={staking !== null}
                  />
                )}
                {action && <Body muted>Phantom will open to approve the stake transfer to escrow.</Body>}
                {g.myGoalId && (
                  <Button
                    title="Open my goal"
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/goals/[id]', params: { id: g.myGoalId as string } })}
                  />
                )}
              </Card>
            );
          })}

          <Card>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>Leaderboard</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Team goals completed</Text>
            {board.map((row, i) => (
              <View key={row.wallet} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>
                  {i + 1}. {shortWallet(row.wallet)}
                  {row.wallet === me ? ' (you)' : ''}
                </Text>
                <Text style={{ color: colors.muted }}>{row.completed}</Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}
