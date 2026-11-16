import React from 'react';
import { Text, View } from 'react-native';
import type { FullGoalStatus } from '../api/disputes';
import { STATUS_LABEL } from '../goals/dashboard';
import { colors } from './kit';

const COLOR: Record<FullGoalStatus, string> = {
  active: colors.primary,
  pending_validation: colors.warn,
  completed: colors.ok,
  failed: colors.danger,
  rejected_appealable: colors.warn,
  disputed: '#b48cff',
};

export function GoalStatusBadge({ status }: { status: FullGoalStatus }) {
  const color = COLOR[status] ?? colors.muted;
  const label = STATUS_LABEL[status] ?? status;
  return (
    <View
      accessibilityLabel={`Status: ${label}`}
      style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: color, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
