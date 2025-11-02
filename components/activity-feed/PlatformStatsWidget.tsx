'use client';

import { useEffect, useState } from 'react';
import {
  DollarSign,
  Zap,
  TrendingUp,
  Users,
  CheckCircle,
  Send,
  Loader2,
  BarChart3
} from 'lucide-react';
import { motion } from 'framer-motion';

interface PlatformStats {
  total_staked: number;
  active_goals: number;
  success_rate: number;
  total_users: number;
  completed_goals: number;
  total_payouts: number;
}

export function PlatformStatsWidget() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/analytics/platform');
      if (response.ok) {
        const data = await response.json();
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Error fetching platform stats:', err);
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const statItems = stats ? [
    {
      label: 'Total Staked',
      value: `${(stats.total_staked || 0).toFixed(2)}`,
      unit: 'SOL',
      icon: DollarSign,
      color: 'text-green-400',
      bgColor: 'bg-green-500/15',
      borderColor: 'border-green-500/30',
    },
    {
      label: 'Active Goals',
      value: (stats.active_goals || 0).toString(),
      unit: '',
      icon: Zap,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/15',
      borderColor: 'border-yellow-500/30',
    },
    {
      label: 'Success Rate',
      value: `${stats.success_rate || 0}`,
      unit: '%',
      icon: TrendingUp,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/15',
      borderColor: 'border-purple-500/30',
    },
    {
      label: 'Total Users',
      value: (stats.total_users || 0).toString(),
      unit: '',
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/15',
      borderColor: 'border-blue-500/30',
    },
    {
      label: 'Completed',
      value: (stats.completed_goals || 0).toString(),
      unit: 'goals',
      icon: CheckCircle,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/15',
      borderColor: 'border-emerald-500/30',
    },
    {
      label: 'Total Payouts',
      value: `${(stats.total_payouts || 0).toFixed(2)}`,
      unit: 'SOL',
      icon: Send,
      color: 'text-pink-400',
      bgColor: 'bg-pink-500/15',
      borderColor: 'border-pink-500/30',
    },
  ] : [];

  return (
    <motion.div
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="relative min-h-[400px] p-6 rounded-xl backdrop-blur-sm bg-white/5 border border-white/10 border-l-4 border-l-blue-500 hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-500/15 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Platform Stats</h3>
            <p className="text-sm text-gray-400">Live metrics</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400 mb-2">{error}</p>
          <button
            onClick={fetchStats}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : !stats ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="h-8 w-8 text-gray-500" />
          </div>
          <p className="text-gray-400">No stats available</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {statItems.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className={`p-4 rounded-lg backdrop-blur-sm bg-white/5 border ${stat.borderColor} hover:bg-white/10 transition-all duration-200`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${stat.color} mb-1`}>
                    {stat.value}
                    {stat.unit && <span className="text-sm ml-1">{stat.unit}</span>}
                  </p>
                  <p className="text-xs text-gray-400">{stat.label}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Live indicator */}
      {!loading && stats && (
        <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-white/10">
          <div className="h-2 w-2 bg-blue-400 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">Updates every 30s</span>
        </div>
      )}
    </motion.div>
  );
}
