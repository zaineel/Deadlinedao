'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useGovernanceApi } from '@/components/governance/use-governance-api';

type Vote = 'overturn' | 'uphold';

interface Assignment {
  disputeId: string;
  state: 'voting' | 'escalated' | 'admin' | 'resolved';
  votingEndsAt: string | null;
  owner: string;
  goal: { title: string; description: string };
  appeal: { reason: string; extraImageUrl: string | null };
  proof: {
    text: string;
    imageUrl: string | null;
    aiVerdict: string | null;
    aiConfidence: number | null;
    aiReasoning: string | null;
  } | null;
  myVote: Vote | null;
  result: { decision: Vote | null; tally: { overturn: number; uphold: number; cast: number } } | null;
}

interface Overview {
  assignments: Assignment[];
  stats: { votesCast: number; votesAgreed: number; votesMissed: number; agreementRate: number | null };
  rewards: Array<{ disputeId: string; amountLamports: number; status: string }>;
}

function AssignmentCard({ a, onVote }: { a: Assignment; onVote: (id: string, vote: Vote, reason: string) => Promise<string | null> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadedAt] = useState(() => Date.now());
  const open = a.state === 'voting' && a.votingEndsAt !== null && new Date(a.votingEndsAt).getTime() > loadedAt;

  const submit = async (vote: Vote) => {
    setBusy(true);
    setError('');
    const err = await onVote(a.disputeId, vote, reason);
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{a.goal.title}</CardTitle>
        <CardDescription>
          Appeal by {a.owner}
          {a.votingEndsAt && a.state === 'voting' ? ` · voting ends ${new Date(a.votingEndsAt).toLocaleString()}` : ''}
          {a.state !== 'voting' ? ` · ${a.state}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <strong>Goal:</strong> {a.goal.description}
        </p>
        {a.proof && (
          <div className="space-y-1">
            <p>
              <strong>Proof:</strong> {a.proof.text}
            </p>
            {a.proof.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.proof.imageUrl} alt="Submitted proof" className="max-h-64 rounded border" />
            )}
            <p>
              <strong>AI verdict:</strong> {a.proof.aiVerdict ?? 'n/a'}
              {a.proof.aiConfidence !== null ? ` (${a.proof.aiConfidence}% confidence)` : ''}
            </p>
            {a.proof.aiReasoning && <p className="text-muted-foreground">{a.proof.aiReasoning}</p>}
          </div>
        )}
        <p>
          <strong>Owner&apos;s appeal:</strong> {a.appeal.reason}
        </p>
        {a.appeal.extraImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.appeal.extraImageUrl} alt="Appeal evidence" className="max-h-64 rounded border" />
        )}

        {a.myVote && (
          <p>
            Your vote: <strong>{a.myVote}</strong> (sealed until the dispute resolves)
          </p>
        )}
        {a.result && (
          <p>
            Result: <strong>{a.result.decision ?? 'decided by admin'}</strong> · overturn {a.result.tally.overturn}, uphold{' '}
            {a.result.tally.uphold}
          </p>
        )}

        {open && !a.myVote && (
          <div className="space-y-2">
            <Input
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional short reason (kept private until resolution)"
            />
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => submit('overturn')}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Overturn (AI was wrong)'}
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => submit('uphold')}>
                Uphold (AI was right)
              </Button>
            </div>
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default function GovernancePage() {
  const { api, connected } = useGovernanceApi();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<Overview>('/api/governance');
      if (res.ok) setData(res.data);
      else setError(res.data.error ?? 'Failed to load assignments');
    } catch {
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const vote = async (disputeId: string, v: Vote, reason: string): Promise<string | null> => {
    const res = await api('/api/governance/votes', {
      method: 'POST',
      body: { disputeId, vote: v, ...(reason.trim() ? { reason: reason.trim() } : {}) },
    });
    if (!res.ok) return res.data.error ?? 'Could not record vote';
    await load();
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
        <h1 className="text-3xl font-bold">Governance</h1>
        <p className="text-muted-foreground">
          Panelists are drawn at random to review appealed AI rejections. Votes stay sealed until the dispute resolves.
        </p>

        {!connected && (
          <div className="space-y-2">
            <p>Connect your wallet to see your assignments.</p>
            <WalletButton />
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading && <Loader2 className="h-5 w-5 animate-spin" />}

        {data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>My stats</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                Votes cast: {data.stats.votesCast} · agreed with outcome: {data.stats.votesAgreed}
                {data.stats.agreementRate !== null ? ` (${Math.round(data.stats.agreementRate * 100)}%)` : ''} · missed:{' '}
                {data.stats.votesMissed}
                {data.rewards.length > 0 && (
                  <p className="mt-2 text-muted-foreground">
                    Rewards: {data.rewards.map((r) => `${(r.amountLamports / 1e9).toFixed(6)} SOL (${r.status})`).join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>

            <h2 className="text-xl font-semibold">My assignments</h2>
            {data.assignments.length === 0 && <p className="text-muted-foreground">No assignments right now.</p>}
            {data.assignments.map((a) => (
              <AssignmentCard key={a.disputeId} a={a} onVote={vote} />
            ))}
          </>
        )}
      </main>
    </div>
  );
}
