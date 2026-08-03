# GO WATT Backend (Supabase-free)

Node.js + TypeScript + Express + PostgreSQL API that sits in front of the dedicated
server's database. No Supabase. The mobile app talks only to this API.

## Design principles (why it's built for the long run)
- **Layered & modular:** `modules/<name>/{routes,service}` — add a feature without
  touching others.
- **Reuse the hardened SQL functions for money.** The billing / hold / payout logic
  lives in the database as atomic, row-locked, idempotent functions. This backend
  **calls them** (it does not re-implement them), so money correctness is preserved.
  The trick: `db/pool.ts → withUser()` sets `request.jwt.claims = {sub: userId}` for
  the transaction, so the functions' internal `auth.uid()` resolves. See
  `sql/backend-compat.sql`.
- **Auth = JWT access + rotating refresh tokens**, Argon2 for new passwords, and
  **bcrypt fallback** so the migrated Supabase users keep their passwords.
- **Validation everywhere** (zod), central error handling, Helmet, CORS, rate limiting.
- **Fail-fast config** (`config/env.ts` validates env at boot).

## First-time setup (on the server)
```bash
cd backend
cp .env.example .env          # fill DATABASE_URL, JWT secrets, SMTP, Thawani, Tuya
npm install

# One-time DB prep (adds auth.uid() compat + backend tables):
psql "$DATABASE_URL" -f sql/backend-compat.sql
psql "$DATABASE_URL" -f sql/backend-tables.sql

npm run dev                   # or: npm run build && npm start
curl localhost:8080/health
```

## Project layout
```
src/
  config/env.ts          validated environment
  db/pool.ts             pg pool + withUser()/callFn() (user-context transactions)
  lib/                   errors, jwt, password (argon2 + bcrypt fallback)
  middleware/            attachUser, requireAuth, requireRole, validate, error
  modules/
    auth/                register, login, refresh, logout, change/forgot/reset password
    profile/            get/update/delete own profile
    stations/           list/detail/reviews/availability
    sessions/           🔴 start / complete / rate  (calls SQL functions)
  app.ts / index.ts      assembly + startup
sql/
  backend-compat.sql     auth.uid()/auth.role() reading our session setting
  backend-tables.sql     refresh-token + reset/verify token tables
```

## What's implemented vs. remaining
Implemented (all build clean; each is a thin `.routes.ts` over a query or SQL function):
- ✅ Config, DB layer, error handling, JWT/password, middleware
- ✅ **Auth** (register/login/refresh/logout/change/forgot/reset/check-email)
- ✅ **Profile** (get/update/delete)
- ✅ **Stations** (list/detail/reviews/availability)
- ✅ **Sessions** (start/complete/rate — 🔴 money, calls SQL functions)
- ✅ **Bookings** (list/create/cancel/active-check)
- ✅ **Wallet** (transactions)
- ✅ **Favorites** (add/list/remove)
- ✅ **Payouts** (request / mine / admin list / process 🔴)
- ✅ **Admin** (analytics / flagged / resolve / users / applications)
- ✅ **Superadmin** (admins list/set / settings get/set)
- ✅ **Host** (listing / bookings / toggle availability / edit — device-lock enforced)

Integrations + realtime + cron — **now implemented**:
- ✅ **Payments** (`/api/payments/create|verify`) — Thawani hosted checkout + wallet credit
- ✅ **Devices** (`/api/devices/switch|energy`) — Tuya on/off + energy (HMAC-signed)
- ✅ **Push + Email** — Expo push + SMTP; host push on new booking, customer push on
  auto-stop, password-reset emails
- ✅ **Realtime** — Socket.IO over Postgres LISTEN/NOTIFY (`sql/backend-realtime.sql`)
- ✅ **Cron jobs** (`/api/jobs/*`, x-job-secret) — auto-shutoff, no-show, disburse

### One-time DB prep
```bash
psql "$DATABASE_URL" -f sql/backend-compat.sql
psql "$DATABASE_URL" -f sql/backend-tables.sql
psql "$DATABASE_URL" -f sql/backend-realtime.sql
psql "$DATABASE_URL" -f sql/backend-saved-cards.sql   # saved credit/debit cards
```

### Scheduling the cron jobs (server crontab)
```
* * * * *    curl -s -XPOST -H "x-job-secret: $JOB_SECRET" http://localhost:8080/api/jobs/auto-shutoff
*/10 * * * * curl -s -XPOST -H "x-job-secret: $JOB_SECRET" http://localhost:8080/api/jobs/no-show
0 6 * * *    curl -s -XPOST -H "x-job-secret: $JOB_SECRET" http://localhost:8080/api/jobs/disburse
```

**The backend API is now feature-complete.** Next: the app-side — replace
`@supabase/supabase-js` with an API client that calls these endpoints (see `../docs/C-server.md` §9).

## Security notes
- Never trust an id from the client — always use `req.user.id` from the verified JWT.
- Admin routes: `requireAdmin` (admin or superadmin). Role changes: `requireSuperadmin`.
- The DB `protect_*` triggers still guard money/role columns even if a route slips.
- Set `CORS_ORIGIN` to the app's real origin in production (not `*`).
