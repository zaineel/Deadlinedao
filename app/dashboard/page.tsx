'use client';

import PageContainer from '@/components/layout/PageContainer';

export default function DashboardPage() {
  const stats = [
    { label: 'Active Goals', value: '0', icon: '🎯' },
    { label: 'Completed Goals', value: '0', icon: '✅' },
    { label: 'Total Staked', value: '0 SOL', icon: '💰' },
    { label: 'Success Rate', value: '0%', icon: '📊' },
  ];

  return (
    <PageContainer
      title="My Dashboard"
      description="Track your goals and progress."
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {stats.map((stat) => (
          <div key={stat.label} className="card text-center">
            <div className="text-4xl mb-2">{stat.icon}</div>
            <div className="text-sm text-gray-600 mb-1">{stat.label}</div>
            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="space-y-6">
        <div className="border-b border-gray-200">
          <div className="flex gap-8">
            <button className="px-4 py-4 border-b-2 border-blue-600 text-blue-600 font-semibold">
              Active Goals
            </button>
            <button className="px-4 py-4 text-gray-600 hover:text-blue-600 font-semibold transition-colors">
              Completed Goals
            </button>
            <button className="px-4 py-4 text-gray-600 hover:text-blue-600 font-semibold transition-colors">
              History
            </button>
          </div>
        </div>

        {/* Goals List */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6 flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 mb-1">Goal {i}</h4>
                <p className="text-sm text-gray-600 mb-2">Placeholder goal description</p>
                <div className="flex gap-4 text-sm text-gray-600">
                  <span>Deadline: --</span>
                  <span>Stake: -- SOL</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary px-4 py-2">View</button>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        <div className="text-center py-12 text-gray-600">
          <p className="mb-4">No active goals yet</p>
          <a href="/create" className="btn-primary inline-block">
            Create Your First Goal
          </a>
        </div>
      </div>
    </PageContainer>
  );
}
