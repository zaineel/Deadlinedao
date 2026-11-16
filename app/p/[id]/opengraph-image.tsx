import { ImageResponse } from 'next/og';
import { loadShareCard } from '@/lib/mobile/load-share';

export const runtime = 'nodejs';
export const alt = 'DeadlineDAO completed goal';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await loadShareCard(id);
  if (!card) return new Response('Not found', { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#0b0b12',
          color: '#fff',
          fontSize: 36,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            background: '#16a34a',
            padding: '8px 24px',
            borderRadius: 999,
            fontSize: 32,
          }}
        >
          Completed
        </div>
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, marginTop: 32 }}>
          {card.title}
        </div>
        <div style={{ display: 'flex', marginTop: 32, color: '#a1a1aa' }}>
          {`${card.category}  |  ${card.stakeSol} SOL staked  |  ${card.walletShort}`}
        </div>
        <div style={{ display: 'flex', marginTop: 48, fontSize: 28, color: '#71717a' }}>
          DeadlineDAO
        </div>
      </div>
    ),
    size
  );
}
