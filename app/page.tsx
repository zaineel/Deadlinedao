'use client';

import Link from 'next/link';
import { Target, Lock, CheckCircle, Trophy, Zap, Shield, TrendingUp, Users } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen gradient-primary">
      {/* Hero Section */}
      <div className="relative overflow-hidden py-24 lg:py-40">
        {/* Animated background elements */}
        <div className="absolute inset-0 glow-blue opacity-30" />
        <div className="absolute top-20 right-10 w-72 h-72 bg-gradient-to-br from-blue-500/20 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-gradient-to-tr from-cyan-500/10 to-transparent rounded-full blur-3xl" />

        <div className="container-max relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8 text-center lg:text-left">
              <div className="space-y-4">
                <div className="inline-block px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm font-semibold mb-4">
                  🚀 AI-Powered Accountability Platform
                </div>
                <h1 className="text-5xl lg:text-7xl font-bold text-white">
                  Put Your Money Where Your <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Goals</span> Are
                </h1>
                <p className="text-xl text-slate-300 max-w-2xl mx-auto lg:mx-0">
                  89% of people fail their goals. Not here. Stake SOL, get your proof validated by AI, and earn rewards for success. Real stakes. Real accountability. Real results.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/create" className="btn-primary text-center">
                  Create Goal Now
                </Link>
                <Link href="/feed" className="btn-secondary text-center">
                  Browse Community Goals
                </Link>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4 pt-8 border-t border-slate-700">
                <div>
                  <div className="text-2xl font-bold text-cyan-400">$0.00025</div>
                  <div className="text-sm text-slate-400">Transaction Cost</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-cyan-400">400ms</div>
                  <div className="text-sm text-slate-400">Payout Speed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-cyan-400">5-Layer</div>
                  <div className="text-sm text-slate-400">AI Validation</div>
                </div>
              </div>
            </div>

            {/* Right - Visual Flow */}
            <div className="hidden lg:block relative h-96">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent rounded-2xl border border-blue-500/20" />
              <div className="relative h-full flex flex-col items-center justify-center space-y-6 p-8">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20 border border-blue-500/40">
                  <Target className="w-8 h-8 text-blue-400" />
                </div>
                <div className="text-slate-400">↓</div>
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/20 border border-cyan-500/40">
                  <Lock className="w-8 h-8 text-cyan-400" />
                </div>
                <div className="text-slate-400">↓</div>
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 border border-purple-500/40">
                  <CheckCircle className="w-8 h-8 text-purple-400" />
                </div>
                <div className="text-slate-400">↓</div>
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40">
                  <Trophy className="w-8 h-8 text-green-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Problem Section */}
      <div className="py-24 bg-gradient-to-b from-slate-900/50 to-slate-900/30 border-t border-slate-800">
        <div className="container-max">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-4xl lg:text-5xl font-bold text-white">
                The Problem with Traditional Goal Apps
              </h2>
              <div className="space-y-4 text-slate-300">
                <p className="text-lg">
                  <span className="text-3xl font-bold text-red-400">89%</span> of people fail to achieve their goals. Why? <span className="font-semibold text-white">There's no consequence.</span>
                </p>
                <p>
                  Free goal-tracking apps? Your broken promises cost you nothing. That's the problem. Without real stakes, motivation disappears when it gets hard.
                </p>
              </div>
            </div>
            <div className="card text-center py-12">
              <div className="text-6xl mb-4">📉</div>
              <p className="text-slate-300">Most goal-tracking apps are forgotten 3 weeks in...</p>
            </div>
          </div>
        </div>
      </div>

      {/* Solution: How It Works */}
      <div className="py-24">
        <div className="container-max">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-white">How It Works</h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Five simple steps from goal to reward. Real accountability powered by blockchain and AI.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { icon: Target, title: 'Set Goal', description: 'Define your goal & deadline', number: '1' },
              { icon: Lock, title: 'Stake SOL', description: 'Put money on the line', number: '2' },
              { icon: CheckCircle, title: 'Submit Proof', description: 'Image + description', number: '3' },
              { icon: Zap, title: 'AI Validates', description: '5-layer verification', number: '4' },
              { icon: Trophy, title: 'Get Paid', description: 'Stake + earnings', number: '5' },
            ].map((step, idx) => (
              <div key={idx} className="card text-center space-y-4 flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                  {step.number}
                </div>
                <step.icon className="w-8 h-8 text-cyan-400" />
                <h4 className="text-white font-semibold">{step.title}</h4>
                <p className="text-sm text-slate-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Key Features */}
      <div className="py-24 bg-gradient-to-b from-slate-900/50 to-slate-900/30 border-y border-slate-800">
        <div className="container-max">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-white">Powered By Innovation</h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Built with the best blockchain and AI technology
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Zap className="w-8 h-8 text-cyan-400" />,
                title: 'AI Proof Validation',
                description: 'Snowflake Cortex validates proofs using Claude & Mistral AI with 5-layer verification',
                tech: 'Snowflake Cortex',
              },
              {
                icon: <Shield className="w-8 h-8 text-blue-400" />,
                title: 'Blockchain Escrow',
                description: 'SOL stakes locked in escrow. Lightning-fast payouts via Solana blockchain.',
                tech: 'Solana',
              },
              {
                icon: <Users className="w-8 h-8 text-purple-400" />,
                title: 'Proportional Rewards',
                description: 'Your payout = stake + share of losers\' stakes. Winners earn together.',
                tech: 'Smart Economics',
              },
              {
                icon: <TrendingUp className="w-8 h-8 text-green-400" />,
                title: 'Real-time Analytics',
                description: 'Track your success rate, earnings, and compete on the leaderboard.',
                tech: 'Live Dashboard',
              },
            ].map((feature, idx) => (
              <div key={idx} className="card space-y-4">
                <div className="flex items-center justify-between">
                  <div>{feature.icon}</div>
                  <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full">
                    {feature.tech}
                  </span>
                </div>
                <h4 className="text-lg font-semibold text-white">{feature.title}</h4>
                <p className="text-sm text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Example Earnings */}
      <div className="py-24">
        <div className="container-max">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="card space-y-8">
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Example Earnings</p>
                <h3 className="text-2xl font-bold text-white">Learn TypeScript Course</h3>
              </div>
              <div className="space-y-4 border-t border-slate-700 pt-6">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Your Stake</span>
                  <span className="text-xl font-bold text-white">0.5 SOL</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Community Stake (5 others)</span>
                  <span className="text-xl font-bold text-white">2.5 SOL</span>
                </div>
                <div className="border-t border-slate-700 pt-4 flex justify-between items-center">
                  <span className="text-slate-300">Failed Goals Forfeited</span>
                  <span className="text-xl font-bold text-red-400">1.0 SOL</span>
                </div>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-400">You Get</p>
                  <p className="text-3xl font-bold text-green-400">0.83 SOL</p>
                  <p className="text-xs text-slate-400 mt-2">+66% profit! 🎉</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-4xl font-bold text-white">Earn Together</h3>
              <p className="text-lg text-slate-300">
                Your success benefits from others' failures. But it's not zero-sum. A rising tide lifts all boats. More goal-achievers means a healthier community.
              </p>
              <div className="card space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-white">Fair Distribution</p>
                    <p className="text-sm text-slate-400">Rewards proportional to your stake</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-white">Transparent & Verifiable</p>
                    <p className="text-sm text-slate-400">All transactions on blockchain</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-white">No Counterparty Risk</p>
                    <p className="text-sm text-slate-400">Solana escrow handles all payouts</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-blue-500/10" />
        <div className="container-max relative z-10 text-center space-y-8">
          <h2 className="text-5xl lg:text-6xl font-bold text-white">
            Stop Talking. Start Achieving.
          </h2>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Your next goal is one click away. Create it today and join thousands of people who are serious about success.
          </p>
          <Link href="/create" className="inline-block btn-primary text-lg px-10 py-4">
            Create Your First Goal
          </Link>
        </div>
      </div>
    </main>
  );
}
