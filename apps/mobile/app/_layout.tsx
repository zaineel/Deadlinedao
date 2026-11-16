import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../src/auth/auth-context';
import { colors } from '../src/ui/kit';

function Routes() {
  const { ready, session } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="connect" options={{ title: 'Connect', headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="index" options={{ title: 'My goals' }} />
        <Stack.Screen name="goals/new" options={{ title: 'New goal', presentation: 'modal' }} />
        <Stack.Screen name="goals/[id]" options={{ title: 'Goal' }} />
        <Stack.Screen name="proof/[id]" options={{ title: 'Submit proof', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="more" options={{ title: 'More' }} />
        <Stack.Screen name="disputes/[goalId]" options={{ title: 'Appeal' }} />
        {/* Teams / orgs / governance screens use file-based routing: expo-router adds undeclared
            files to this Stack automatically, so they need no edit here. They set their own header
            title with <Stack.Screen options={{ title }} /> inside the screen. */}
      </Stack.Protected>
      {/* Wallet redirect landing route; renders nothing and returns to the previous screen. */}
      <Stack.Screen name="phantom/[action]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Routes />
    </AuthProvider>
  );
}
