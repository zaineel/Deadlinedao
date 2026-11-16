# Mobile app (iPhone)

Standalone Expo / React Native app in `apps/mobile`. See `apps/mobile/README.md` for running it on a device and the honest list of what is untested (nothing has been run on iOS).

## Design

- **Wallet**: Solana Mobile Wallet Adapter is Android-only, so iOS connects through the Phantom deep-link protocol: `connect`, `signMessage`, `signAndSendTransaction` via `https://phantom.app/ul/v1/...` with an x25519 key exchange and `nacl.box` encrypted payloads (tweetnacl, bs58). Everything sits behind the `WalletProvider` interface (`src/wallet/types.ts`).
- **Auth**: `POST /api/auth/nonce` -> wallet signs the exact message from `buildSignInMessage` (the app rebuilds it locally and refuses to sign anything else) -> `POST /api/auth/verify` -> bearer token stored in the iOS Keychain (expo-secure-store).
- **Stake**: `POST /api/goals/create` returns a base64 legacy transaction; Phantom signs and sends it; `POST /api/goals/confirm` verifies it on chain. Demo mode (no transaction in the response) confirms with a `demo_tx_` signature.
- **Proof**: image picked with expo-image-picker -> `POST /api/upload/proof` -> wallet signs `DeadlineDAO:submit-proof\ngoal:..\nts:..\nhash:<sha256 hex of "text\nimageUrl">` -> `POST /api/proofs`.
- **Share / push**: `POST /api/goals/share` and `POST /api/push/register` are called through `optional()`, which maps 404/405 to "unavailable" (backend PR not merged, or `FEATURE_PUSH` off).

## Duplicated from the web app (and guarded)

| Mobile | Web source |
| --- | --- |
| `src/auth/signin-message.ts` | `lib/auth/session.ts` `buildSignInMessage` |
| `src/proof/proof-message.ts` | `lib/auth/proof-message.ts`, hashing in `lib/auth/wallet.ts` |
| `src/api/types.ts` | `types/index.ts`, `app/api/**` |

`apps/mobile/tests/drift.test.ts` imports the web builders and fails if the formats diverge.

## Files outside apps/mobile

- `tsconfig.json`, `eslint.config.mjs`: exclude `apps/mobile` from the web typecheck/lint.
- `.github/workflows/mobile.yml`: runs `npm ci`, typecheck and tests in `apps/mobile`.

## Env vars / nav

- Mobile: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SOLANA_CLUSTER` (documented in `apps/mobile/.env.example`). No new web env vars, no web nav links.

## Extension points

Disputes and teams screens: add routes under `apps/mobile/app/` and register them in the `Stack.Protected` block in `app/_layout.tsx`. Other wallets: implement `WalletProvider`.

## Security notes

- Session token only in Keychain; never logged. Wallet session/key pair persisted in Keychain too.
- The app refuses to sign a sign-in message that differs from the locally built one.
- The proof API itself requires a wallet signature, independent of the session.
