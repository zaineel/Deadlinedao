import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { config } from '../config';
import { broadcastTransaction } from './broadcast';
import { PhantomWalletProvider } from './phantom/provider';
import { KeyValueStore, WalletProvider } from './types';

export * from './types';

const secureStorage: KeyValueStore = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

let instance: WalletProvider | null = null;

/**
 * Extension point: to add Solflare (deep links) or Android Mobile Wallet Adapter,
 * implement WalletProvider and return it here (e.g. chosen by Platform.OS or a setting).
 */
export function getWalletProvider(): WalletProvider {
  if (!instance) {
    instance = new PhantomWalletProvider({
      storage: secureStorage,
      randomBytes: (n) => Crypto.getRandomBytes(n),
      openUrl: (url) => Linking.openURL(url),
      appUrl: config.apiUrl,
      // createURL resolves to exp://<host>:8081/--/phantom in Expo Go and to `${config.urlScheme}://phantom` in a real build.
      redirectBase: Linking.createURL('phantom'),
      cluster: config.cluster,
      broadcastTransaction: (tx) => broadcastTransaction(config.rpcUrl, tx),
    });
  }
  return instance;
}
