import { useRouter } from 'expo-router';
import React from 'react';
import { useFeatures } from '../../src/features/use-features';
import { Button, Screen } from '../../src/ui/kit';
import { SettingsPanel } from '../../src/ui/settings-panel';

/** Profile tab: account, preferences and the remaining links. Governance is intentionally absent (contextual only). */
export default function Profile() {
  const router = useRouter();
  const { features } = useFeatures();
  return (
    <Screen>
      <SettingsPanel />
      {features?.teams && <Button title="Join a team with invite code" variant="secondary" onPress={() => router.push('/teams/join')} />}
      {features?.orgs && (
        <Button title="Join an organization with invite code" variant="secondary" onPress={() => router.push('/orgs/join')} />
      )}
    </Screen>
  );
}
