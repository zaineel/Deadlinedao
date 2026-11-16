import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  agreementLabel,
  Assignment,
  countdown,
  createGovernanceApi,
  deriveVoteState,
  eligibilityText,
  GovernanceOverview,
  lamportsToSol,
  MAX_REASON_LENGTH,
  validateReason,
  Vote,
  voteErrorMessage,
} from '../../src/api/governance';
import { ApiError } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-context';
import { Body, Button, Card, colors, ErrorText, errorMessage, Field, H1 } from '../../src/ui/kit';

export default function Governance() {
  const { api } = useAuth();
  const gov = useMemo(() => createGovernanceApi(api), [api]);
  const [data, setData] = useState<GovernanceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await gov.getOverview());
      setUnavailable(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setUnavailable(true);
      else setError(errorMessage(e));
    } finally {
      setNow(Date.now());
    }
  }, [gov]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <H1>Governance</H1>
      <Body muted>
        Panelists are drawn at random to review appealed AI rejections. Your vote stays sealed until the dispute resolves.
      </Body>
      {unavailable && <Body muted>Governance is not enabled on this server.</Body>}
      <ErrorText message={error} />
      {!data && !unavailable && !error && <Body muted>Loading...</Body>}
      {data && (
        <>
          <Card>
            <Text style={{ color: colors.text, fontWeight: '700' }}>My stats</Text>
            <Body>
              Votes cast: {data.stats.votesCast}
              {'\n'}Agreed with outcome: {data.stats.votesAgreed}
              {agreementLabel(data.stats.agreementRate)}
              {'\n'}Missed: {data.stats.votesMissed}
            </Body>
            {data.rewards.length > 0 && (
              <Body muted>
                Rewards: {data.rewards.map((r) => `${lamportsToSol(r.amountLamports)} SOL (${r.status})`).join(', ')}
              </Body>
            )}
          </Card>
          <Card>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Who can vote</Text>
            <Body muted>{eligibilityText(data.params)}</Body>
          </Card>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>My assignments</Text>
          {data.assignments.length === 0 && <Body muted>No assignments right now.</Body>}
          {data.assignments.map((a) => (
            <AssignmentCard key={a.disputeId} a={a} now={now} gov={gov} onVoted={load} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function AssignmentCard({
  a,
  now,
  gov,
  onVoted,
}: {
  a: Assignment;
  now: number;
  gov: ReturnType<typeof createGovernanceApi>;
  onVoted: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<Vote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ui = deriveVoteState(a, now);
  const cd = countdown(a.votingEndsAt, now);

  const submit = async (vote: Vote) => {
    const invalid = validateReason(reason);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(vote);
    setError(null);
    try {
      const res = await gov.castVote(a.disputeId, vote, reason);
      setNotice(res.replay ? 'You had already cast this vote.' : 'Vote recorded.');
      await onVoted();
    } catch (e) {
      setError(voteErrorMessage(e));
      // 404/409 means our view is stale: refresh to show the real state.
      if (e instanceof ApiError && (e.status === 404 || e.status === 409)) await onVoted();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{a.goal.title}</Text>
      <Body muted>
        Appeal by {a.owner}
        {a.state === 'voting' ? ` · ${cd.label}` : ` · ${a.state}`}
      </Body>
      <Body>Goal: {a.goal.description}</Body>
      {a.proof && (
        <View style={{ gap: 6 }}>
          <Body>Proof: {a.proof.text}</Body>
          {a.proof.imageUrl && (
            <Image
              source={{ uri: a.proof.imageUrl }}
              accessibilityLabel="Submitted proof"
              style={{ width: '100%', height: 220, borderRadius: 10 }}
              resizeMode="contain"
            />
          )}
          <Body>
            AI verdict: {a.proof.aiVerdict ?? 'n/a'}
            {a.proof.aiConfidence !== null ? ` (${a.proof.aiConfidence}% confidence)` : ''}
          </Body>
          {a.proof.aiReasoning && <Body muted>{a.proof.aiReasoning}</Body>}
        </View>
      )}
      <Body>Owner's appeal: {a.appeal.reason}</Body>
      {a.appeal.extraImageUrl && (
        <Image
          source={{ uri: a.appeal.extraImageUrl }}
          accessibilityLabel="Appeal evidence"
          style={{ width: '100%', height: 220, borderRadius: 10 }}
          resizeMode="contain"
        />
      )}

      {ui.kind === 'already_voted' && <Body>Your vote: {ui.vote} (sealed until the dispute resolves)</Body>}
      {ui.kind === 'window_closed' && <Body muted>Voting is closed. You did not vote on this dispute.</Body>}
      {ui.kind === 'resolved' && (
        <Body>
          Resolved: {ui.decision ?? 'decided by admin'}
          {a.result ? ` · overturn ${a.result.tally.overturn}, uphold ${a.result.tally.uphold}` : ''}
          {a.myVote ? `\nYour vote: ${a.myVote}` : ''}
        </Body>
      )}

      {ui.kind === 'can_vote' && (
        <View style={{ gap: 10 }}>
          <Field
            label="Optional short reason (private until resolution)"
            value={reason}
            onChangeText={setReason}
            maxLength={MAX_REASON_LENGTH}
            multiline
            accessibilityLabel="Vote reason"
          />
          <Button title="Overturn (AI was wrong)" loading={busy === 'overturn'} disabled={busy !== null} onPress={() => submit('overturn')} />
          <Button title="Uphold (AI was right)" variant="secondary" loading={busy === 'uphold'} disabled={busy !== null} onPress={() => submit('uphold')} />
        </View>
      )}
      {notice && <Body muted>{notice}</Body>}
      <ErrorText message={error} />
    </Card>
  );
}
