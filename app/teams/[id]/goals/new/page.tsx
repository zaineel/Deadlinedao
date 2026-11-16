'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useTeamsApi } from '@/components/teams/use-teams-api';

export default function NewTeamGoalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { api, connected } = useTeamsApi();
  const [form, setForm] = useState({ title: '', description: '', deadline: '', category: '', stakePerMember: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/api/team-goals', {
        method: 'POST',
        body: { ...form, teamId: id, deadline: new Date(form.deadline).toISOString() },
      });
      if (res.ok) router.push(`/teams/${id}`);
      else setError(res.data.error ?? 'Failed to create team goal');
    } catch {
      setError('Failed to create team goal');
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
            <CardTitle>New team goal</CardTitle>
            <CardDescription>
              Every member stakes the same amount. Members who fail forfeit into the team pool,
              shared among teammates who complete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!connected ? (
              <div className="flex flex-col items-center gap-4 py-4"><WalletButton /></div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={form.title} onChange={set('title')} maxLength={100} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" value={form.description} onChange={set('description')} maxLength={1000} required />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="learning">Learning</SelectItem>
                      <SelectItem value="work">Work</SelectItem>
                      <SelectItem value="health">Health</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline</Label>
                  <Input id="deadline" type="datetime-local" value={form.deadline} onChange={set('deadline')} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stake">Stake per member (SOL)</Label>
                  <Input id="stake" type="number" step="0.0001" min="0.0001" value={form.stakePerMember} onChange={set('stakePerMember')} required />
                </div>
                <Button type="submit" disabled={busy || !form.category}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create team goal'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
