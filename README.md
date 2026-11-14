# Oil Master — Telegram Mini App game (starter project)

An original oil-tycoon game inspired by common idle-game mechanics. It is **not** a copy of Oil Pump's private code or assets.

## Included
- Telegram bot (grammY) with an Open App button
- React/Vite Telegram Mini App UI
- Fastify API with Telegram `initData` HMAC validation
- Prisma + SQLite for local development (switch to PostgreSQL for production)
- Tap-to-produce, passive production, rig upgrades, daily reward, referrals, leaderboard
- TON Connect wallet connection in the Mini App
- Withdrawal request queue with admin approval endpoint
- Basic admin endpoints and Docker Compose

## Important TON / money safety
- Defaults to `TON_NETWORK=testnet`.
- Wallet connection uses TON Connect; the app never asks for or stores seed phrases/private keys.
- Withdrawal requests are **queued**, not automatically paid. An authorized operator must review and send a payout from a separately secured treasury wallet, then record the transaction hash. Do not put treasury keys in this app or `.env`.
- Before mainnet: independent security review, anti-abuse/rate-limit tuning, legal review, published withdrawal rules, treasury controls, and reconciliation monitoring are required.
- If the Mini App sells digital goods/services inside Telegram, review Telegram Stars requirements. TON Connect is for permitted blockchain interactions. See official links below.

## Requirements
- Node.js 20+
- npm 10+
- Telegram bot token from @BotFather
- Public HTTPS URL for the Mini App
- TON Connect manifest hosted at `https://YOUR_DOMAIN/tonconnect-manifest.json`

## Local setup
1. Copy `.env.example` to `.env` and fill `BOT_TOKEN`, `BOT_USERNAME`, `WEBAPP_URL`, `ADMIN_TELEGRAM_IDS`, `SESSION_SECRET`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Initialize database:
   ```bash
   npm run db:push
   npm run db:seed
   ```
4. Run API and bot:
   ```bash
   npm run dev:server
   ```
5. In another terminal run the web app:
   ```bash
   npm run dev:web
   ```
6. For local Telegram testing, expose the web app with an HTTPS tunnel and set `WEBAPP_URL` to that URL. Configure the same URL in @BotFather.

## Production deployment
- Deploy API and frontend behind HTTPS (e.g. Nginx/Caddy + Node process or a managed platform).
- Use PostgreSQL: set `DATABASE_URL` to a PostgreSQL connection string and change Prisma provider to `postgresql`.
- Set `NODE_ENV=production`, a long random `SESSION_SECRET`, `TON_NETWORK=mainnet` only after testing, and strict CORS `WEBAPP_URL`.
- Serve `public/tonconnect-manifest.json` from your frontend domain. Update `url` and `iconUrl`.
- Run `npm run db:push`, then `npm run start`.
- Configure bot commands / menu button in @BotFather.
- Keep bot token, admin IDs, database credentials and treasury wallet operations private.

## Telegram identity
The frontend sends `Telegram.WebApp.initData` to `/api/auth`. The backend validates its HMAC signature and freshness before trusting the user ID. Do not replace this with `initDataUnsafe` as an authentication mechanism.

## Admin operations
Set `ADMIN_TELEGRAM_IDS=123456789,987654321`.
- `GET /api/admin/withdrawals?status=PENDING`
- `POST /api/admin/withdrawals/:id/approve`
- `POST /api/admin/withdrawals/:id/reject`
- `POST /api/admin/withdrawals/:id/paid` with `{ "txHash": "..." }`

All admin endpoints require a valid Telegram-authenticated admin user. The `paid` endpoint records a transaction hash after the operator has actually sent the TON transaction. It does not send TON itself.

## Economy defaults
- Tap reward: 1 oil
- Starting balance: 100 oil
- Rig level upgrade cost: exponential, configured in `server/src/game.ts`
- Passive production is calculated server-side from elapsed time and capped at 12 hours.

## Useful official documentation
- Telegram Mini Apps: https://core.telegram.org/bots/webapps
- Telegram Bot API: https://core.telegram.org/bots/api
- TON Connect: https://docs.ton.org/applications/ton-connect/overview
- TON payments: https://docs.ton.org/applications/payments/overview

This is a development starter, not a security-audited financial product.
