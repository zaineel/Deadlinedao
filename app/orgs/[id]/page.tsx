'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrgApi, lamportsToSol } from '@/components/orgs/use-org-api';

interface OrgView {
  id: string;
  name: string;
  isAdmin: boolean;
  inviteCode?: string;
  program: {
    matchRateBps: number;
    perMemberCapLamports: number;
    windowStart: string;
    windowEnd: string;
    fundedLamports?: number;
    remainingLamports?: number;
    withdrawnLamports?: number;
  } | null;
}

type Stats =
  | { suppressed: true; minGroupSize: number }
  | {
      suppressed: false;
      minGroupSize: number;
      consentingMembers: number;
      participants: number;
      completionRate: number | null;
      totalStakedLamports: number | null;
      totalMatchedLamports: number | null;
    };

export default function OrgDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { api, wallet } = useOrgApi();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [org, setOrg] = useState<OrgView | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [headcount, setHeadcount] = useState<{ total: number; consenting: number } | null>(null);
  const [amount, setAmount] = useState('1');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);

  const load = useCallback(async () => {
    if (!wallet) return;
    const list = await api('/api/orgs');
    const found = ((list.data.organizations as OrgView[]) ?? []).find((o) => o.id === id && o.isAdmin) ?? null;
    setOrg(found);
    setEnded(found?.program ? Date.now() > Date.parse(found.program.windowEnd) : false);
    if (!found) return;
    const [s, m] = await Promise.all([api(`/api/orgs/${id}/stats`), api(`/api/orgs/${id}/members`)]);
    if (s.ok) setStats(s.data.stats as Stats);
    if (m.ok) setHeadcount((m.data.headcount as { total: number; consenting: number }) ?? null);
  }, [api, wallet, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function fund() {
    if (!publicKey) return;
    setBusy(true);
    setMsg('');
    try {
      const addr = await api(`/api/orgs/${id}/fund`);
      if (!addr.ok) throw new Error('no escrow');
      const lamports = Math.round(Number(amount) * 1_000_000_000);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(addr.data.escrowAddress as string),
          lamports,
        })
      );
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      const r = await api(`/api/orgs/${id}/fund`, { method: 'POST', body: { signature } });
      setMsg(r.ok ? 'Pool funded.' : 'Funding sent, but could not be verified yet. Retry in a moment with the same transaction.');
      await load();
    } catch {
      setMsg('Funding failed or was cancelled.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    const r = await api(`/api/orgs/${id}/withdraw`, { method: 'POST' });
    setMsg(r.ok ? 'Withdrawal sent.' : String(r.data.error ?? 'Withdrawal failed'));
    setBusy(false);
    await load();
  }

  const p = org?.program;
  const inviteUrl = org?.inviteCode && typeof window !== 'undefined' ? `${window.location.origin}/orgs/join?code=${org.inviteCode}` : '';

  return (
    <>
      <Header />
      <div className="min-h-screen pt-24 pb-16" style={{ backgroundColor: '#0a0a0f' }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl space-y-6">
          {!wallet ? (
            <Card className="bg-gray-900/50 border-gray-800"><CardContent className="pt-6 flex justify-center"><WalletButton /></CardContent></Card>
          ) : !org || !p ? (
            <p className="text-gray-400">Organization not found, or you are not an administrator.</p>
          ) : (
            <>
              <h1 className="text-4xl font-bold text-white">{org.name}</h1>
              {msg && <p className="text-purple-300">{msg}</p>}

              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white">Sponsor pool</CardTitle>
                  <CardDescription className="text-gray-400">
                    Match {p.matchRateBps / 100}% of each completed goal, up to {lamportsToSol(p.perMemberCapLamports)} SOL per
                    member. Program {new Date(p.windowStart).toLocaleString()} to {new Date(p.windowEnd).toLocaleString()}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-gray-300">
                  <div>Funded {lamportsToSol(p.fundedLamports ?? 0)} SOL · Remaining {lamportsToSol(p.remainingLamports ?? 0)} SOL · Withdrawn {lamportsToSol(p.withdrawnLamports ?? 0)} SOL</div>
                  {!ended && (
                    <div className="flex gap-2">
                      <Input type="number" min="0.001" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-32" />
                      <Button onClick={fund} disabled={busy}>Fund pool</Button>
                    </div>
                  )}
                  <div>
                    <Button variant="outline" onClick={withdraw} disabled={busy || !ended}>Withdraw unspent balance</Button>
                    {!ended && <span className="ml-2 text-sm text-gray-500">Available after the program ends.</span>}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white">Invite employees</CardTitle>
                  <CardDescription className="text-gray-400">Share this link. Anyone with it can join.</CardDescription>
                </CardHeader>
                <CardContent><code className="break-all text-sm text-gray-300">{inviteUrl}</code></CardContent>
              </Card>

              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white">Program results (anonymous)</CardTitle>
                  <CardDescription className="text-gray-400">
                    Only employees who opted in are counted, and nothing is shown until at least 5 have opted in. You never
                    see individual goals, proofs or descriptions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-gray-300 grid gap-1">
                  {headcount && <div>{headcount.total} joined · {headcount.consenting} opted in to group statistics</div>}
                  {!stats ? null : stats.suppressed ? (
                    <div>Not enough opted-in members yet (minimum {stats.minGroupSize}).</div>
                  ) : (
                    <>
                      <div>Participating: {stats.participants} of {stats.consentingMembers}</div>
                      <div>Completion rate: {stats.completionRate === null ? 'hidden until 5 participants' : `${Math.round(stats.completionRate * 100)}%`}</div>
                      <div>Total staked: {stats.totalStakedLamports === null ? 'hidden' : `${lamportsToSol(stats.totalStakedLamports)} SOL`}</div>
                      <div>Total matched: {stats.totalMatchedLamports === null ? 'hidden' : `${lamportsToSol(stats.totalMatchedLamports)} SOL`}</div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
