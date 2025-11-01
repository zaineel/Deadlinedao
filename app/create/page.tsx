'use client';

import PageContainer from '@/components/layout/PageContainer';

export default function CreatePage() {
  return (
    <PageContainer
      title="Create Goal"
      description="Set a new goal, stake SOL, and let AI hold you accountable."
    >
      <div className="max-w-2xl mx-auto">
        <div className="card space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Goal Title</label>
            <input
              type="text"
              placeholder="e.g., Complete my React project"
              className="input-base"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Description</label>
            <textarea
              placeholder="Describe your goal in detail..."
              className="input-base h-32 resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Deadline</label>
            <input type="date" className="input-base" />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Category</label>
            <select className="input-base">
              <option>Select a category</option>
              <option>Learning</option>
              <option>Work</option>
              <option>Health</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Stake Amount (SOL)</label>
            <input
              type="number"
              placeholder="0.5"
              step="0.01"
              min="0"
              className="input-base"
            />
          </div>

          <div className="pt-4 flex gap-4">
            <button className="btn-primary flex-1">Create Goal</button>
            <button className="btn-outline flex-1">Cancel</button>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          <h4 className="text-blue-900">How it works</h4>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>• Define your goal with a clear deadline</li>
            <li>• Stake SOL as collateral to incentivize completion</li>
            <li>• Submit proof of completion by the deadline</li>
            <li>• AI validates your proof and you receive your stake + rewards</li>
          </ul>
        </div>
      </div>
    </PageContainer>
  );
}
