'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrgApi } from '@/components/orgs/use-org-api';

export default function JoinOrgPage() {
  const { api, wallet } = useOrgApi();
  const [code, setCode] = useState('');
  const [joined, setJoined] = useState<{ orgId: string; orgName: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('code');
    if (c) setCode(c);
  }, []);

  async function join() {
    setBusy(true);
    setError('');
    const r = await api('/api/orgs/join', { method: 'POST', body: { inviteCode: code.trim() } });
    setBusy(false);
    if (!r.ok) {
      setError(r.status === 404 ? 'That invite code is not valid.' : 'Could not join. Try again.');
      return;
    }
    setJoined({ orgId: r.data.orgId as string, orgName: r.data.orgName as string });
  }

  async function updateConsent(next: boolean) {
    if (!joined) return;
    const r = await api(`/api/orgs/${joined.orgId}/members`, { method: 'PUT', body: { consent: next } });
    if (r.ok) setConsent(next);
    else setError('Could not update your choice.');
  }

  return (
    <>
      <Header />
      <div className="min-h-screen pt-24 pb-16" style={{ backgroundColor: '#0a0a0f' }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-xl space-y-6">
          <h1 className="text-4xl font-bold text-white">Join your employer&apos;s program</h1>
          {!wallet ? (
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="pt-6 flex justify-center">
                <WalletButton />
              </CardContent>
            </Card>
          ) : !joined ? (
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Enter your invite code</CardTitle>
                <CardDescription className="text-gray-400">
                  Goals you create after joining can earn a sponsor match when you complete them. You still stake your own SOL.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code" />
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <Button onClick={join} disabled={busy || code.trim().length < 8}>{busy ? 'Joining...' : 'Join'}</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">You joined {joined.orgName}</CardTitle>
                <CardDescription className="text-gray-400">
                  Your employer never sees your goals, proofs or wallet activity. If you opt in below, you are counted
                  anonymously in group totals, and only once at least 5 people have opted in.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <label className="flex items-center gap-2 text-gray-300">
                  <input type="checkbox" checked={consent} onChange={(e) => void updateConsent(e.target.checked)} />
                  Include me in anonymous group statistics (you can change this any time)
                </label>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <Link href="/create"><Button>Create a goal</Button></Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
