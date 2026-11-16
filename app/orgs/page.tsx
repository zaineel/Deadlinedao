'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrgApi, lamportsToSol } from '@/components/orgs/use-org-api';

interface OrgSummary {
  id: string;
  name: string;
  isAdmin: boolean;
  program: { windowStart: string; windowEnd: string; remainingLamports?: number } | null;
  membership: { consent: boolean } | null;
}

export default function OrgsPage() {
  const { api, wallet } = useOrgApi();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', rate: '50', cap: '0.5', start: '', end: '' });

  const load = useCallback(async () => {
    if (!wallet) return;
    const r = await api('/api/orgs');
    if (r.ok) setOrgs((r.data.organizations as OrgSummary[]) ?? []);
    else setError('Failed to load organizations');
  }, [api, wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await api('/api/orgs', {
      method: 'POST',
      body: {
        name: form.name,
        matchRatePercent: Number(form.rate),
        perMemberCapSol: Number(form.cap),
        windowStart: new Date(form.start).toISOString(),
        windowEnd: new Date(form.end).toISOString(),
      },
    });
    setBusy(false);
    if (!r.ok) {
      setError('Could not create the organization. Check the values and try again.');
      return;
    }
    setForm({ ...form, name: '' });
    await load();
  }

  return (
    <>
      <Header />
      <div className="min-h-screen pt-24 pb-16" style={{ backgroundColor: '#0a0a0f' }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl space-y-6">
          <h1 className="text-4xl font-bold text-white">Organizations</h1>
          {!wallet ? (
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="pt-6 flex justify-center">
                <WalletButton />
              </CardContent>
            </Card>
          ) : (
            <>
              {error && <p className="text-red-400">{error}</p>}
              {orgs.map((o) => (
                <Card key={o.id} className="bg-gray-900/50 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white">{o.name}</CardTitle>
                    <CardDescription className="text-gray-400">
                      {o.isAdmin ? 'You administer this organization' : 'You are a member'}
                      {o.program && ` · program ${new Date(o.program.windowStart).toLocaleDateString()} to ${new Date(o.program.windowEnd).toLocaleDateString()}`}
                      {o.isAdmin && o.program?.remainingLamports !== undefined && ` · pool ${lamportsToSol(o.program.remainingLamports)} SOL left`}
                    </CardDescription>
                  </CardHeader>
                  {o.isAdmin && (
                    <CardContent>
                      <Link href={`/orgs/${o.id}`}>
                        <Button variant="outline">Open dashboard</Button>
                      </Link>
                    </CardContent>
                  )}
                </Card>
              ))}

              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white">Start a wellness program</CardTitle>
                  <CardDescription className="text-gray-400">
                    Match your employees&apos; stakes from a sponsor pool. You only ever see opt-in, aggregate results.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={create} className="grid gap-3 text-gray-300">
                    <label className="grid gap-1 text-sm">
                      Organization name
                      <Input required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1 text-sm">
                        Match rate (% of stake)
                        <Input required type="number" min="0.01" max="100" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Cap per member (SOL)
                        <Input required type="number" min="0.0001" step="0.0001" value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })} />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Program starts
                        <Input required type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Program ends
                        <Input required type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
                      </label>
                    </div>
                    <Button type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create organization'}</Button>
                  </form>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
