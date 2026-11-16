import type { ExpoConfig } from 'expo/config';

// Placeholders: replace the bundle id and EAS project id before shipping.
const BUNDLE_ID = 'com.deadlinedao.app';

const config: ExpoConfig = {
  name: 'DeadlineDAO',
  slug: 'deadlinedao',
  scheme: 'deadlinedao', // wallet redirects return to deadlinedao://phantom/<action>
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      // Lets Linking.canOpenURL probe for Phantom so we can tell the user to install it.
      LSApplicationQueriesSchemes: ['phantom'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: 'Choose a photo as proof that you completed your goal.',
        cameraPermission: 'Take a photo as proof that you completed your goal.',
      },
    ],
    'expo-notifications',
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: 'REPLACE_WITH_EAS_PROJECT_ID' },
  },
};

export default config;
