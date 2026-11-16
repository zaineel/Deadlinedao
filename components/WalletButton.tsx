'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSession } from '@/components/auth/SessionProvider';

// Dynamically import WalletMultiButton to avoid SSR issues
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export function WalletButton({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const { connected } = useWallet();
  const { status, error, signIn, signOut } = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show placeholder during SSR
  if (!mounted) {
    return (
      <button className={className} disabled>
        Connect Wallet
      </button>
    );
  }

  // Use the built-in WalletMultiButton which handles all wallet interactions
  return (
    <div className="flex items-center gap-2">
      <WalletMultiButton className={className} />
      {connected && status === 'signed_out' && (
        <button
          type="button"
          onClick={() => void signIn()}
          title={error ?? 'Sign a free message to sign in'}
          className="rounded-md border border-purple-400/60 px-3 py-2 text-sm font-semibold text-purple-200 hover:bg-purple-500/20"
        >
          Sign in
        </button>
      )}
      {connected && (status === 'signing_in' || status === 'checking') && (
        <span className="text-xs text-gray-400">Signing in...</span>
      )}
      {connected && status === 'signed_in' && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md px-2 py-2 text-xs text-gray-400 hover:text-white"
          title="Signed in. Click to sign out"
        >
          Sign out
        </button>
      )}
    </div>
  );
}
