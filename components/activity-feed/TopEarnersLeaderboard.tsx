'use client';

import { useEffect, useState } from 'react';
import { Trophy, TrendingUp, Loader2, Users, Crown } from 'lucide-react';
import { motion } from 'framer-motion';

interface LeaderboardEntry {
  wallet_address: string;
  total_earned: number;
  completed_goals: number;
  total_goals: number;
  success_rate: number;
}

export function TopEarnersLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/analytics/platform');
      if (response.ok) {
        const data = await response.json();
        if (data.leaderboard) {
          setLeaderboard(data.leaderboard.slice(0, 5));
        }
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getRankBadge = (index: number) => {
    const medals = ['🥇', '🥈', '🥉'];
    if (index < 3) return medals[index];
    return `#${index + 1}`;
  };

  const getRankGradient = (index: number) => {
    if (index === 0) return 'from-yellow-500/20 via-yellow-400/15 to-transparent border-l-yellow-500';
    if (index === 1) return 'from-gray-400/20 via-gray-300/15 to-transparent border-l-gray-400';
    if (index === 2) return 'from-orange-500/20 via-orange-400/15 to-transparent border-l-orange-500';
    return 'from-purple-500/10 via-transparent to-transparent border-l-purple-500/50';
  };

  return (
    <motion.div
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="relative min-h-[400px] p-6 rounded-xl backdrop-blur-sm bg-white/5 border border-white/10 border-l-4 border-l-purple-500 hover:shadow-2xl hover:shadow-purple-500/20 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-purple-500/15 flex items-center justify-center">
            <Crown className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Top Earners</h3>
            <p className="text-sm text-gray-400">Leaderboard</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400 mb-2">{error}</p>
          <button
            onClick={fetchLeaderboard}
            className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-gray-500" />
          </div>
          <p className="text-gray-400 mb-1">No earners yet</p>
          <p className="text-sm text-gray-500">Complete goals to get on the board!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((entry, index) => (
            <motion.div
              key={entry.wallet_address}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 rounded-lg backdrop-blur-sm bg-gradient-to-r ${getRankGradient(index)} border border-white/10 hover:bg-white/5 transition-all duration-200`}
            >
              <div className="flex items-center gap-3 mb-3">
                {/* Rank Badge */}
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-lg font-bold shrink-0">
                  {getRankBadge(index)}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-mono font-medium text-sm">
                    {truncateAddress(entry.wallet_address)}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                    <span>{entry.completed_goals || 0} goals</span>
                    <span className="text-gray-600">•</span>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      <span>{entry.success_rate || 0}%</span>
                    </div>
                  </div>
                </div>

                {/* Earnings */}
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                    {(entry.total_earned || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">SOL</p>
                </div>
              </div>

              {/* Success Rate Bar */}
              <div className="w-full bg-white/5 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${entry.success_rate || 0}%` }}
                ></div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Live indicator */}
      {!loading && leaderboard.length > 0 && (
        <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-white/10">
          <div className="h-2 w-2 bg-purple-400 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">Updates every 30s</span>
        </div>
      )}
    </motion.div>
  );
}
