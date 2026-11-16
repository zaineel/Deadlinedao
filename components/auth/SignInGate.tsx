'use client';

import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/components/auth/SessionProvider';

/** Card shown in place of a page's content until the connected wallet has signed in. */
export function SignInGate({ what }: { what: string }) {
  const { status, error, signIn } = useSession();
  const busy = status === 'signing_in' || status === 'checking';
  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader className="text-center">
        <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-purple-400" />
        <CardTitle className="text-white">Sign in with your wallet</CardTitle>
        <CardDescription className="text-gray-400">
          Sign a free message (no transaction, no fee) to {what}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 pt-4">
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        <Button
          onClick={() => void signIn()}
          disabled={busy}
          className="bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sign in
        </Button>
      </CardContent>
    </Card>
  );
}
