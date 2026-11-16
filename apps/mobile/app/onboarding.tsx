import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { FlatList, Linking, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/auth-context';
import { useOnboarding } from '../src/onboarding/onboarding-context';
import { clampStep, INTRO_STEPS, IntroStep, isLastStep, PHANTOM_APP_STORE_URL } from '../src/onboarding/logic';
import { Button, colors } from '../src/ui/kit';

function Illustration({ icon }: { icon: IntroStep['icon'] }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 180 }}>
      <View
        style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={48} color="#fff" />
        </View>
      </View>
    </View>
  );
}

export default function Onboarding() {
  const { session } = useAuth();
  const { complete } = useOnboarding();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<IntroStep>>(null);
  const [index, setIndex] = useState(0);
  const replay = !!session;

  const finish = async () => {
    // Signed out: completing flips the Stack.Protected guards over to Connect. Replay: just go back.
    await complete();
    if (replay && router.canGoBack()) router.back();
  };

  const go = (i: number) => {
    const n = clampStep(i);
    listRef.current?.scrollToIndex({ index: n, animated: true });
    setIndex(n);
  };

  const last = isLastStep(index);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: replay }} />
      <View style={{ alignItems: 'flex-end', padding: 16, minHeight: 52 }}>
        {!last && (
          <Pressable accessibilityRole="button" accessibilityLabel="Skip intro" onPress={() => void finish()} hitSlop={12}>
            <Text style={{ color: colors.muted, fontSize: 16 }}>Skip</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        ref={listRef}
        data={INTRO_STEPS}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(clampStep(Math.round(e.nativeEvent.contentOffset.x / width)))}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 24, gap: 16 }}>
            <Illustration icon={item.icon} />
            <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700', textAlign: 'center' }}>{item.title}</Text>
            {item.body.map((line) => (
              <Text key={line} style={{ color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: 'center' }}>
                {line}
              </Text>
            ))}
            {item.id === 'wallet' && (
              <Button
                title="Get Phantom on the App Store"
                variant="secondary"
                onPress={() => void Linking.openURL(PHANTOM_APP_STORE_URL)}
              />
            )}
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 12 }} accessibilityLabel={`Step ${index + 1} of ${INTRO_STEPS.length}`}>
        {INTRO_STEPS.map((s, i) => (
          <View
            key={s.id}
            style={{ width: i === index ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? colors.primary : colors.border }}
          />
        ))}
      </View>
      <View style={{ paddingHorizontal: 24, gap: 10 }}>
        {last ? (
          <Button title={replay ? 'Done' : 'Get started'} onPress={() => void finish()} />
        ) : (
          <Button title="Next" onPress={() => go(index + 1)} />
        )}
        {index > 0 && <Button title="Back" variant="secondary" onPress={() => go(index - 1)} />}
      </View>
    </View>
  );
}
