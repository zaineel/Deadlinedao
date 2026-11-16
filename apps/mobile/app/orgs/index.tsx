import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import type { OrgView } from '../../src/api/orgs';
import { useOrgsApi, orgsErrorMessage } from '../../src/orgs/use-orgs-api';
import { Body, Button, Card, colors, ErrorText } from '../../src/ui/kit';

export default function OrgsList() {
  const orgs = useOrgsApi();
  const router = useRouter();
  const [list, setList] = useState<OrgView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setList(await orgs.listOrgs());
    } catch (e) {
      setError(orgsErrorMessage(e));
    }
  }, [orgs]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

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
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Button title="Join with invite code" onPress={() => router.push('/orgs/join')} />
      <ErrorText message={error} />
      {list === null && !error && <Body muted>Loading organizations...</Body>}
      {list?.length === 0 && (
        <Body muted>You are not part of an organization yet. Ask your employer for an invite code.</Body>
      )}
      {list?.map((o) => (
        <Card key={o.id} onPress={() => router.push({ pathname: '/orgs/[id]', params: { id: o.id } })}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{o.name}</Text>
          <Text style={{ color: colors.muted }}>
            {o.isAdmin ? 'Administrator' : 'Member'}
            {o.membership ? (o.membership.consent ? ', sharing anonymous stats' : ', not sharing stats') : ''}
          </Text>
          {o.program && (
            <Text style={{ color: colors.muted }}>
              Match {o.program.matchRateBps / 100}%, program ends {new Date(o.program.windowEnd).toLocaleDateString()}
            </Text>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
