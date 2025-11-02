'use client';

import { useState } from 'react';
import { Header } from '@/components/header';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Coins,
  TrendingUp,
  Users,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Zap,
  DollarSign,
  Target
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PreviewData {
  preview: boolean;
  deadline: string;
  stats: {
    totalGoals: number;
    completed: number;
    failed: number;
    active: number;
    totalCompletedStake: number;
    totalFailedStake: number;
  };
  distribution: Array<{
    goalId: string;
    wallet: string;
    description: string;
    originalStake: number;
    rewardAmount: number;
    proportion: string;
  }>;
  canDistribute: boolean;
  note: string;
}

interface DistributionResult {
  success: boolean;
  message: string;
  stats: {
    deadline: string;
    totalGoals: number;
    completed: number;
    failed: number;
    active: number;
    totalCompletedStake: number;
    totalFailedStake: number;
    rewardsDistributed: number;
  };
  distribution: {
    successfulPayouts: number;
    failedPayouts: number;
    totalWinnersStake: number;
    totalLosersStake: number;
  };
  rewards: Array<{
    goalId: string;
    goalDescription: string;
    wallet: string;
    originalStake: number;
    rewardAmount: number;
    totalPayout: number;
    proportion: string;
    status: string;
    signature: string | null;
    error: string | null;
  }>;
  errors: string[] | null;
  solanaExplorer: string[];
}

export default function AdminPage() {
  const [deadline, setDeadline] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<DistributionResult | null>(null);
  const [error, setError] = useState('');

  const handlePreview = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(`/api/admin/trigger-rewards?deadline=${deadline}`);
      const data = await response.json();

      if (response.ok) {
        setPreview(data);
      } else {
        setError(data.error || 'Failed to fetch preview');
      }
    } catch (err) {
      console.error('Preview error:', err);
      setError('Failed to fetch preview');
    } finally {
      setLoading(false);
    }
  };

  const handleDistribute = async () => {
    if (!confirm(`Are you sure you want to distribute rewards for ${deadline}? This will execute real Solana transactions.`)) {
      return;
    }

    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const response = await fetch('/api/admin/trigger-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadline }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || 'Failed to distribute rewards');
      }
    } catch (err) {
      console.error('Distribution error:', err);
      setError('Failed to distribute rewards');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0f' }}>
      <Header />

      <main className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
              <Zap className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-purple-300 font-medium">Admin Panel</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Reward Distribution
              </span>
            </h1>

            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Trigger Phase 2 reward distribution - distribute stakes from failed goals to successful completers
            </p>
          </motion.div>

          {/* Input Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-gray-900/50 border-gray-800 mb-6">
              <CardHeader>
                <CardTitle className="text-white">Select Deadline</CardTitle>
                <CardDescription>
                  Choose the deadline date to process reward distribution
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="deadline" className="text-gray-300">Deadline Date</Label>
                    <Input
                      id="deadline"
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handlePreview}
                      disabled={loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4 mr-2" />
                      )}
                      Preview
                    </Button>

                    <Button
                      onClick={handleDistribute}
                      disabled={loading}
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4 mr-2" />
                      )}
                      Distribute Rewards
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Error Alert */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <Alert className="bg-red-900/20 border-red-500/50">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertTitle className="text-red-300">Error</AlertTitle>
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Preview Results */}
          {preview && !result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Total Goals</p>
                        <p className="text-2xl font-bold text-white">{preview.stats.totalGoals}</p>
                      </div>
                      <Target className="w-8 h-8 text-blue-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Completed</p>
                        <p className="text-2xl font-bold text-green-400">{preview.stats.completed}</p>
                      </div>
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Failed</p>
                        <p className="text-2xl font-bold text-red-400">{preview.stats.failed}</p>
                      </div>
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">To Distribute</p>
                        <p className="text-2xl font-bold text-purple-400">
                          {preview.stats.totalFailedStake.toFixed(3)} SOL
                        </p>
                      </div>
                      <Coins className="w-8 h-8 text-purple-400" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Distribution Preview */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Distribution Preview
                  </CardTitle>
                  <CardDescription>{preview.note}</CardDescription>
                </CardHeader>
                <CardContent>
                  {preview.canDistribute ? (
                    <div className="space-y-3">
                      {preview.distribution.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700"
                        >
                          <div className="flex-1">
                            <p className="text-white font-medium mb-1">{item.description}</p>
                            <p className="text-sm text-gray-400 font-mono">{item.wallet}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-400">Stake: {item.originalStake} SOL</p>
                            <p className="text-lg font-bold text-green-400">
                              +{item.rewardAmount.toFixed(4)} SOL
                            </p>
                            <p className="text-xs text-gray-500">{item.proportion}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Alert className="bg-yellow-900/20 border-yellow-500/50">
                      <AlertCircle className="h-4 w-4 text-yellow-400" />
                      <AlertTitle className="text-yellow-300">Cannot Distribute</AlertTitle>
                      <AlertDescription className="text-yellow-200">{preview.note}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Distribution Results */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Success Alert */}
              <Alert className="bg-green-900/20 border-green-500/50">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <AlertTitle className="text-green-300">Success!</AlertTitle>
                <AlertDescription className="text-green-200">{result.message}</AlertDescription>
              </Alert>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Successful</p>
                        <p className="text-2xl font-bold text-green-400">
                          {result.distribution.successfulPayouts}
                        </p>
                      </div>
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Failed</p>
                        <p className="text-2xl font-bold text-red-400">
                          {result.distribution.failedPayouts}
                        </p>
                      </div>
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Total Distributed</p>
                        <p className="text-2xl font-bold text-purple-400">
                          {result.stats.rewardsDistributed.toFixed(3)} SOL
                        </p>
                      </div>
                      <DollarSign className="w-8 h-8 text-purple-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Winners</p>
                        <p className="text-2xl font-bold text-blue-400">
                          {result.stats.completed}
                        </p>
                      </div>
                      <Users className="w-8 h-8 text-blue-400" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Results */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Coins className="w-5 h-5" />
                    Distribution Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {result.rewards.map((reward, index) => (
                      <div
                        key={index}
                        className="p-4 bg-gray-800/50 rounded-lg border border-gray-700"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <p className="text-white font-medium mb-1">{reward.goalDescription}</p>
                            <p className="text-sm text-gray-400 font-mono">{reward.wallet}</p>
                          </div>
                          <Badge
                            className={
                              reward.status === 'success'
                                ? 'bg-green-500 hover:bg-green-600'
                                : 'bg-red-500 hover:bg-red-600'
                            }
                          >
                            {reward.status}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-gray-500">Original Stake</p>
                            <p className="text-sm text-white">{reward.originalStake} SOL</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Reward</p>
                            <p className="text-sm text-green-400">
                              +{reward.rewardAmount.toFixed(4)} SOL
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Proportion</p>
                            <p className="text-sm text-blue-400">{reward.proportion}</p>
                          </div>
                        </div>

                        {reward.signature && (
                          <a
                            href={`https://explorer.solana.com/tx/${reward.signature}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
                          >
                            View on Solana Explorer
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        {reward.error && (
                          <p className="text-sm text-red-400 mt-2">Error: {reward.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
