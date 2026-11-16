'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useTeamsApi } from '@/components/teams/use-teams-api';

type MemberStatus = 'not_staked' | 'awaiting_stake' | 'active' | 'completed' | 'failed' | 'in_review';

interface TeamGoalView {
  id: string;
  title: string;
  description: string;
  category: string;
  deadline: string;
  stake_per_member: number;
  status: 'open' | 'settled';
  myGoalId: string | null;
  progress: {
    members: Array<{ wallet: string; status: MemberStatus }>;
    completed: number;
    staked: number;
    total: number;
  };
}

interface TeamView {
  team: { id: string; name: string; invite_code: string };
  isOwner: boolean;
  members: Array<{ wallet: string; role: string }>;
  goals: TeamGoalView[];
}

const short = (w: string) => `${w.slice(0, 4)}...${w.slice(-4)}`;

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { api, connected, wallet } = useTeamsApi();
  const { sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [data, setData] = useState<TeamView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [staking, setStaking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<TeamView>(`/api/teams/${id}`);
      if (res.ok) setData(res.data);
      else setError(res.status === 404 ? 'Team not found' : (res.data.error ?? 'Failed to load team'));
    } catch {
      setError('Failed to load team');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const stake = async (teamGoalId: string) => {
    setStaking(teamGoalId);
    setError('');
    try {
      const res = await api<{ goalId: string; transaction?: string; demoMode?: boolean }>(
        `/api/team-goals/${teamGoalId}/join`,
        { method: 'POST', body: {} }
      );
      if (!res.ok) throw new Error(res.data.error ?? 'Could not start staking');
      let signature: string;
      if (res.data.demoMode || !res.data.transaction) {
        signature = 'demo_tx_' + Date.now();
      } else {
        const tx = Transaction.from(Buffer.from(res.data.transaction, 'base64'));
        signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, 'confirmed');
      }
      const confirm = await fetch('/api/goals/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: res.data.goalId, signature }),
      });
      if (!confirm.ok) throw new Error('Stake could not be confirmed. Try again in a moment.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Staking failed');
    } finally {
      setStaking(null);
    }
  };

  const leaderboard = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data?.members ?? []) counts.set(m.wallet, 0);
    for (const g of data?.goals ?? [])
      for (const m of g.progress.members)
        if (m.status === 'completed') counts.set(m.wallet, (counts.get(m.wallet) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const inviteLink =
    typeof window !== 'undefined' && data ? `${window.location.origin}/teams?code=${data.team.invite_code}` : '';

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-3xl px-4 pt-28 pb-16 space-y-6">
        {!connected ? (
          <Card><CardContent className="py-8 flex flex-col items-center gap-4">
            <p className="text-muted-foreground">Connect your wallet to view this team.</p>
            <WalletButton />
          </CardContent></Card>
        ) : loading && !data ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {data && (
              <>
                <div className="flex items-center justify-between">
                  <h1 className="text-3xl font-bold">{data.team.name}</h1>
                  {data.isOwner && (
                    <Button asChild><Link href={`/teams/${id}/goals/new`}>New team goal</Link></Button>
                  )}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Invite teammates</CardTitle>
                    <CardDescription>Code: <code>{data.team.invite_code}</code></CardDescription>
                  </CardHeader>
                  <CardContent className="flex gap-2 items-center">
                    <code className="text-xs break-all flex-1">{inviteLink}</code>
                    <Button variant="outline" onClick={() => navigator.clipboard.writeText(inviteLink)}>Copy</Button>
                  </CardContent>
                </Card>

                {data.goals.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No team goals yet.</p>
                )}
                {data.goals.map((g) => (
                  <Card key={g.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2">
                        {g.title}
                        <Badge variant={g.status === 'open' ? 'default' : 'secondary'}>{g.status}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {g.stake_per_member} SOL each · due {new Date(g.deadline).toLocaleString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm">{g.description}</p>
                      <div className="h-2 rounded bg-muted overflow-hidden" aria-label="Completed members">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${g.progress.total ? (g.progress.completed / g.progress.total) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {g.progress.completed} of {g.progress.total} completed · {g.progress.staked} staked
                      </p>
                      <ul className="text-sm space-y-1">
                        {g.progress.members.map((m) => (
                          <li key={m.wallet} className="flex justify-between">
                            <span>{short(m.wallet)}{m.wallet === wallet ? ' (you)' : ''}</span>
                            <Badge variant="outline">{m.status.replace('_', ' ')}</Badge>
                          </li>
                        ))}
                      </ul>
                      {g.status === 'open' && new Date(g.deadline).getTime() > Date.now() &&
                        g.progress.members.find((m) => m.wallet === wallet)?.status === 'not_staked' && (
                          <Button onClick={() => stake(g.id)} disabled={staking === g.id}>
                            {staking === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `Stake ${g.stake_per_member} SOL`}
                          </Button>
                        )}
                      {g.progress.members.find((m) => m.wallet === wallet)?.status === 'awaiting_stake' && (
                        <Button onClick={() => stake(g.id)} disabled={staking === g.id}>Finish staking</Button>
                      )}
                    </CardContent>
                  </Card>
                ))}

                <Card>
                  <CardHeader><CardTitle>Leaderboard</CardTitle><CardDescription>Goals completed</CardDescription></CardHeader>
                  <CardContent>
                    <ol className="text-sm space-y-1">
                      {leaderboard.map(([w, n], i) => (
                        <li key={w} className="flex justify-between">
                          <span>{i + 1}. {short(w)}{w === wallet ? ' (you)' : ''}</span><span>{n}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
