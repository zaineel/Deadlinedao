# DeadlineDAO

AI-Powered Accountability Platform built with Solana, Snowflake, and Cloudflare

## Tech Stack

- **Frontend:** Next.js 14 with TypeScript
- **Blockchain:** Solana (devnet)
- **AI:** Snowflake Cortex API
- **Storage:** Cloudflare R2
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Cloudflare Pages

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.local.example` to `.env.local` and fill in your credentials

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
deadlinedao/
├── app/                 # Next.js app directory
│   ├── api/            # API routes
│   ├── page.tsx        # Landing page
│   └── layout.tsx      # Root layout
├── lib/                # Core libraries
│   ├── solana/         # Solana integration
│   ├── snowflake/      # Snowflake AI
│   ├── supabase/       # Database operations
│   └── cloudflare/     # R2 storage
├── components/         # React components
└── types/             # TypeScript types
```

## Features

- ✅ Solana wallet integration
- ✅ Goal creation with staking
- ✅ AI proof validation (Snowflake)
- ✅ Automatic redistribution
- ✅ Personal dashboard

## Environment Variables

See `.env.local.example` for required environment variables.

## License

MIT
