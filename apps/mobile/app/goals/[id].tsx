import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Share, Text, View } from 'react-native';
import type { DashboardGoal } from '../../src/api/disputes';
import { useAuth } from '../../src/auth/auth-context';
import { config } from '../../src/config';
import { useDisputesApi, useDisputesData } from '../../src/disputes/use-disputes';
import { useFeatures } from '../../src/features/use-features';
import { canShare, countdown, shareUrl } from '../../src/goals/dashboard';
import { GoalStatusBadge } from '../../src/ui/goal-status';
import { Body, Button, Card, colors, ErrorText, errorMessage, H1, Screen } from '../../src/ui/kit';

export default function GoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const goalsApi = useDisputesApi();
  const router = useRouter();
  const { features } = useFeatures();
  const disputes = useDisputesData();
  const [goal, setGoal] = useState<DashboardGoal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const disputesOn = features?.disputes === true;
  const reloadDisputes = disputes.reload;
  useFocusEffect(
    useCallback(() => {
      goalsApi
        .goal(id)
        .then(setGoal)
        .catch((e) => setError(errorMessage(e)));
      if (disputesOn) void reloadDisputes();
    }, [goalsApi, id, disputesOn, reloadDisputes])
  );

  const pushOn = features?.push === true;

  /** Toggle public sharing (POST /api/goals/share), then open the share sheet when turned on. */
  const toggleShare = async () => {
    if (!goal) return;
    setNotice(null);
    setError(null);
    setSharing(true);
    try {
      const next = !goal.share_public;
      const res = await api.shareGoal(id, next);
      if (!res.available) {
        setNotice('Only completed goals can be shared (or sharing is disabled on this server).');
        return;
      }
      setGoal({ ...goal, share_public: res.data.shared ?? next });
      if (next) await openShareSheet();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSharing(false);
    }
  };

  const openShareSheet = async () => {
    if (!goal) return;
    const url = shareUrl(config.apiUrl, goal.id);
    await Share.share({ message: `I completed my goal "${goal.title}" on DeadlineDAO. ${url}`, url });
  };

  if (!goal) {
    return (
      <Screen>
        <ErrorText message={error} />
      </Screen>
    );
  }

  const dispute = disputes.data?.disputes.find((d) => d.goalId === goal.id);
  const quote = disputes.data?.appealable.find((a) => a.goalId === goal.id);
  const left = countdown(quote?.appealDeadline ?? goal.appeal_deadline, Date.now());

  return (
    <Screen>
      <GoalStatusBadge status={goal.status} />
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
      {goal.status === 'pending_validation' && <Body muted>Your proof is being validated.</Body>}
      {goal.status === 'failed' && <Body muted>This goal failed. The stake was forfeited.</Body>}

      {goal.status === 'rejected_appealable' && (
        <Card>
          <Body>The AI rejected your proof.</Body>
          <Body muted>Appeal window: {left ?? 'unknown'}</Body>
          {disputesOn && quote && (
            <>
              <Body muted>Bond: {quote.bondAmount} SOL (5% of your stake)</Body>
              <Button
                title="Appeal"
                onPress={() => router.push({ pathname: '/disputes/[goalId]', params: { goalId: goal.id } })}
              />
            </>
          )}
        </Card>
      )}

      {(goal.status === 'disputed' || dispute) && disputesOn && (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            Appeal {dispute ? (dispute.status === 'open' ? 'under review' : dispute.status) : 'under review'}
          </Text>
          <Body muted>A governance panel decides appeals.</Body>
          <Button
            title="View appeal"
            variant="secondary"
            onPress={() => router.push({ pathname: '/disputes/[goalId]', params: { goalId: goal.id } })}
          />
        </Card>
      )}

      {canShare(goal) && pushOn && (
        <>
          <Button
            title={goal.share_public ? 'Stop sharing publicly' : 'Share publicly'}
            variant="secondary"
            loading={sharing}
            onPress={toggleShare}
          />
          {goal.share_public && <Button title="Share link" variant="secondary" onPress={openShareSheet} />}
        </>
      )}
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
