'use client';

import PageContainer from '@/components/layout/PageContainer';

export default function FeedPage() {
  return (
    <PageContainer
      title="Browse Goals"
      description="Discover and support goals from the community."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Placeholder cards */}
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card h-64 bg-gradient-to-br from-gray-50 to-gray-100 animate-pulse flex items-center justify-center">
            <div className="text-center">
              <div className="text-gray-400 mb-2">Goal Card {i}</div>
              <p className="text-gray-500 text-sm">Coming soon</p>
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
