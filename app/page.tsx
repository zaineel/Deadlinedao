'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-64px)] gradient-primary">
      <div className="container-max py-20 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold tracking-tight">
                Deadline<span className="text-blue-600">DAO</span>
              </h1>
              <p className="text-xl text-gray-600 max-w-xl">
                Lock SOL to your deadline. AI validates your proof. Complete it? Get paid. Fail? Your money goes to winners.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/create" className="btn-primary px-8 py-4 text-center text-lg">
                Create Goal
              </Link>
              <Link href="/feed" className="btn-secondary px-8 py-4 text-center text-lg">
                Browse Goals
              </Link>
            </div>

            {/* Stats */}
            <div className="pt-8 grid grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-2xl lg:text-3xl font-bold text-blue-600">$0.00025</div>
                <div className="text-sm text-gray-600">Transaction Cost</div>
              </div>
              <div className="space-y-2">
                <div className="text-2xl lg:text-3xl font-bold text-blue-600">400ms</div>
                <div className="text-sm text-gray-600">Payout Speed</div>
              </div>
              <div className="space-y-2">
                <div className="text-2xl lg:text-3xl font-bold text-blue-600">AI</div>
                <div className="text-sm text-gray-600">Proof Validation</div>
              </div>
            </div>
          </div>

          {/* Right - Feature Illustration */}
          <div className="hidden lg:block">
            <div className="card">
              <div className="space-y-6">
                <div className="h-64 bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-2">🎯</div>
                    <p className="text-gray-600 font-medium">Set ambitious goals</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Section */}
        <div className="mt-24 space-y-12">
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <h2>How it Works</h2>
            <p className="text-gray-600 text-lg">
              A simple three-step process to achieve your goals with accountability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                number: '1',
                title: 'Create Goal',
                description: 'Define your goal, set a deadline, and stake SOL as collateral.',
                icon: '📝',
              },
              {
                number: '2',
                title: 'Submit Proof',
                description: 'Submit evidence of completion by the deadline for AI validation.',
                icon: '📸',
              },
              {
                number: '3',
                title: 'Get Rewarded',
                description: 'AI validates your proof and you get your stake back plus rewards.',
                icon: '💰',
              },
            ].map((feature) => (
              <div key={feature.number} className="card text-center space-y-4">
                <div className="text-4xl">{feature.icon}</div>
                <h4>{feature.title}</h4>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-24 bg-blue-600 rounded-xl p-12 text-center text-white space-y-6">
          <h2 className="text-white">Ready to get started?</h2>
          <p className="text-lg text-blue-100 max-w-xl mx-auto">
            Join thousands of users who are achieving their goals with accountability and rewards.
          </p>
          <Link href="/create" className="inline-block btn-primary bg-white text-blue-600 hover:bg-gray-100 px-8 py-4">
            Create Your First Goal
          </Link>
        </div>
      </div>
    </main>
  );
}
