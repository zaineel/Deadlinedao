import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import type { AppealableGoal, DashboardGoal, DisputeSummary } from '../api/disputes';
import { countdown } from '../goals/dashboard';
import { GoalStatusBadge } from './goal-status';
import { Card, colors } from './kit';

export function GoalCard({
  goal: g,
  now,
  dispute,
  quote,
}: {
  goal: DashboardGoal;
  now: number;
  dispute?: DisputeSummary;
  quote?: AppealableGoal;
}) {
  const router = useRouter();
  const left = g.status === 'rejected_appealable' ? countdown(g.appeal_deadline, now) : null;
  return (
    <Card onPress={() => router.push({ pathname: '/goals/[id]', params: { id: g.id } })}>
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
}
