'use client';

import { useEffect, useState } from 'react';
import { Trophy, Clock, Loader2, Target, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface CompletedGoal {
  id: string;
  title: string;
  description: string;
  category: string;
  stake_amount: number;
  wallet_address: string;
  created_at: string;
  deadline: string;
}

export function RecentCompletionsCard() {
  const [completions, setCompletions] = useState<CompletedGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchRecentCompletions = async () => {
    try {
      const response = await fetch('/api/platform-stats');
      if (response.ok) {
        const data = await response.json();
        if (data.recentCompletions) {
          setCompletions(data.recentCompletions.slice(0, 5));
        }
      }
    } catch (err) {
      console.error('Error fetching recent completions:', err);
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentCompletions();
    const interval = setInterval(fetchRecentCompletions, 15000);
    return () => clearInterval(interval);
  }, []);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      fitness: { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30' },
      learning: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
      health: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
      productivity: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
      finance: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    };
    return colors[category.toLowerCase()] || { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' };
  };

  return (
    <motion.div
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="relative min-h-[400px] p-6 rounded-xl backdrop-blur-sm bg-white/5 border border-white/10 border-l-4 border-l-green-500 hover:shadow-2xl hover:shadow-green-500/20 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Recent Wins</h3>
            <p className="text-sm text-gray-400">Latest completions</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-green-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400 mb-2">{error}</p>
          <button
            onClick={fetchRecentCompletions}
            className="text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : completions.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Target className="h-8 w-8 text-gray-500" />
          </div>
          <p className="text-gray-400 mb-1">No completions yet</p>
          <p className="text-sm text-gray-500">Be the first to complete a goal!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {completions.map((completion, index) => {
            const categoryColors = getCategoryColor(completion.category);
            return (
              <motion.div
                key={completion.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-4 rounded-lg backdrop-blur-sm bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium truncate mb-1">
                      {completion.title || completion.description}
                    </h4>
                    <p className="text-sm text-gray-400 font-mono">
                      {truncateAddress(completion.wallet_address)}
                    </p>
                  </div>
                  <span className={`ml-2 px-2 py-1 text-xs font-semibold ${categoryColors.bg} ${categoryColors.text} rounded-lg border ${categoryColors.border}`}>
                    {completion.category}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm mt-3">
                  <div className="flex items-center gap-1 text-gray-400">
                    <Clock className="h-3 w-3" />
                    <span className="text-xs">
                      {formatDistanceToNow(new Date(completion.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-green-400" />
                    <span className="text-green-400 font-semibold text-sm">
                      {completion.stake_amount || 0} SOL
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Live indicator */}
      {!loading && completions.length > 0 && (
        <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-white/10">
          <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">Updates every 15s</span>
        </div>
      )}
    </motion.div>
  );
}
