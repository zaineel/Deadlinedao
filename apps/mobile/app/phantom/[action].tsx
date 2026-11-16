import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Phantom redirects to deadlinedao://phantom/<action>?... . The deep link
 * itself is consumed by the Linking listener in AuthProvider (the wallet
 * provider resolves its pending request); this route only exists so
 * expo-router does not show "unmatched route", then it steps back.
 */
export default function PhantomRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  return null;
}
