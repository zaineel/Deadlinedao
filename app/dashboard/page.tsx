'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Header } from '@/components/header';
import { WalletButton } from '@/components/WalletButton';
import { SubmitProofModal } from '@/components/SubmitProofModal';
import { PrizePoolCard } from '@/components/PrizePoolCard';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Target, Calendar, DollarSign, CheckCircle2, Clock, XCircle, Trophy } from 'lucide-react';
import Link from 'next/link';
import { AppealModal } from '@/components/disputes/AppealModal';
import { useDisputes } from '@/components/disputes/useDisputes';

interface Goal {
  id: string;
  title: string;
  description: string;
  deadline: string;
  category: string;
  stake_amount: number;
  status: 'pending_validation' | 'active' | 'completed' | 'failed' | 'rejected_appealable' | 'disputed';
  appeal_deadline?: string | null;
  created_at: string;
  escrow_wallet: string;
  transaction_signature?: string;
}

export default function DashboardPage() {
  const { connected, publicKey } = useWallet();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [appealGoal, setAppealGoal] = useState<Goal | null>(null);
  const disputes = useDisputes(goals);

  useEffect(() => {
    if (connected && publicKey) {
      fetchGoals();
    } else {
      setLoading(false);
    }
  }, [connected, publicKey]);

  const fetchGoals = async () => {
    if (!publicKey) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/goals?wallet=${publicKey.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setGoals(data.goals || []);
      } else {
        setError('Failed to load goals');
      }
    } catch (err) {
      console.error('Error fetching goals:', err);
      setError('Failed to load goals');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Active</Badge>;
      case 'completed':
        return <Badge className="bg-green-500 hover:bg-green-600">Completed</Badge>;
      case 'failed':
        return <Badge className="bg-red-500 hover:bg-red-600">Failed</Badge>;
      case 'pending_validation':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending Validation</Badge>;
      case 'rejected_appealable':
        return <Badge className="bg-orange-500 hover:bg-orange-600">Rejected (appealable)</Badge>;
      case 'disputed':
        return <Badge className="bg-purple-500 hover:bg-purple-600">Under appeal</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Clock className="h-5 w-5 text-blue-400" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-400" />;
      default:
        return <Target className="h-5 w-5 text-gray-400" />;
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
          >
            {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              My Goals
            </h1>
            <p className="text-gray-400 text-lg">
              Track your progress and manage your accountability goals
            </p>
          </div>

          {/* Wallet Connection Check */}
          {!connected ? (
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="text-center">
                <Target className="h-12 w-12 mx-auto mb-4 text-purple-400" />
                <CardTitle className="text-white">Connect Your Wallet</CardTitle>
                <CardDescription className="text-gray-400">
                  Connect your wallet to view your goals
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center pt-4">
                <WalletButton className="!bg-gradient-to-r !from-purple-500 !via-pink-500 !to-purple-500" />
              </CardContent>
            </Card>
          ) : loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
          ) : error ? (
            <Card className="bg-red-900/20 border-red-900">
              <CardContent className="pt-6 text-center text-red-400">
                {error}
              </CardContent>
            </Card>
          ) : goals.length === 0 ? (
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="pt-12 pb-12 text-center">
                <Target className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                <h3 className="text-xl font-semibold text-white mb-2">No goals yet</h3>
                <p className="text-gray-400 mb-6">
                  Create your first goal to start your accountability journey
                </p>
                <Link href="/create">
                  <Button className="bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500">
                    Create Your First Goal
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Main Layout: Goals (2 cols) + Prize Pool (1 col) */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Goals Section - Takes 2 columns on large screens */}
                <div className="lg:col-span-2 grid gap-6 md:grid-cols-2 auto-rows-max">
                  {goals.map((goal, index) => (
                    <motion.div
                      key={goal.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="h-fit"
                    >
                      <Card className="bg-gray-900/50 border-gray-800 hover:border-purple-500/50 transition-colors">
                        <CardHeader>
                          <div className="flex items-start justify-between mb-2">
                            {getStatusIcon(goal.status)}
                            {getStatusBadge(goal.status)}
                          </div>
                          <CardTitle className="text-white">{goal.title}</CardTitle>
                          <CardDescription className="text-gray-400 line-clamp-2">
                            {goal.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {new Date(goal.deadline).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <DollarSign className="h-4 w-4" />
                            <span>{goal.stake_amount} SOL staked</span>
                          </div>
                          <div className="pt-2">
                            <Badge variant="outline" className="text-gray-400 border-gray-700">
                              {goal.category}
                            </Badge>
                          </div>
                          {goal.status === 'active' && (
                            <Button
                              onClick={() => {
                                setSelectedGoal(goal);
                                setProofModalOpen(true);
                              }}
                              className="w-full mt-4 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500"
                            >
                              Submit Proof
                            </Button>
                          )}
                          {disputes.enabled && (() => {
                            const quote = disputes.appealable.find(a => a.goalId === goal.id);
                            const dispute = disputes.disputes.find(d => d.goalId === goal.id);
                            if (goal.status === 'rejected_appealable' && quote) {
                              const hoursLeft = Math.max(
                                0,
                                Math.ceil((new Date(quote.appealDeadline).getTime() - Date.now()) / 3_600_000)
                              );
                              return (
                                <div className="pt-2 space-y-2">
                                  <p className="text-xs text-orange-300">
                                    Appeal window closes in about {hoursLeft}h. Bond: {quote.bondAmount} SOL.
                                  </p>
                                  {disputes.needsSignIn ? (
                                    <Button variant="outline" className="w-full" onClick={() => disputes.signIn()}>
                                      Sign in to appeal
                                    </Button>
                                  ) : (
                                    <Button variant="outline" className="w-full" onClick={() => setAppealGoal(goal)}>
                                      Appeal decision
                                    </Button>
                                  )}
                                </div>
                              );
                            }
                            if (goal.status === 'rejected_appealable' && disputes.needsSignIn) {
                              return (
                                <Button variant="outline" className="w-full mt-2" onClick={() => disputes.signIn()}>
                                  Sign in to appeal
                                </Button>
                              );
                            }
                            if (dispute) {
                              return (
                                <p className="text-xs text-gray-400 pt-2">
                                  Appeal {dispute.status === 'open' ? 'under review' : dispute.status}
                                  {' '}(bond {dispute.bondAmount} SOL)
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {/* Prize Pools Section - Takes 1 column on large screens */}
                <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-24 lg:self-start">
                  {(() => {
                    // Get unique deadlines from active goals
                    const activeGoals = goals.filter(g => g.status === 'active');
                    const uniqueDeadlines = Array.from(
                      new Set(
                        activeGoals.map(g => new Date(g.deadline).toISOString().split('T')[0])
                      )
                    );

                    if (uniqueDeadlines.length === 0) {
                      return (
                        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-8 text-center">
                          <Trophy className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                          <p className="text-gray-400 text-sm">
                            No active prize pools yet
                          </p>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="mb-4">
                          <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Trophy className="h-5 w-5 text-yellow-400" />
                            Prize Pools
                          </h2>
                          <p className="text-sm text-gray-400 mt-1">
                            Compete with others in your deadline group
                          </p>
                        </div>
                        {uniqueDeadlines.map((deadline, index) => (
                          <motion.div
                            key={deadline}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                          >
                            <PrizePoolCard
                              deadline={deadline}
                              userWallet={publicKey?.toString()}
                            />
                          </motion.div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            </>
          )}

          {/* Stats Summary */}
          {connected && goals.length > 0 && (
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-400">Active Goals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {goals.filter(g => g.status === 'active').length}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-400">Total Staked</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {goals.reduce((sum, g) => sum + g.stake_amount, 0).toFixed(2)} SOL
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-400">Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {goals.filter(g => g.status === 'completed').length}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {appealGoal && disputes.escrowAddress && (() => {
            const quote = disputes.appealable.find(a => a.goalId === appealGoal.id);
            return quote ? (
              <AppealModal
                goalId={appealGoal.id}
                goalTitle={appealGoal.title}
                bondAmount={quote.bondAmount}
                escrowAddress={disputes.escrowAddress!}
                open={!!appealGoal}
                onOpenChange={(o) => { if (!o) setAppealGoal(null); }}
                onSuccess={fetchGoals}
              />
            ) : null;
          })()}

          {/* Proof Submission Modal */}
          {selectedGoal && (
            <SubmitProofModal
              goalId={selectedGoal.id}
              goalTitle={selectedGoal.title}
              open={proofModalOpen}
              onOpenChange={setProofModalOpen}
              onSuccess={fetchGoals}
            />
          )}
        </motion.div>
      </div>
    </div>
    </>
  );
}
