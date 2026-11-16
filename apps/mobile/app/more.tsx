import { useRouter } from 'expo-router';
import React from 'react';
import { Body, Button, Screen } from '../src/ui/kit';
import { useFeatures } from '../src/features/use-features';

/** Hub for secondary areas. Entries for disabled server features are hidden. */
export default function More() {
  const router = useRouter();
  const { features, loading } = useFeatures();
  return (
    <Screen>
      {features?.teams && <Button title="Teams" variant="secondary" onPress={() => router.push('/teams')} />}
      {features?.orgs && <Button title="Organizations" variant="secondary" onPress={() => router.push('/orgs')} />}
      {features?.governance && (
        <Button title="Governance" variant="secondary" onPress={() => router.push('/governance')} />
      )}
      <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
      {!loading && features && !features.teams && !features.orgs && !features.governance && (
        <Body muted>Teams, organizations and governance are not enabled on this server.</Body>
      )}
    </Screen>
  );
}
