'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface ReviewItem {
  goal: {
    id: string;
    title: string;
    description: string;
    wallet_address: string;
    stake_amount: number;
    deadline: string;
  };
  proof: {
    text_description: string;
    image_url: string | null;
    submitted_at: string;
    ai_verdict: string | null;
    ai_confidence: number | null;
    quality_score: number | null;
    ai_reasoning: string | null;
  };
}

export function ReviewQueue({ adminKey }: { adminKey: string }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const headers = { 'x-admin-key': adminKey };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/review', { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load review queue');
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  };

  const decide = async (goalId: string, decision: 'approve' | 'reject') => {
    const label = decision === 'approve' ? 'approve and RETURN the stake' : 'reject (stake is forfeited)';
    if (!window.confirm(`Are you sure you want to ${label} for this goal?`)) return;

    setBusyId(goalId);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/review', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setNotice(decision === 'approve' ? 'Approved and stake returned.' : 'Rejected.');
      setItems(prev => (prev ? prev.filter(i => i.goal.id !== goalId) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="bg-gray-900/50 border-gray-800 mt-8">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          Manual Review Queue
          <Button onClick={load} disabled={loading || !adminKey} variant="outline" size="sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2">{items ? 'Refresh' : 'Load'}</span>
          </Button>
        </CardTitle>
        <CardDescription>
          Proofs the AI could not decide on. Approve to return the stake; reject to forfeit it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4" aria-live="polite">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-green-400">{notice}</p>}
        {items && items.length === 0 && <p className="text-sm text-gray-400">Nothing waiting for review.</p>}

        {items?.map(({ goal, proof }) => (
          <div key={goal.id} className="rounded-lg border border-gray-800 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <h3 className="text-white font-semibold">{goal.title}</h3>
              <Badge variant="outline">{goal.stake_amount} SOL</Badge>
            </div>
            <p className="text-sm text-gray-400">{goal.description}</p>
            <p className="text-xs text-gray-500 break-all">
              Wallet: {goal.wallet_address} · Deadline: {new Date(goal.deadline).toLocaleDateString()}
            </p>

            <div className="rounded bg-gray-800/60 p-3">
              <p className="text-xs text-gray-500 mb-1">Submitted proof</p>
              <p className="text-sm text-gray-200 whitespace-pre-wrap">{proof.text_description}</p>
              {proof.image_url && (
                <a
                  href={proof.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-purple-400 hover:text-purple-300"
                >
                  View attached image
                </a>
              )}
            </div>

            <p className="text-xs text-gray-500">
              AI: {proof.ai_verdict ?? 'n/a'} · confidence {proof.ai_confidence ?? 'n/a'} · quality{' '}
              {proof.quality_score ?? 'n/a'}
            </p>
            {proof.ai_reasoning && <p className="text-xs text-gray-400">{proof.ai_reasoning}</p>}

            <div className="flex gap-3">
              <Button onClick={() => decide(goal.id, 'approve')} disabled={busyId === goal.id} size="sm">
                {busyId === goal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span className="ml-2">Approve</span>
              </Button>
              <Button
                onClick={() => decide(goal.id, 'reject')}
                disabled={busyId === goal.id}
                variant="destructive"
                size="sm"
              >
                <XCircle className="w-4 h-4" />
                <span className="ml-2">Reject</span>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
