import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Share, Switch, Text, View } from 'react-native';
import {
  describeStats,
  lamportsToSol,
  OrgMembersInfo,
  OrgStats,
  OrgView,
  sendFundingTransfer,
  windowEnded,
} from '../../src/api/orgs';
import { ApiError } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-context';
import { config } from '../../src/config';
import { useOrgsApi, orgsErrorMessage } from '../../src/orgs/use-orgs-api';
import { Body, Button, Card, colors, ErrorText, errorMessage, Field } from '../../src/ui/kit';

export default function OrgDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wallet, session } = useAuth();
  const orgs = useOrgsApi();
  const [org, setOrg] = useState<OrgView | null | undefined>(undefined);
  const [members, setMembers] = useState<OrgMembersInfo | null>(null);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<'consent' | 'fund' | 'withdraw' | null>(null);
  const [amount, setAmount] = useState('1');
  // Signature of a funding transfer that landed but was not credited yet: retry verification only, never re-send.
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const found = (await orgs.listOrgs()).find((o) => o.id === id) ?? null;
      setOrg(found);
      if (!found) return;
      const [m, s] = await Promise.all([
        orgs.getMembers(id).catch(() => null),
        found.isAdmin ? orgs.getStats(id).catch(() => null) : Promise.resolve(null),
      ]);
      setMembers(m);
      setStats(s);
    } catch (e) {
      setError(orgsErrorMessage(e));
      setOrg((prev) => (prev === undefined ? null : prev));
    }
  }, [orgs, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const consent = members?.membership?.consent ?? org?.membership?.consent ?? false;

  const toggleConsent = async (next: boolean) => {
    setBusy('consent');
    setError(null);
    try {
      await orgs.setConsent(id, next);
      setMembers((m) => (m && m.membership ? { ...m, membership: { ...m.membership, consent: next } } : m));
      await load();
    } catch (e) {
      setError(orgsErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (signature: string) => {
    try {
      const r = await orgs.submitFunding(id, signature);
      setPendingSignature(null);
      setNotice(`Pool funded: ${lamportsToSol(r.creditedLamports)} SOL credited.`);
      await load();
    } catch (e) {
      // 503 (RPC not ready) / 400 (not verifiable yet): keep the signature so verification can be retried.
      setPendingSignature(signature);
      setError(
        e instanceof ApiError && (e.status === 503 || e.status === 400)
          ? `${e.message}. The transfer was sent; tap "Retry verification" in a moment.`
          : errorMessage(e)
      );
    }
  };

  const fund = async () => {
    if (!session) return;
    setBusy('fund');
    setError(null);
    setNotice(null);
    try {
      const signature = await sendFundingTransfer(wallet, orgs, {
        orgId: id,
        from: session.wallet,
        sol: Number(amount),
        rpcUrl: config.rpcUrl,
      });
      await verify(signature);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    if (!pendingSignature) return;
    setBusy('fund');
    setError(null);
    await verify(pendingSignature);
    setBusy(null);
  };

  const doWithdraw = async () => {
    setBusy('withdraw');
    setError(null);
    setNotice(null);
    try {
      const r = await orgs.withdraw(id);
      setNotice(`Withdrawal sent: ${lamportsToSol(r.amountLamports)} SOL.`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmWithdraw = () =>
    Alert.alert('Withdraw unspent balance?', 'The remaining pool balance is sent to your connected wallet.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => void doWithdraw() },
    ]);

  const shareInvite = async () => {
    if (!org?.inviteCode) return;
    const link = Linking.createURL('orgs/join', { queryParams: { code: org.inviteCode } });
    try {
      await Share.share({ message: `Join ${org.name} on DeadlineDAO. Invite code: ${org.inviteCode}\n${link}` });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const p = org?.program ?? null;
  const ended = windowEnded(p);
  const statsView = stats ? describeStats(stats) : null;

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
      {notice && <Text style={{ color: colors.ok }}>{notice}</Text>}
      {org === undefined && !error && <Body muted>Loading organization...</Body>}
      {org === null && <Body muted>Organization not found, or you are not a member.</Body>}
      {org && (
        <>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{org.name}</Text>

          {p && (
            <Card>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Employer match</Text>
              <Body muted>
                {p.matchRateBps / 100}% of each completed goal's stake is matched, up to {lamportsToSol(p.perMemberCapLamports)}{' '}
                SOL per member. Program {new Date(p.windowStart).toLocaleDateString()} to{' '}
                {new Date(p.windowEnd).toLocaleDateString()}. Only goals you create after joining are matched.
              </Body>
              {org.membership && (
                <Text style={{ color: colors.muted }}>Joined {new Date(org.membership.joinedAt).toLocaleDateString()}</Text>
              )}
            </Card>
          )}

          {org.membership && (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>Share anonymous group statistics</Text>
                <Switch
                  accessibilityLabel="Share anonymous group statistics with my employer"
                  value={consent}
                  onValueChange={(v) => void toggleConsent(v)}
                  disabled={busy === 'consent'}
                />
              </View>
              <Body muted>
                Off by default. Your employer only ever sees combined numbers (participation, completion rate, total
                staked and matched), and only once at least 5 members have opted in. They never see your name, wallet,
                goals, descriptions or proofs. You can turn this off any time.
              </Body>
            </Card>
          )}

          {org.isAdmin && p && (
            <>
              <Card>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Sponsor pool (admin)</Text>
                <Body>
                  Funded {lamportsToSol(p.fundedLamports ?? 0)} SOL, remaining {lamportsToSol(p.remainingLamports ?? 0)} SOL,
                  withdrawn {lamportsToSol(p.withdrawnLamports ?? 0)} SOL
                </Body>
                {!ended && (
                  <>
                    <Field label="Amount to add (SOL)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
                    <Button title="Fund pool with Phantom" onPress={fund} loading={busy === 'fund'} disabled={!(Number(amount) > 0) || busy !== null} />
                    <Body muted>Phantom opens to approve a transfer to escrow. The server verifies it on chain and credits what moved.</Body>
                  </>
                )}
                {pendingSignature && (
                  <Button title="Retry verification" variant="secondary" onPress={retry} loading={busy === 'fund'} />
                )}
                <Button
                  title="Withdraw unspent balance"
                  variant="danger"
                  onPress={confirmWithdraw}
                  loading={busy === 'withdraw'}
                  disabled={!ended || busy !== null}
                />
                {!ended && <Body muted>Withdrawal is available after the program ends.</Body>}
              </Card>

              {org.inviteCode && (
                <Card>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Invite employees</Text>
                  <Text selectable style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{org.inviteCode}</Text>
                  <Button title="Share invite" variant="secondary" onPress={shareInvite} />
                </Card>
              )}

              <Card>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Program results (anonymous)</Text>
                <Body muted>
                  Only employees who opted in are counted, and nothing is shown until at least 5 have opted in. You never
                  see individual goals, proofs or descriptions.
                </Body>
                {members?.headcount && (
                  <Body>
                    {members.headcount.total} joined, {members.headcount.consenting} opted in
                  </Body>
                )}
                {statsView && 'suppressed' in statsView && <Body muted>{statsView.suppressed}</Body>}
                {statsView && 'lines' in statsView &&
                  statsView.lines.map((l) => (
                    <View key={l.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>{l.label}</Text>
                      <Text style={{ color: colors.text }}>{l.value}</Text>
                    </View>
                  ))}
                {!stats && <Body muted>Stats are not available yet.</Body>}
              </Card>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
