# DeadlineDAO mobile (iPhone)

React Native + Expo (SDK 58, expo-router, TypeScript). Standalone: it has its own `package.json` and is not part of the web app's build, lint or typecheck.

## IMPORTANT: what is and is not verified

This app was written without access to an iPhone, an iOS simulator, Xcode or a Phantom install. **Nothing has been run on a device or simulator.** What was verified:

- `npx tsc --noEmit` passes.
- 31 Vitest tests pass: Phantom deep-link URL builders and callback parser, x25519/nacl encryption round trips, the whole `PhantomWalletProvider` against an in-test fake Phantom, sign-in and proof message builders (including a drift test against the web app's builders), API client request shaping with a mocked `fetch`, and the sign-in / stake / proof flows with a fake wallet.

Not verified (treat as untested until you try it): the Phantom universal-link handoff on a real phone, redirect handling in expo-router, Keychain storage, the camera/library picker, multipart upload from React Native, push registration, EAS builds, and every screen's layout. The Phantom protocol is implemented from its public documentation; the real app may differ in details (see "Known risks").

## Run it on an iPhone

Expo Go is not suitable: it uses its own URL scheme (`exp://`), so Phantom cannot reliably redirect back to the app, and `expo-notifications` push is limited there. Use a **development build**.

```bash
cd apps/mobile
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your deployed (or LAN) web app
npm install
npx expo prebuild --platform ios   # or skip: EAS builds do this for you
```

Option A, EAS (no Mac needed, needs an Apple developer account for a physical device):

```bash
npm i -g eas-cli && eas login
eas init                                   # writes the real projectId; replace the placeholder in app.config.ts
eas device:create                          # register your iPhone
eas build --profile development --platform ios
npm start                                  # dev server; open the installed dev build and connect
```

Option B, local (needs a Mac with Xcode): `npx expo run:ios --device`.

Then install **Phantom** from the App Store on the same phone, create/import a wallet, and switch it to **Devnet** (Settings > Developer Settings > Testnet Mode) because the web app escrows on devnet.

Placeholders to replace before shipping: bundle id `com.deadlinedao.app`, `extra.eas.projectId` in `app.config.ts`, and the `EXPO_PUBLIC_API_URL` values in `eas.json`.

## Configuration

| Variable | Meaning |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Base URL of the DeadlineDAO web app. Also sent to Phantom as `app_url`, so use the https deployment URL for real runs. |
| `EXPO_PUBLIC_SOLANA_CLUSTER` | `devnet` (default) or `mainnet-beta`. |

## Architecture

```
app/                     expo-router screens (connect, dashboard, goals/new, goals/[id], proof/[id], settings, phantom/[action])
src/wallet/types.ts      WalletProvider interface (the seam for Solflare / Android MWA)
src/wallet/phantom/      links.ts (URL builders/parser), crypto.ts (x25519 + nacl.box), provider.ts
src/wallet/index.ts      getWalletProvider(): wires in expo-linking / expo-crypto / SecureStore
src/api/                 typed client + duplicated minimal types
src/auth/                sign-in message (duplicated), session storage (Keychain), AuthProvider
src/proof/               proof message + payload hash (duplicated)
src/flows.ts             sign-in, create-and-stake, submit-proof orchestration (pure, tested)
src/push/register.ts     expo-notifications registration
tests/                   Vitest; drift.test.ts imports the web builders from ../../../lib
```

Adding another wallet: implement `WalletProvider`, return it from `getWalletProvider()` (e.g. choose by `Platform.OS` or a user setting). Adding disputes/teams: add screens under `app/` and register them in the `Stack.Protected` block in `app/_layout.tsx`, gated on the server capability (the API client's `optional()` helper turns 404 into "unavailable").

## Known risks

- Phantom returns to the app via `deadlinedao://phantom/<action>`. The wallet provider keeps pending requests in memory; if iOS kills the app while Phantom is in the foreground, the pending request is lost and the user must retry (the persisted connection survives).
- The redirect briefly mounts `app/phantom/[action].tsx`, which steps back; this may cause a visible transition over modals.
- `POST /api/goals/share` (`{goalId, share}`) and `POST /api/push/register` (`{token, platform}`) match the web routes on main; both are behind the server `push` feature flag and 404 is tolerated. Sharing only works for completed goals.
- Phantom documents the `signAndSendTransaction` deep link as DEPRECATED (recommending `signTransaction` / `signAllTransactions`; no removal date given). The stake flow still uses it and is unverified on a device. If Phantom removes it, the app must switch to `signTransaction` and submit the signed transaction itself (needs an RPC URL).
- Connect responses carry Phantom's public key unauthenticated by protocol design; responses are only accepted for a pending request and must decrypt with the per-connect x25519 key.
- Session tokens are bearer tokens with a 24h TTL and no server-side revocation (server design); sign-out only deletes them locally.
- `npm install` needs `legacy-peer-deps` (see `.npmrc`) because of upstream React Native peer ranges.
