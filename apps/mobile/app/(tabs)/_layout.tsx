import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useFeatures } from '../../src/features/use-features';
import { ALL_TABS, isTabVisible } from '../../src/navigation/routes';
import { colors } from '../../src/ui/kit';

export default function TabsLayout() {
  const { features } = useFeatures();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      {ALL_TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            // href: null hides the tab (the route stays valid for deep links).
            href: isTabVisible(t.name, features) ? undefined : null,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? t.icon : (`${t.icon}-outline` as keyof typeof Ionicons.glyphMap)} size={size} color={String(color)} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
