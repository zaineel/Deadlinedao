import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SolanaWalletProvider } from '@/components/WalletProvider'
import { SessionProvider } from '@/components/auth/SessionProvider'
import '@solana/wallet-adapter-react-ui/styles.css'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'DeadlineDAO - AI-Powered Accountability',
  description: 'Lock SOL to your deadline. AI validates your proof. Complete it? Get paid. Fail? Your money goes to winners.',
  generator: 'DeadlineDAO',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <SolanaWalletProvider>
          <SessionProvider>{children}</SessionProvider>
        </SolanaWalletProvider>
        <Analytics />
      </body>
    </html>
  )
}
