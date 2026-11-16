import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { DashboardGoal } from '../src/api/disputes';
import { useAuth } from '../src/auth/auth-context';
import { useDisputesApi, useDisputesData } from '../src/disputes/use-disputes';
import { useFeatures } from '../src/features/use-features';
import { computeStats, countdown } from '../src/goals/dashboard';
import { registerForPush } from '../src/push/register';
import { Body, Button, Card, colors, ErrorText, errorMessage } from '../src/ui/kit';
import { GoalStatusBadge } from '../src/ui/goal-status';

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14 }}
    >
      <Text style={{ color: color ?? colors.text, fontSize: 24, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

export default function Dashboard() {
  const { api, session } = useAuth();
  const goalsApi = useDisputesApi();
  const router = useRouter();
  const { features } = useFeatures();
  const disputes = useDisputesData();
  const [goals, setGoals] = useState<DashboardGoal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      setGoals(await goalsApi.goals(session.wallet));
    } catch (e) {
      setError(errorMessage(e));
    }
    setNow(Date.now());
  }, [goalsApi, session]);

  const disputesOn = features?.disputes === true;
  const reloadDisputes = disputes.reload;
  useFocusEffect(
    useCallback(() => {
      void load();
      if (disputesOn) void reloadDisputes();
    }, [load, disputesOn, reloadDisputes])
  );

  // Register for push once the server says it is on (no-op in Expo Go).
  const pushOn = features?.push === true;
  useEffect(() => {
    if (pushOn) void registerForPush(api);
  }, [pushOn, api]);

  const stats = goals ? computeStats(goals) : null;
  const disputeFor = (id: string) => disputes.data?.disputes.find((d) => d.goalId === id);
  const quoteFor = (id: string) => disputes.data?.appealable.find((a) => a.goalId === id);

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
            await Promise.all([load(), disputesOn ? reloadDisputes() : Promise.resolve()]);
            setRefreshing(false);
          }}
        />
      }
    >
      <Button title="New goal" onPress={() => router.push('/goals/new')} />
      <ErrorText message={error} />

      {stats && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat label="Active" value={String(stats.active)} color={colors.primary} />
          <Stat label="Completed" value={String(stats.completed)} color={colors.ok} />
          <Stat label="Failed" value={String(stats.failed)} color={colors.danger} />
          <Stat label="At stake (SOL)" value={String(stats.totalStaked)} />
        </View>
      )}

      {features && (features.teams || features.orgs || features.governance) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {features.teams && <Button title="Teams" variant="secondary" onPress={() => router.push('/teams')} />}
          {features.orgs && <Button title="Organizations" variant="secondary" onPress={() => router.push('/orgs')} />}
          {features.governance && (
            <Button title="Governance" variant="secondary" onPress={() => router.push('/governance')} />
          )}
        </View>
      )}

      {goals?.length === 0 && <Body muted>No goals yet. Stake your first one.</Body>}
      {goals?.map((g) => {
        const dispute = disputeFor(g.id);
        const quote = quoteFor(g.id);
        const left = g.status === 'rejected_appealable' ? countdown(g.appeal_deadline, now) : null;
        return (
          <Card key={g.id} onPress={() => router.push({ pathname: '/goals/[id]', params: { id: g.id } })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <GoalStatusBadge status={g.status} />
              <Text style={{ color: colors.muted }}>{g.stake_amount} SOL</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{g.title}</Text>
            <Text style={{ color: colors.muted }}>Due {new Date(g.deadline).toLocaleDateString()}</Text>
            {g.status === 'active' && countdown(g.deadline, now) && (
              <Text style={{ color: colors.muted }}>{countdown(g.deadline, now)}</Text>
            )}
            {g.status === 'pending_validation' && <Text style={{ color: colors.warn }}>Validating your proof...</Text>}
            {g.status === 'rejected_appealable' && (
              <Text style={{ color: colors.warn }}>
                Appeal window: {left ?? 'unknown'}
                {quote ? ` - bond ${quote.bondAmount} SOL` : ''}
              </Text>
            )}
            {dispute && (
              <Text style={{ color: colors.muted }}>
                Appeal {dispute.status === 'open' ? 'under review' : dispute.status} (bond {dispute.bondAmount} SOL)
              </Text>
            )}
          </Card>
        );
      })}
      {disputes.error && <ErrorText message={disputes.error} />}
      <Button title="More" variant="secondary" onPress={() => router.push('/more')} />
    </ScrollView>
  );
}
