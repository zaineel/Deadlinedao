import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../src/auth/auth-context';
import { guardsFor } from '../src/onboarding/logic';
import { OnboardingProvider, useOnboarding } from '../src/onboarding/onboarding-context';
import { colors } from '../src/ui/kit';

// Deep links into a stack screen (invite codes etc.) keep the tab bar underneath for "back".
export const unstable_settings = { initialRouteName: '(tabs)' };

function Routes() {
  const { ready, session } = useAuth();
  const onboarding = useOnboarding();
  if (!ready || !onboarding.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  const guards = guardsFor({ onboardingDone: onboarding.done, signedIn: !!session });
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* First-run intro (also replayable from Settings while signed in). Declared first so it is the signed-out entry. */}
      <Stack.Protected guard={guards.onboarding}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={guards.connect}>
        <Stack.Screen name="connect" options={{ title: 'Connect', headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={guards.app}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="goals/new" options={{ title: 'New goal', presentation: 'modal' }} />
        <Stack.Screen name="goals/[id]" options={{ title: 'Goal' }} />
        <Stack.Screen name="proof/[id]" options={{ title: 'Submit proof', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="disputes/[goalId]" options={{ title: 'Appeal' }} />
        {/* Teams / orgs detail screens and governance voting use file-based routing: expo-router adds
            undeclared files to this Stack automatically. Governance has no permanent entry point; the
            Dashboard shows a banner only while the user has pending panel assignments. */}
      </Stack.Protected>
      {/* Wallet redirect landing route; renders nothing and returns to the previous screen. */}
      <Stack.Screen name="phantom/[action]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <StatusBar style="light" />
        <Routes />
      </OnboardingProvider>
    </AuthProvider>
  );
}
