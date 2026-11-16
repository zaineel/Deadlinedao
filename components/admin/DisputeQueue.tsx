'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface DisputeItem {
  dispute: { id: string; reason: string; extra_image_url: string | null; bond_amount: number; created_at: string };
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
    ai_verdict: string | null;
    ai_confidence: number | null;
    ai_reasoning: string | null;
  } | null;
}

export function DisputeQueue({ adminKey }: { adminKey: string }) {
  const [items, setItems] = useState<DisputeItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hidden, setHidden] = useState(false);

  const headers = { 'x-admin-key': adminKey };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/disputes', { headers });
      if (res.status === 404) {
        setHidden(true); // feature flag is off
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load disputes');
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  };

  const resolve = async (disputeId: string, decision: 'overturn' | 'uphold') => {
    const label =
      decision === 'overturn'
        ? 'OVERTURN: complete the goal, return the stake and refund the bond'
        : 'UPHOLD: the goal fails and the bond is kept';
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;

    setBusyId(disputeId);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/disputes', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ disputeId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setNotice(data.noop ? 'Already resolved; nothing changed.' : `Dispute ${data.status}.`);
      setItems(prev => (prev ? prev.filter(i => i.dispute.id !== disputeId) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusyId(null);
    }
  };

  if (hidden) return null;

  return (
    <Card className="bg-gray-900/50 border-gray-800 mt-8">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          Dispute Queue
          <Button onClick={load} disabled={loading || !adminKey} variant="outline" size="sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2">{items ? 'Refresh' : 'Load'}</span>
          </Button>
        </CardTitle>
        <CardDescription>
          Appeals of AI rejections. Overturn returns the stake and refunds the bond; uphold fails the goal and keeps
          the bond.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4" aria-live="polite">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-green-400">{notice}</p>}
        {items && items.length === 0 && <p className="text-sm text-gray-400">No open disputes.</p>}

        {items?.map(({ dispute, goal, proof }) => (
          <div key={dispute.id} className="rounded-lg border border-gray-800 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <h3 className="text-white font-semibold">{goal.title}</h3>
              <div className="flex gap-2">
                <Badge variant="outline">{goal.stake_amount} SOL stake</Badge>
                <Badge variant="outline">{dispute.bond_amount} SOL bond</Badge>
              </div>
            </div>
            <p className="text-sm text-gray-400">{goal.description}</p>
            <p className="text-xs text-gray-500 break-all">Wallet: {goal.wallet_address}</p>

            <div className="rounded bg-gray-800/60 p-3">
              <p className="text-xs text-gray-500 mb-1">Appeal reason</p>
              <p className="text-sm text-gray-200 whitespace-pre-wrap">{dispute.reason}</p>
              {dispute.extra_image_url && (
                <a
                  href={dispute.extra_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-purple-400 hover:text-purple-300"
                >
                  View extra evidence
                </a>
              )}
            </div>

            {proof && (
              <div className="rounded bg-gray-800/60 p-3">
                <p className="text-xs text-gray-500 mb-1">
                  Contested proof (AI: {proof.ai_verdict ?? 'n/a'}, confidence {proof.ai_confidence ?? 'n/a'})
                </p>
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
                {proof.ai_reasoning && <p className="text-xs text-gray-400 mt-2">{proof.ai_reasoning}</p>}
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={() => resolve(dispute.id, 'overturn')} disabled={busyId === dispute.id} size="sm">
                {busyId === dispute.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span className="ml-2">Overturn</span>
              </Button>
              <Button
                onClick={() => resolve(dispute.id, 'uphold')}
                disabled={busyId === dispute.id}
                variant="destructive"
                size="sm"
              >
                <XCircle className="w-4 h-4" />
                <span className="ml-2">Uphold</span>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
