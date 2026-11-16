import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { ApiError } from '../../src/api/client';
import { createGovernanceApi, type GovernanceParams } from '../../src/api/governance';
import type { DashboardGoal } from '../../src/api/disputes';
import { useAuth } from '../../src/auth/auth-context';
import { appealExplainer, disputeProgress } from '../../src/disputes/appeal-explainer';
import { fileAppeal, validateReason } from '../../src/disputes/appeal-flow';
import { useFeatures } from '../../src/features/use-features';
import { useDisputesApi, useDisputesData } from '../../src/disputes/use-disputes';
import { countdown } from '../../src/goals/dashboard';
import { config } from '../../src/config';
import { fetchLatestBlockhash } from '../../src/solana/transfer';
import { GoalStatusBadge } from '../../src/ui/goal-status';
import { Body, Button, Card, ErrorText, errorMessage, Field, H1, Screen } from '../../src/ui/kit';

export default function DisputeScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { wallet, session, api } = useAuth();
  const { features, loading: featuresLoading } = useFeatures();
  const [params, setParams] = useState<GovernanceParams | null>(null);
  const gov = useMemo(() => createGovernanceApi(api), [api]);
  const panelOn = features?.governance === true;
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

  // Voting window / panel size from the server when available; fails quietly to the documented defaults.
  useEffect(() => {
    if (!panelOn) return;
    let cancelled = false;
    gov
      .getOverview()
      .then((o) => !cancelled && setParams(o.params))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gov, panelOn]);

  const quote = data?.appealable.find((a) => a.goalId === goalId);
  const dispute = data?.disputes.find((d) => d.goalId === goalId);
  const left = countdown(quote?.appealDeadline ?? goal?.appeal_deadline, now);

  const explainer = appealExplainer(params, panelOn);
  const progress = disputeProgress(dispute?.status ?? 'open', params, panelOn);

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

  const confirmAndSubmit = () => {
    if (!quote || featuresLoading) return;
    const invalid = validateReason(reason);
    if (invalid) {
      setError(invalid);
      return;
    }
    Alert.alert(
      'Confirm appeal',
      `You will sign a ${quote.bondAmount} SOL bond in Phantom. ${explainer.slice(-2).join(' ')}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign bond', onPress: () => void submit() },
      ]
    );
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
          <Body>{progress.headline}</Body>
          <Body muted>Bond {dispute.bondAmount} SOL</Body>
          <Body muted>Your reason: {dispute.reason}</Body>
          {progress.details.map((d) => (
            <Body key={d} muted>
              {d}
            </Body>
          ))}
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
          <Card>
            <Body>How your appeal is judged</Body>
            {featuresLoading && <Body muted>Loading...</Body>}
            {!featuresLoading && explainer.map((line) => (
              <Body key={line} muted>
                {'\u2022 '}
                {line}
              </Body>
            ))}
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
            onPress={confirmAndSubmit}
            loading={busy}
            disabled={left === 'closed' || featuresLoading}
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
