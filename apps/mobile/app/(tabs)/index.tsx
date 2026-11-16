import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/auth-context';
import { computeStats } from '../../src/goals/dashboard';
import { useGoalsData } from '../../src/goals/use-goals';
import { pendingBannerText } from '../../src/governance/pending';
import { usePendingPanel } from '../../src/governance/use-pending-panel';
import { registerForPush } from '../../src/push/register';
import { GoalCard } from '../../src/ui/goal-card';
import { Body, Button, Card, colors, ErrorText } from '../../src/ui/kit';

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

const CHECKLIST = [
  'Fund your wallet with devnet SOL (free test SOL, no real money).',
  'Create a goal and stake a little SOL on it.',
  'Submit proof before the deadline and get your stake back.',
];

function FirstGoalEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Welcome! Let's set your first goal</Text>
      <Body muted>Nothing is at stake yet. Here is how it works:</Body>
      {CHECKLIST.map((t, i) => (
        <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View
            style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{i + 1}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, flex: 1 }}>{t}</Text>
        </View>
      ))}
      <Button title="Create your first goal" onPress={onCreate} />
    </Card>
  );
}

export default function Dashboard() {
  const { api } = useAuth();
  const router = useRouter();
  const [govOn, setGovOn] = React.useState(false);
  const panel = usePendingPanel(govOn);
  const d = useGoalsData(panel.reload);

  useEffect(() => {
    setGovOn(d.features?.governance === true);
  }, [d.features?.governance]);
  const reloadPanel = panel.reload;
  useEffect(() => {
    void reloadPanel();
  }, [reloadPanel]);

  // Register for push once the server says it is on (no-op in Expo Go).
  const pushOn = d.features?.push === true;
  useEffect(() => {
    if (pushOn) void registerForPush(api);
  }, [pushOn, api]);

  const stats = d.goals ? computeStats(d.goals) : null;
  const banner = pendingBannerText(panel.count);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 12 }}
      refreshControl={<RefreshControl refreshing={d.refreshing} tintColor={colors.primary} onRefresh={d.refresh} />}
    >
      {banner && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Review the appeal you were selected for"
          onPress={() => router.push('/governance')}
          style={{ backgroundColor: colors.card, borderColor: colors.warn, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 }}
        >
          <Text style={{ color: colors.warn, fontWeight: '700' }}>You were selected to review a dispute</Text>
          <Text style={{ color: colors.text }}>{banner}</Text>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Open voting</Text>
        </Pressable>
      )}
      <ErrorText message={d.error} />

      {d.goals?.length === 0 && <FirstGoalEmptyState onCreate={() => router.push('/goals/new')} />}

      {stats && d.goals && d.goals.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Stat label="Active" value={String(stats.active)} color={colors.primary} />
            <Stat label="Completed" value={String(stats.completed)} color={colors.ok} />
            <Stat label="Failed" value={String(stats.failed)} color={colors.danger} />
            <Stat label="At stake (SOL)" value={String(stats.totalStaked)} />
          </View>
          <Button title="New goal" onPress={() => router.push('/goals/new')} />
          {d.goals.map((g) => (
            <GoalCard key={g.id} goal={g} now={d.now} dispute={d.disputeFor(g.id)} quote={d.quoteFor(g.id)} />
          ))}
        </>
      )}
      {d.disputesError && <ErrorText message={d.disputesError} />}
    </ScrollView>
  );
}
