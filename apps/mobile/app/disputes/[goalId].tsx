import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../src/api/client';
import type { DashboardGoal } from '../../src/api/disputes';
import { useAuth } from '../../src/auth/auth-context';
import { fileAppeal, validateReason } from '../../src/disputes/appeal-flow';
import { useDisputesApi, useDisputesData } from '../../src/disputes/use-disputes';
import { countdown } from '../../src/goals/dashboard';
import { config } from '../../src/config';
import { fetchLatestBlockhash } from '../../src/solana/transfer';
import { GoalStatusBadge } from '../../src/ui/goal-status';
import { Body, Button, Card, ErrorText, errorMessage, Field, H1, Screen } from '../../src/ui/kit';

const STATUS_TEXT = {
  open: 'Under review by the governance panel',
  overturned: 'Overturned: your goal was marked completed, stake returned and bond refunded',
  upheld: 'Upheld: the rejection stands and the bond stays in escrow',
} as const;

export default function DisputeScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { wallet, session } = useAuth();
  const router = useRouter();
  const disputesApi = useDisputesApi();
  const { data, error: loadError, reload } = useDisputesData();
  const [goal, setGoal] = useState<DashboardGoal | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setGoal(await disputesApi.goal(goalId));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? 'Goal not found' : errorMessage(e));
    }
    await reload();
    setNow(Date.now());
  }, [disputesApi, goalId, reload]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const quote = data?.appealable.find((a) => a.goalId === goalId);
  const dispute = data?.disputes.find((d) => d.goalId === goalId);
  const left = countdown(quote?.appealDeadline ?? goal?.appeal_deadline, now);

  const submit = async () => {
    if (!quote || !goal || !data?.escrowAddress || !session) return;
    const invalid = validateReason(reason);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fileAppeal(
        { wallet, disputes: disputesApi, getBlockhash: () => fetchLatestBlockhash(config.rpcUrl) },
        {
          goalId,
          reason,
          bondAmount: quote.bondAmount,
          stakeAmount: Number(goal.stake_amount),
          escrowAddress: data.escrowAddress,
          walletAddress: session.wallet,
        }
      );
      setDone(true);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {goal && (
        <>
          <GoalStatusBadge status={goal.status} />
          <H1>{goal.title}</H1>
          <Body muted>Stake {goal.stake_amount} SOL</Body>
        </>
      )}
      <ErrorText message={error ?? loadError} />

      {dispute && (
        <Card>
          <Body>{STATUS_TEXT[dispute.status] ?? dispute.status}</Body>
          <Body muted>Bond {dispute.bondAmount} SOL</Body>
          <Body muted>Your reason: {dispute.reason}</Body>
          {dispute.status === 'open' && (
            <Body muted>A governance panel decides appeals. You will be notified when it is resolved.</Body>
          )}
        </Card>
      )}

      {!dispute && quote && data?.escrowAddress && (
        <>
          <Card>
            <Body>The AI rejected your proof. You can appeal while the window is open.</Body>
            <Body muted>Appeal window: {left ?? 'unknown'}</Body>
            <Body muted>
              Bond: {quote.bondAmount} SOL (5% of your stake), sent to escrow. Refunded if the appeal succeeds, kept if
              the decision is upheld.
            </Body>
          </Card>
          <Field
            label="Why was the decision wrong?"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={1000}
            style={{ minHeight: 110, textAlignVertical: 'top' }}
            accessibilityLabel="Appeal reason"
          />
          <Button
            title={`Pay ${quote.bondAmount} SOL bond and appeal`}
            onPress={submit}
            loading={busy}
            disabled={left === 'closed'}
          />
        </>
      )}

      {!dispute && !quote && goal && !done && (
        <Body muted>
          {goal.status === 'rejected_appealable'
            ? 'The appeal window is closed or appeals are not available.'
            : 'This goal has no appeal.'}
        </Body>
      )}
      <Button title="Back to goal" variant="secondary" onPress={() => router.replace({ pathname: '/goals/[id]', params: { id: goalId } })} />
    </Screen>
  );
}
