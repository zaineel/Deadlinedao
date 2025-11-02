'use client';

import { motion } from 'framer-motion';
import { RecentCompletionsCard } from './RecentCompletionsCard';
import { TopEarnersLeaderboard } from './TopEarnersLeaderboard';
import { PlatformStatsWidget } from './PlatformStatsWidget';

export function ActivityFeedSection() {
  return (
    <section
      className="py-20 px-4 relative overflow-hidden"
      style={{ backgroundColor: '#0a0a0f' }}
    >
      {/* Background gradient effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto max-w-7xl relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-white mb-4">
            Live Activity
          </h2>
          <p className="text-gray-400 text-lg max-w-3xl mx-auto">
            Real-time platform activity. See recent completions, top earners, and live metrics.
          </p>
        </motion.div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Recent Completions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <RecentCompletionsCard />
          </motion.div>

          {/* Top Earners Leaderboard */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <TopEarnersLeaderboard />
          </motion.div>

          {/* Platform Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <PlatformStatsWidget />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
