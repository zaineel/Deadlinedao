import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadShareCard } from '@/lib/mobile/load-share';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const card = await loadShareCard(id);
  if (!card) return { title: 'Not found', robots: { index: false } };
  const title = `Completed: ${card.title}`;
  const description = `Staked ${card.stakeSol} SOL on a ${card.category} goal and finished it on DeadlineDAO.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function SharedGoalPage({ params }: Props) {
  const { id } = await params;
  const card = await loadShareCard(id);
  if (!card) notFound();
  const appUrl = process.env.NEXT_PUBLIC_IOS_APP_URL;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <span className="w-fit rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white">
        Completed
      </span>
      <h1 className="text-3xl font-bold">{card.title}</h1>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-gray-500">Category</dt>
          <dd className="font-medium capitalize">{card.category}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Staked</dt>
          <dd className="font-medium">{card.stakeSol} SOL</dd>
        </div>
        <div>
          <dt className="text-gray-500">Wallet</dt>
          <dd className="font-mono">{card.walletShort}</dd>
        </div>
      </dl>
      <a
        href={appUrl || '#'}
        className="w-fit rounded-md bg-black px-4 py-2 text-white"
        rel="noopener noreferrer"
        aria-disabled={!appUrl}
      >
        {appUrl ? 'Get the DeadlineDAO app' : 'App coming soon'}
      </a>
    </main>
  );
}
