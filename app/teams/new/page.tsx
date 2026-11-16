'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useTeamsApi } from '@/components/teams/use-teams-api';

export default function NewTeamPage() {
  const { api, connected } = useTeamsApi();
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ team: { id: string } }>('/api/teams', { method: 'POST', body: { name } });
      if (res.ok) router.push(`/teams/${res.data.team.id}`);
      else setError(res.data.error ?? 'Failed to create team');
    } catch {
      setError('Failed to create team');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-xl px-4 pt-28 pb-16">
        <Card>
          <CardHeader>
            <CardTitle>Create a team</CardTitle>
            <CardDescription>You become the owner and get an invite code to share.</CardDescription>
          </CardHeader>
          <CardContent>
            {!connected ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <p className="text-muted-foreground">Connect your wallet first.</p>
                <WalletButton />
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                <div className="space-y-2">
                  <Label htmlFor="name">Team name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
                </div>
                <Button type="submit" disabled={busy || !name.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create team'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
