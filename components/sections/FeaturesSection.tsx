"use client"

import { motion } from "framer-motion"
import { Bot, DollarSign, Cloud, Check } from "lucide-react"

export function FeaturesSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  }

  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut",
      },
    },
  }

  return (
    <section className="py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-white mb-4">Powered by Cutting-Edge Technology</h2>
          <p className="text-xl text-gray-400">Built on Solana, validated by Snowflake AI, secured by Cloudflare</p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-8"
        >
          {/* Card 1: AI-Powered Validation */}
          <motion.div
            variants={cardVariants}
            className="relative min-h-[450px] p-8 rounded-2xl backdrop-blur-xl bg-white/5 border border-cyan-500/30 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] group"
          >
            <div className="absolute top-4 right-4">
              <span className="px-3 py-1 text-xs font-bold rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                PRIMARY
              </span>
            </div>

            <div className="mb-6">
              <div className="w-16 h-16 rounded-xl bg-cyan-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Bot className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">AI-Powered Validation</h3>
              <p className="text-gray-400 mb-6">5-layer validation pipeline using Snowflake Cortex</p>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Text Analysis (Claude 3.5 Sonnet)</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Sentiment Detection</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Fraud Prevention (Mistral Large)</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Specificity Check</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Quality Scoring</span>
              </div>
            </div>

            <div className="absolute bottom-8 left-8 right-8">
              <div className="px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-center">
                <span className="text-cyan-400 font-semibold">87% auto-approval rate</span>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Smart Redistribution */}
          <motion.div
            variants={cardVariants}
            className="relative min-h-[450px] p-8 rounded-2xl backdrop-blur-xl bg-white/5 border border-green-500/30 hover:border-green-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(34,197,94,0.3)] group"
          >
            <div className="mb-6">
              <div className="w-16 h-16 rounded-xl bg-green-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <DollarSign className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Smart Redistribution</h3>
              <p className="text-gray-400 mb-6">Fair economic model on Solana blockchain</p>
            </div>

            <div className="mb-6">
              <div className="p-4 rounded-lg bg-black/30 border border-green-500/20">
                <p className="text-sm text-gray-400 mb-2">Formula:</p>
                <code className="text-green-400 font-mono text-sm">Payout = Stake + (Stake/Winners) × Losers</code>
              </div>
            </div>

            <div className="mb-8">
              <div className="p-6 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30">
                <p className="text-gray-400 text-sm mb-2">Example:</p>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold text-white">0.5 SOL</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-2xl font-bold text-white">0.83 SOL</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-green-400">+66% ROI</span>
                </div>
              </div>
            </div>

            <div className="absolute bottom-8 left-8 right-8">
              <div className="px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                <span className="text-green-400 font-semibold">&lt;1s payout speed</span>
              </div>
            </div>
          </motion.div>

          {/* Card 3: Secure Storage */}
          <motion.div
            variants={cardVariants}
            className="relative min-h-[450px] p-8 rounded-2xl backdrop-blur-xl bg-white/5 border border-blue-500/30 hover:border-blue-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] group"
          >
            <div className="mb-6">
              <div className="w-16 h-16 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Cloud className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Secure Storage</h3>
              <p className="text-gray-400 mb-6">Cloudflare R2 with presigned URLs</p>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Direct browser uploads</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">10MB limit with validation</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">CDN-backed delivery</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Automatic cleanup</span>
              </div>
            </div>

            <div className="absolute bottom-8 left-8 right-8">
              <div className="px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
                <span className="text-blue-400 font-semibold">&lt;100ms response time</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
