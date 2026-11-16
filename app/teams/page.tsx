'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Users } from 'lucide-react';
import { useTeamsApi } from '@/components/teams/use-teams-api';

interface TeamRow {
  id: string;
  name: string;
  owner_wallet: string;
  member_count: number;
}

function TeamsList() {
  const { api, connected, wallet } = useTeamsApi();
  const router = useRouter();
  const search = useSearchParams();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState(search.get('code') ?? '');
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<{ teams: TeamRow[] }>('/api/teams');
      if (res.ok) setTeams(res.data.teams ?? []);
      else setError(res.data.error ?? 'Failed to load teams');
    } catch {
      setError('Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    setError('');
    try {
      const res = await api<{ teamId: string }>('/api/teams/join', { method: 'POST', body: { inviteCode: code } });
      if (res.ok) router.push(`/teams/${res.data.teamId}`);
      else setError(res.data.error ?? 'Could not join team');
    } catch {
      setError('Could not join team');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-3xl px-4 pt-28 pb-16 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="h-7 w-7" /> Teams</h1>
          <Button asChild><Link href="/teams/new">Create team</Link></Button>
        </div>

        {!connected ? (
          <Card><CardContent className="py-8 flex flex-col items-center gap-4">
            <p className="text-muted-foreground">Connect your wallet to see your teams.</p>
            <WalletButton />
          </CardContent></Card>
        ) : (
          <>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <Card>
              <CardHeader>
                <CardTitle>Join with an invite code</CardTitle>
                <CardDescription>Signed in as {wallet?.slice(0, 4)}...{wallet?.slice(-4)}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={join} className="flex gap-2">
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code" maxLength={20} />
                  <Button type="submit" disabled={joining || !code.trim()}>
                    {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : teams.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">You are not on any team yet.</p>
            ) : (
              <div className="space-y-3">
                {teams.map((t) => (
                  <Link key={t.id} href={`/teams/${t.id}`}>
                    <Card className="hover:border-primary transition-colors">
                      <CardHeader>
                        <CardTitle>{t.name}</CardTitle>
                        <CardDescription>
                          {t.member_count} member{t.member_count === 1 ? '' : 's'}
                          {t.owner_wallet === wallet ? ' · you own this team' : ''}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function TeamsPage() {
  return (
    <Suspense>
      <TeamsList />
    </Suspense>
  );
}
