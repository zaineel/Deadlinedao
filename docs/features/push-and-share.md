# Push notifications and social proof sharing

Flag: `FEATURE_PUSH=true` gates all routes below, the cron and the share page. Migration: `supabase-migrations/006_push_and_share.sql` (apply manually before enabling).

## Push
- `POST /api/push/register` `{ token, platform: 'ios'|'android' }` (session required, 20/min). Token must match `ExponentPushToken[...]`. A wallet holds at most 5 tokens (409 beyond that). A token is globally unique: registering it from another wallet moves it.
- `POST /api/push/unregister` `{ token }` removes the token only if the session wallet owns it.
- `lib/notify/token-store.ts` is the DB layer; `notifyWallet(event, wallet)` in `lib/notify/notify-wallet.ts` loads tokens and sends via `ExpoPushChannel`. Tickets reporting `DeviceNotRegistered` delete that token. Only immediate tickets are inspected; delayed receipts (`getReceipts`) are not polled.
- `GET /api/cron/deadline-reminders` (Bearer `CRON_SECRET`, every 6h in `vercel.json`) reminds active goals due within 24h. Each (goal, deadline) is claimed in `deadline_reminders_sent` before sending, so reruns never double-send (at-most-once: a failed push is not retried).

## Sharing
- `POST /api/goals/share` `{ goalId, share }`: owner only, COMPLETED goals only (enforced in the UPDATE; 404 otherwise). Sets `goals.share_public`.
- `/p/[id]` plus `opengraph-image` show title, category, stake, "Completed" and a shortened wallet. 404 unless flag on, `share_public` and completed. Never selects proof text, images, description or the full wallet.
- Env: `NEXT_PUBLIC_IOS_APP_URL` (App Store / deep link for the button; shows "App coming soon" if unset).

## Integrator notes
Env vars to document: `FEATURE_PUSH`, `CRON_SECRET`, `NEXT_PUBLIC_IOS_APP_URL`. Mobile app calls the routes above with its Bearer session. Not verified against live Supabase, Expo or a real device.
