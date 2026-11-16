'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface AppealModalProps {
  goalId: string;
  goalTitle: string;
  bondAmount: number;
  escrowAddress: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/** Pay the 5% bond to escrow, then file the appeal with that transaction. */
export function AppealModal({
  goalId,
  goalTitle,
  bondAmount,
  escrowAddress,
  open,
  onOpenChange,
  onSuccess,
}: AppealModalProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!publicKey) return;
    if (reason.trim().length < 10) {
      setError('Please explain why the decision was wrong (at least 10 characters).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(escrowAddress),
          lamports: Math.ceil(bondAmount * LAMPORTS_PER_SOL),
        })
      );
      const bondSignature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(bondSignature, 'confirmed');

      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, reason: reason.trim(), bondSignature }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not file the appeal');
      onOpenChange(false);
      setReason('');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file the appeal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Appeal: {goalTitle}</DialogTitle>
          <DialogDescription>
            Filing requires a bond of {bondAmount} SOL (5% of your stake), sent to escrow. It is refunded if the
            appeal succeeds and kept if the decision is upheld.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="appeal-reason">Why was the decision wrong?</Label>
          <Textarea
            id="appeal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={5}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={submit} disabled={busy || !publicKey} className="w-full">
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Pay {bondAmount} SOL bond and appeal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
