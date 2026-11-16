'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Users, DollarSign, TrendingUp, Target } from 'lucide-react';

interface PrizePoolData {
  deadline: string;
  statistics: {
    totalGoals: number;
    activeGoals: number;
    completedGoals: number;
    failedGoals: number;
  };
  prizePool: {
    totalPrizePool: number;
    totalActiveStakes: number;
    totalPotential: number;
  };
  competition: {
    totalCompetitors: number;
    competitors: Array<{
      wallet: string;
      totalStake: number;
      goalCount: number;
      minPayout: number;
      maxPayout: number;
    }>;
  };
  goals: {
    active: Array<{
      id: string;
      title: string;
      wallet: string;
      stake: number;
      category: string;
    }>;
    completed: number;
    failed: number;
  };
}

interface PrizePoolCardProps {
  deadline: string;
  userWallet?: string;
}

export function PrizePoolCard({ deadline, userWallet }: PrizePoolCardProps) {
  const [prizeData, setPrizeData] = useState<PrizePoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPrizePool();
  }, [deadline]);

  const fetchPrizePool = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/prize-pool?deadline=${deadline}`);

      if (!response.ok) {
        throw new Error('Failed to fetch prize pool');
      }

      const data = await response.json();
      setPrizeData(data);
    } catch (err) {
      console.error('Error fetching prize pool:', err);
      setError('Failed to load prize pool data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-500/30">
        <CardContent className="pt-6">
          <p className="text-gray-400 text-center">Loading prize pool...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !prizeData) {
    return null;
  }

  // Find user's position if they're competing
  const userCompetitor = prizeData.competition.competitors.find(
    c => c.wallet === userWallet
  );

  // Don't show if no active competition
  if (prizeData.statistics.activeGoals === 0 || prizeData.competition.totalCompetitors === 0) {
    return null;
  }

  return (
    <Card className="bg-gray-900/50 border-gray-800 hover:border-purple-500/50 transition-all duration-300 shadow-xl">
      <CardHeader className="border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-lg">
              <Trophy className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <CardTitle className="text-xl text-white">Prize Pool Competition</CardTitle>
              <CardDescription className="text-gray-500 text-sm mt-1">
                {new Date(deadline).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </CardDescription>
            </div>
          </div>
          <Badge className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border-purple-500/50 px-3 py-1">
            {prizeData.competition.totalCompetitors} {prizeData.competition.totalCompetitors === 1 ? 'Player' : 'Players'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {/* Prize Pool Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-4 text-center hover:border-green-500/50 transition-colors">
            <DollarSign className="h-5 w-5 text-green-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-green-400 mb-1">
              {prizeData.prizePool.totalPotential.toFixed(3)}
            </p>
            <p className="text-xs text-gray-400 font-medium">Total Pool SOL</p>
          </div>

          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-xl p-4 text-center hover:border-blue-500/50 transition-colors">
            <Users className="h-5 w-5 text-blue-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-blue-400 mb-1">
              {prizeData.competition.totalCompetitors}
            </p>
            <p className="text-xs text-gray-400 font-medium">Competitors</p>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-4 text-center hover:border-purple-500/50 transition-colors">
            <TrendingUp className="h-5 w-5 text-purple-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-purple-400 mb-1">
              {prizeData.statistics.activeGoals}
            </p>
            <p className="text-xs text-gray-400 font-medium">Active Goals</p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700/50 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-300 flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
              Failed Stakes (Prize)
            </span>
            <span className="text-yellow-400 font-bold text-lg">
              {prizeData.prizePool.totalPrizePool.toFixed(4)} SOL
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-300 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Active Stakes
            </span>
            <span className="text-blue-400 font-bold text-lg">
              {prizeData.prizePool.totalActiveStakes.toFixed(4)} SOL
            </span>
          </div>
          <div className="border-t border-gray-600 pt-3 flex justify-between items-center">
            <span className="text-base text-white font-semibold flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Total Potential
            </span>
            <span className="text-green-400 font-bold text-xl">
              {prizeData.prizePool.totalPotential.toFixed(4)} SOL
            </span>
          </div>
        </div>

        {/* User's Potential */}
        {userCompetitor && (
          <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 border-2 border-purple-500/50 rounded-xl p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Trophy className="h-4 w-4 text-purple-400" />
              </div>
              <p className="text-sm text-purple-300 font-bold">YOUR POTENTIAL PAYOUT</p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
                <p className="text-xs text-gray-400 mb-1">Minimum</p>
                <p className="text-xl text-white font-bold">
                  {userCompetitor.minPayout.toFixed(4)}
                </p>
                <p className="text-xs text-gray-500 mt-1">If all win</p>
              </div>
              <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 rounded-lg p-3 border border-green-500/50">
                <p className="text-xs text-green-400 mb-1">Maximum</p>
                <p className="text-xl text-green-400 font-bold">
                  {userCompetitor.maxPayout.toFixed(4)}
                </p>
                <p className="text-xs text-green-300 mt-1">If only you win</p>
              </div>
            </div>
            <div className="bg-gray-900/40 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-400">
                Your stake: <span className="text-purple-300 font-semibold">{userCompetitor.totalStake.toFixed(4)} SOL</span> across <span className="text-purple-300 font-semibold">{userCompetitor.goalCount}</span> goal(s)
              </p>
            </div>
          </div>
        )}

        {/* Competitors List */}
        <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-400" />
              <h4 className="text-base font-bold text-white">Leaderboard</h4>
            </div>
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/50">
              {prizeData.competition.totalCompetitors} {prizeData.competition.totalCompetitors === 1 ? 'Player' : 'Players'}
            </Badge>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
            {prizeData.competition.competitors.map((competitor, index) => {
              const isCurrentUser = competitor.wallet === userWallet;

              return (
                <div
                  key={competitor.wallet}
                  className={`flex items-center justify-between p-4 rounded-xl transition-all duration-200 ${
                    isCurrentUser
                      ? 'bg-gradient-to-r from-purple-900/60 to-pink-900/60 border-2 border-purple-500/70 shadow-lg shadow-purple-500/20'
                      : 'bg-gray-800/40 border border-gray-700/30 hover:border-gray-600/50 hover:bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Rank Badge */}
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shadow-md ${
                        index === 0
                          ? 'bg-gradient-to-br from-yellow-500/30 to-orange-500/30 text-yellow-400 border-2 border-yellow-500/60'
                          : index === 1
                          ? 'bg-gradient-to-br from-gray-400/20 to-gray-500/20 text-gray-300 border-2 border-gray-500/50'
                          : index === 2
                          ? 'bg-gradient-to-br from-orange-800/20 to-orange-900/20 text-orange-400 border-2 border-orange-600/50'
                          : 'bg-gray-700/30 text-gray-400 border border-gray-600/50'
                      }`}
                    >
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </div>

                    {/* User Info */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className={`text-sm font-mono font-semibold ${isCurrentUser ? 'text-purple-200' : 'text-gray-200'}`}>
                          {competitor.wallet.slice(0, 6)}...{competitor.wallet.slice(-6)}
                        </p>
                        {isCurrentUser && (
                          <Badge className="bg-purple-500/30 text-purple-200 border-purple-400/50 text-xs px-2 py-0.5">
                            YOU
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {competitor.goalCount} {competitor.goalCount !== 1 ? 'goals' : 'goal'} • {((competitor.totalStake / prizeData.prizePool.totalActiveStakes) * 100).toFixed(1)}% of pool
                      </p>
                    </div>
                  </div>

                  {/* Stake Amount */}
                  <div className="text-right">
                    <p className={`text-lg font-bold ${isCurrentUser ? 'text-purple-300' : 'text-green-400'}`}>
                      {competitor.totalStake.toFixed(3)}
                    </p>
                    <p className="text-xs text-gray-400">SOL</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Goals in Competition */}
        {prizeData.goals.active.length > 0 && (
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-700/50 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-400" />
                <h4 className="text-base font-bold text-white">Active Goals</h4>
              </div>
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/50">
                {prizeData.goals.active.length} Goals
              </Badge>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {prizeData.goals.active.map((goal) => {
                const isUserGoal = goal.wallet === userWallet;

                return (
                  <div
                    key={goal.id}
                    className={`p-3 rounded-lg transition-all duration-200 ${
                      isUserGoal
                        ? 'bg-purple-900/40 border border-purple-500/40 shadow-md'
                        : 'bg-gray-800/30 border border-gray-700/30 hover:border-gray-600/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate mb-2 ${isUserGoal ? 'text-purple-200' : 'text-gray-200'}`}>
                          {goal.title}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs px-2 py-0.5 ${isUserGoal ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' : 'text-gray-400 border-gray-600'}`}>
                            {goal.category}
                          </Badge>
                          <span className="text-gray-500 font-mono text-xs">
                            {goal.wallet.slice(0, 4)}...{goal.wallet.slice(-4)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-base font-bold ${isUserGoal ? 'text-purple-300' : 'text-green-400'}`}>
                          {goal.stake}
                        </p>
                        <p className="text-xs text-gray-500">SOL</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Competition Note */}
        <div className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border border-blue-500/40 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <span className="text-2xl">💡</span>
            </div>
            <div>
              <p className="text-sm text-blue-200 font-semibold mb-1">How Prize Pools Work</p>
              <p className="text-xs text-blue-300/80 leading-relaxed">
                All goals with the same deadline compete together. When you complete your goal, you get your stake back PLUS a proportional share of all failed stakes based on your contribution to the pool.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
