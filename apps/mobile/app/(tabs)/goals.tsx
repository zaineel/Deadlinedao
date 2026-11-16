import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { filterGoals, GOAL_FILTERS, GoalFilter } from '../../src/goals/filters';
import { useGoalsData } from '../../src/goals/use-goals';
import { GoalCard } from '../../src/ui/goal-card';
import { Body, Button, colors, ErrorText } from '../../src/ui/kit';

const EMPTY: Record<GoalFilter, string> = {
  active: 'No active goals.',
  completed: 'No completed goals yet.',
  failed: 'No failed goals. Keep it that way!',
  all: 'No goals yet. Create your first one.',
};

export default function GoalsTab() {
  const router = useRouter();
  const d = useGoalsData();
  const [filter, setFilter] = useState<GoalFilter>('active');
  const list = d.goals ? filterGoals(d.goals, filter) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 12 }}
      refreshControl={<RefreshControl refreshing={d.refreshing} tintColor={colors.primary} onRefresh={d.refresh} />}
    >
      <Button title="New goal" onPress={() => router.push('/goals/new')} />
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
        {GOAL_FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f.key)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: on ? colors.primary : colors.border,
                backgroundColor: on ? colors.primary : colors.card,
              }}
            >
              <Text style={{ color: on ? '#fff' : colors.muted, fontWeight: '600', fontSize: 13 }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ErrorText message={d.error} />
      {list === null && !d.error && <Body muted>Loading goals...</Body>}
      {list?.length === 0 && <Body muted>{EMPTY[filter]}</Body>}
      {list?.map((g) => (
        <GoalCard key={g.id} goal={g} now={d.now} dispute={d.disputeFor(g.id)} quote={d.quoteFor(g.id)} />
      ))}
    </ScrollView>
  );
}
