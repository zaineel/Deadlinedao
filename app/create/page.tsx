'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { Transaction } from '@solana/web3.js';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Rocket, Target, DollarSign, Calendar } from 'lucide-react';

export default function CreateGoalPage() {
  const router = useRouter();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    deadline: '',
    category: '',
    stakeAmount: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, category: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    setIsSubmitting(true);

    try {
      // Step 1: Create goal and get transaction
      const createResponse = await fetch('/api/goals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          walletAddress: publicKey.toString(),
        }),
      });

      const createData = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(createData.error || 'Failed to create goal');
      }

      const { goalId, transaction: serializedTransaction, demoMode } = createData;

      // If demo mode, skip blockchain transaction
      if (demoMode) {
        setSuccess('✅ Goal created in demo mode! (No blockchain transaction needed)');

        // Auto-confirm in demo mode
        await fetch('/api/goals/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goalId,
            signature: 'demo_tx_' + Date.now(),
          }),
        });

        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
        return;
      }

      // Step 2: Deserialize and sign transaction
      const transaction = Transaction.from(
        Buffer.from(serializedTransaction, 'base64')
      );

      // Send transaction
      const signature = await sendTransaction(transaction, connection);

      // Step 3: Wait for confirmation
      setSuccess('Transaction sent! Waiting for confirmation...');

      await connection.confirmTransaction(signature, 'confirmed');

      // Step 4: Confirm goal creation in database
      const confirmResponse = await fetch('/api/goals/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId,
          signature,
        }),
      });

      const confirmData = await confirmResponse.json();

      if (!confirmResponse.ok) {
        throw new Error(confirmData.error || 'Failed to confirm transaction');
      }

      setSuccess('Goal created successfully! Redirecting to dashboard...');

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);

    } catch (error: any) {
      console.error('Error creating goal:', error);

      // Show more helpful error messages
      let errorMessage = error.message || 'Failed to create goal. Please try again.';

      if (errorMessage.includes('insufficient') || errorMessage.includes('0x1')) {
        errorMessage = '❌ Insufficient SOL! You need devnet SOL to create goals. Get free SOL from: https://faucet.solana.com';
      }

      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Header />
      <div className="min-h-screen pt-24 pb-16" style={{ backgroundColor: "#0a0a0f" }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <motion.h1
              className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Create Your Goal
            </motion.h1>
            <motion.p
              className="text-gray-400 text-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Set a deadline, stake SOL, and let AI hold you accountable
            </motion.p>
          </div>

          {/* Wallet Connection Check */}
          {!connected ? (
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="text-center">
                <Rocket className="h-12 w-12 mx-auto mb-4 text-purple-400" />
                <CardTitle className="text-white">Connect Your Wallet</CardTitle>
                <CardDescription className="text-gray-400">
                  You need to connect your Solana wallet to create a goal and stake SOL
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center pt-4">
                <WalletButton className="!bg-gradient-to-r !from-purple-500 !via-pink-500 !to-purple-500" />
              </CardContent>
            </Card>
          ) : (
            <form onSubmit={handleSubmit}>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="pt-6 space-y-6">
                  {/* Title */}
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-white flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Goal Title
                    </Label>
                    <Input
                      id="title"
                      name="title"
                      value={formData.title}
                      onChange={handleChange}
                      placeholder="e.g., Complete my React project"
                      className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                      required
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-white">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      placeholder="Describe your goal in detail..."
                      className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 min-h-[120px]"
                      required
                    />
                  </div>

                  {/* Deadline */}
                  <div className="space-y-2">
                    <Label htmlFor="deadline" className="text-white flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Deadline
                    </Label>
                    <Input
                      id="deadline"
                      type="date"
                      name="deadline"
                      value={formData.deadline}
                      onChange={handleChange}
                      className="bg-gray-800/50 border-gray-700 text-white"
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>

                  {/* Category */}
                  <div className="space-y-2">
                    <Label className="text-white">Category</Label>
                    <Select onValueChange={handleSelectChange} required>
                      <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="learning">Learning</SelectItem>
                        <SelectItem value="work">Work</SelectItem>
                        <SelectItem value="health">Health</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Stake Amount */}
                  <div className="space-y-2">
                    <Label htmlFor="stakeAmount" className="text-white flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Stake Amount (SOL)
                    </Label>
                    <Input
                      id="stakeAmount"
                      type="number"
                      name="stakeAmount"
                      value={formData.stakeAmount}
                      onChange={handleChange}
                      placeholder="0.5"
                      step="0.01"
                      min="0.01"
                      className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                      required
                    />
                    <p className="text-xs text-gray-500">
                      Minimum: 0.01 SOL (devnet)
                    </p>
                  </div>

                  {/* Error/Success Messages */}
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {success && (
                    <Alert className="bg-green-900/20 border-green-900 text-green-400">
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all duration-300"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Goal...
                      </>
                    ) : (
                      'Create Goal & Stake SOL'
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Info Box */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 p-6 bg-blue-900/20 border border-blue-900/50 rounded-lg"
              >
                <h4 className="text-blue-400 font-semibold mb-3">How it works</h4>
                <ul className="text-sm text-gray-400 space-y-2">
                  <li>• Define your goal with a clear deadline</li>
                  <li>• Stake SOL as collateral to incentivize completion</li>
                  <li>• Submit proof of completion by the deadline</li>
                  <li>• AI validates your proof and you receive your stake + rewards</li>
                  <li>• Fail to complete? Your stake goes to the reward pool</li>
                </ul>
              </motion.div>
            </form>
          )}
        </motion.div>
      </div>
    </div>
    </>
  );
}
