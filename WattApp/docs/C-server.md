# GO WATT — Custom Backend Build Spec (Remove Supabase)

This maps the server owner's 10 generic requirements onto **what GO WATT actually
uses**, so the backend team builds the exact right thing. It is the precise API
surface, data model, auth flows, realtime channels, and background jobs the mobile
app depends on today.

---

## ⚠️ Read first — scope, risk, and the safe shortcut

1. **This is a large project.** The app talks to the backend in 5 ways (SQL queries,
   ~19 RPC functions, auth, realtime, 5 edge functions). All must be replaced.

2. **The money logic is the highest risk.** Charging holds, billing, and payouts are
   currently **atomic SQL functions** with row-locks and idempotency (they guarantee
   no double-charge and no negative balance). If these are re-written by hand in
   Node/Laravel/etc. and get the transaction/locking wrong, **real money is lost or
   double-charged.**

3. **STRONG RECOMMENDATION — reuse the existing SQL functions.** These functions live
   *in the database* (see `supabase/migrations/`). Your new backend can **call them
   directly** through the Postgres driver (e.g. `SELECT start_charging_session($1)`),
   instead of re-implementing the logic. This keeps the hardened money code intact
   and removes Supabase entirely (they're just plain Postgres functions). Do this for
   every 🔴 money-critical endpoint below.

4. **The mobile app must also be rewritten.** Every screen currently calls
   `supabase.from()`, `supabase.auth`, `supabase.rpc()`, `supabase.channel()`,
   `supabase.functions.invoke()`. All become calls to the new API. Budget for this
   client rewrite in addition to the backend.

---

## Requirement 1 — Database connection

The schema + data already exist (dumps: `gowatt_public.sql`, `gowatt_auth_users.sql`;
or `supabase/migrations/`). **15 tables:**

| Table | Purpose |
|---|---|
| `profiles` | User profile: role, wallet_balance, held_balance, car (battery_kwh, connector_type), payout bank, push token, notif prefs |
| `stations` | Official charging stations (location, price, power, status, rating) |
| `connectors` | Connectors per station |
| `charger_listings` | Private/home chargers (host_id, tuya_device_id, price, availability, switch_status) |
| `bookings` | Reservations (booked_at, booked_end, duration, status, estimated cost) |
| `charging_sessions` | Live/finished sessions (kwh, cost, held_amount, meter_kwh, flagged_review) |
| `wallet_transactions` | Ledger: topup / charge / refund / earning / withdrawal |
| `payment_sessions` | Thawani checkout sessions |
| `payout_requests` | Investor payouts (manual + auto) |
| `session_ratings` | Post-charge ratings + comments |
| `favorites` | Saved chargers per user |
| `investor_applications` | Apply-to-be-investor submissions |
| `charger_applications` | Charger install/registration applications |
| `app_config` | Key/value settings (commission %, prices, hold buffer, payout toggle) |
| `email_queue` | Outgoing email queue |

Use any driver/ORM (Prisma, Drizzle, Knex, `pg`, Eloquent, EF, SQLAlchemy). Keep the
column names identical so the restored data fits.

---

## Requirement 2 — Authentication (replace Supabase Auth)

The app uses **all of these auth methods** — the new backend must provide equivalents:

| App calls today | Build this |
|---|---|
| `signUp` (email+password) | Register + **bcrypt/Argon2** hashing |
| `signInWithPassword` | Login → **JWT access + refresh tokens** |
| `signInWithOtp` / `verifyOtp` | **Phone OTP** (SMS provider) |
| `signInWithOAuth` (Google) | **Google OAuth** |
| `signInWithIdToken` (Apple) | **Apple Sign-In** |
| `resetPasswordForEmail` | **Forgot / reset password** (email link + token) |
| `updateUser` (password) | **Change password** |
| email confirmation | **Email verification** |
| `getSession` / `setSession` / `onAuthStateChange` | **Session + token refresh** endpoints |
| `signOut` | **Logout** (invalidate refresh token) |

Critical: the app's whole security model relies on **"the current user id"** (was
`auth.uid()`). Every protected endpoint must resolve the user from the JWT and use
that id — never trust an id sent by the client. Password hashes in
`gowatt_auth_users.sql` are **bcrypt** — reuse them so existing users keep their
passwords.

---

## Requirement 3 — User management

Profiles + roles already modeled in `profiles`. Roles: **`customer`, `host`,
`investor`, `admin`, `superadmin`** (`profiles.role`). Endpoints:

- `GET /profile` · `PATCH /profile` · `DELETE /account` (→ existing `delete_own_account`)
- Role checks: `is_admin` (admin OR superadmin), `is_superadmin`
- **Only superadmin** may change another user's role to/from admin (see `sa_set_admin`).
- Sensitive columns must be **server-protected**: a client can never change its own
  `role`, `wallet_balance`, `held_balance`, `total_sessions`, `total_kwh`
  (today enforced by DB triggers `protect_profile_columns`, `protect_session_columns`,
  `protect_listing_device` — keep these triggers, or enforce in the API).

---

## Requirement 4 — Database APIs (the exact endpoints the app needs)

### 4a. Table CRUD (REST), all scoped to the authenticated user / role
- `stations`, `connectors` — read (public to signed-in users)
- `charger_listings` — read all; host can update own (price is admin-controlled)
- `bookings` — create, read own, cancel own
- `charging_sessions` — read own (writes go through RPCs, not direct)
- `wallet_transactions` — read own
- `favorites` — create/read/delete own
- `profiles` — read/update own; admin reads others
- `session_ratings`, `payout_requests`, `investor_applications`, `charger_applications`

### 4b. Function endpoints (the app calls these — build 1:1). 🔴 = money-critical, reuse the SQL function.

| Endpoint (suggested) | Was RPC | Auth | Purpose |
|---|---|---|---|
| 🔴 `POST /sessions/start` | `start_charging_session` | customer | Verify wallet, place hold, create session |
| 🔴 `POST /sessions/:id/complete` | `complete_charging_session` | owner | Bill, release hold, pay host, reconcile meter |
| `GET /chargers/booked-slots` | `get_booked_slots` | any | Availability for a day |
| `GET /chargers/:id/active` | `listing_has_active_session` | any | Is a charger busy now |
| `GET /host/bookings` | `get_host_listing_bookings` | host | Bookings on my charger |
| `POST /sessions/:id/rate` | `rate_session` | owner | Submit rating |
| `GET /chargers/reviews` | `get_charger_reviews` | any | Public reviews (first name only) |
| 🔴 `POST /payouts/request` | `request_payout` | investor | Manual payout request |
| 🔴 `POST /admin/payouts/:id/process` | `process_payout` | admin | Mark paid / reject |
| `GET /admin/payouts` | `get_payout_requests` | admin | Payout list |
| `GET /admin/analytics` | `get_admin_analytics` | admin | Revenue/sessions/kWh + top chargers |
| `GET /admin/flagged` | `get_flagged_sessions_detail` | admin | Meter-mismatch sessions |
| `POST /admin/flagged/:id/resolve` | `resolve_flagged_session` | admin | Clear a flag |
| `POST /superadmin/admins` | `sa_set_admin` | superadmin | Promote/remove admin (by email/phone) |
| `GET /superadmin/admins` | `sa_list_admins` | superadmin | List admins |
| `GET /superadmin/settings` | `sa_get_settings` | superadmin | Platform settings |
| `PUT /superadmin/settings` | `sa_set_setting` | superadmin | Change a setting |
| `POST /auth/check-email` | `check_email_exists` | public | Signup: email taken? |
| `DELETE /account` | `delete_own_account` | user | Delete own account |

Server-only functions (NOT exposed to the app — background/admin use):
`_finalize_charging_session`, `credit_host_earning`, `credit_wallet_topup`,
`enqueue_auto_payouts`, `settle_auto_payout`, `release_no_show_bookings`,
`accept_investor_application`, `reject_investor_application`,
`set_application_under_review`, `get_customers_with_email`, `get_flagged_sessions`.

---

## Requirement 5 — File storage

**Not used.** The app has **no `supabase.storage` calls.** `avatar_url` / `image_url`
are plain URL strings only. No file storage layer is required. (If you add avatar
uploads later, use local disk / S3 / MinIO and store the URL in `profiles.avatar_url`.)

---

## Requirement 6 — Realtime (replace Supabase Realtime)

The app subscribes to Postgres change events on **3 tables**. Build WebSocket /
Socket.IO / SSE channels that push these:

| Channel | Event | Used by |
|---|---|---|
| `stations` | UPDATE (status/availability) | Customer + Admin map (live charger status) |
| `charger_listings` | UPDATE (switch_status/is_available) | Investor charger screen, map |
| `bookings` | UPDATE (status) | Active-booking screen |

The client needs to receive the changed row so it can update the UI. Emit
`{ table, event, new_row }` when these rows change (DB trigger → notify, or emit from
the API layer after each update).

---

## Requirement 7 — Database security (reimplement RLS as API authorization)

Supabase enforced access rules **in the database** (Row-Level Security). In a custom
backend, **your API must enforce all of them** — miss one and you leak data. Key rules:

- A user reads/writes **only their own** profile, bookings, sessions, wallet, favorites,
  ratings, payout requests.
- **Admins** (`is_admin`) can read across users (users list, payouts, analytics, flagged).
- **Superadmin only** can change roles and platform settings.
- **Immutable-by-client columns** (money/role) — enforce on every update (see Req 3).
- **Price is admin-controlled** — hosts cannot set their own `price_per_kwh`
  (today: `enforce_admin_pricing` trigger).
- **Device id locks** after admin verification — host can't change `tuya_device_id`
  once `tuya_verified` (today: `protect_listing_device`).
- Also: input validation, parameterized queries (SQL-injection safe), rate limiting on
  auth endpoints, optional audit logs.

> Easiest way to preserve all of this exactly: **keep the DB triggers and the
> SECURITY DEFINER functions**, and have the API call them. Then the DB still enforces
> the money/role rules even if the API has a bug.

---

## Requirement 8 — Environment variables

Remove: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`EXPO_PUBLIC_SUPABASE_*`. Add on the backend:
```
DATABASE_URL=postgres://user:pass@server:5432/gowatt
JWT_SECRET=...
REFRESH_TOKEN_SECRET=...
SMTP_HOST=  SMTP_PORT=  SMTP_USER=  SMTP_PASSWORD=
# Integrations the edge functions used (see next section):
THAWANI_SECRET_KEY=  THAWANI_PUBLISHABLE_KEY=  THAWANI_BASE_URL=
TUYA_CLIENT_ID=  TUYA_CLIENT_SECRET=  TUYA_BASE_URL=
# SMS provider for phone OTP, Google/Apple OAuth client ids/secrets
```
On the app side, `EXPO_PUBLIC_API_URL=https://your-api` replaces the Supabase URL.

---

## Requirement 9 — Remove Supabase SDK (mobile app changes)

`@supabase/supabase-js` is used in **`src/lib/supabase.ts`** (the client) and called
from **every screen** via `supabase.from / auth / rpc / channel / functions.invoke`.
To remove it:
1. Replace `src/lib/supabase.ts` with an **API client** (fetch/axios + token storage).
2. Replace `AuthContext` auth calls with the new auth endpoints (Req 2).
3. Replace every `supabase.from()` and `supabase.rpc()` with API calls (Req 4).
4. Replace `supabase.channel()` with the new realtime client (Req 6).
5. Replace `supabase.functions.invoke()` with API calls to the ported services (below).
6. Remove the `@supabase/supabase-js` dependency.

---

## The 5 edge functions → background services / API endpoints

These are TypeScript (Deno) today; port to your backend stack:

| Function | What it does | Becomes |
|---|---|---|
| `thawani-checkout` | Create/verify Thawani payment, credit wallet | API endpoints `POST /payments/create`, `POST /payments/verify` |
| `control-tuya-switch` | Turn a charger's Tuya smart-switch on/off, read energy | API `POST /devices/switch`, `GET /devices/energy` |
| `auto-shutoff-chargers` | Cron: stop expired sessions, bill them, push customer | **Scheduled job** (every 1 min) |
| `disburse-payouts` | Cron: send due investor payouts to a provider | **Scheduled job** (daily) — needs Oman payout provider |
| `send-push` | Expo push notifications | API/service `POST /notify` |
| `send-watt-email` | Send emails | Uses your SMTP |
| `notify-booking` | SMS/notify on booking | Uses your SMS provider |

Also port the **3 cron jobs** currently in the DB: `auto-shutoff-chargers` (1 min),
`release-no-show-bookings` (10 min), `disburse-payouts` (daily).

---

## Requirement 10 — API documentation

Document every endpoint (OpenAPI/Swagger recommended): request body, response shape,
required auth/role, and error responses. The tables above are the checklist of what
must be documented.

---

## Suggested build order (lowest risk first)

1. DB connection + restore data (users + app data).
2. Auth (register/login/refresh/reset/verify) — reusing the bcrypt hashes.
3. Read endpoints (stations, listings, bookings, wallet) + realtime.
4. 🔴 Money endpoints — **by calling the existing SQL functions**, then test heavily
   (start charge with low balance, stop, verify hold release, verify host paid).
5. Admin + superadmin endpoints.
6. Port the 5 edge functions + 3 cron jobs.
7. Rewrite the mobile app's data layer; remove `@supabase/supabase-js`.
8. Full end-to-end test, then delete the Supabase cloud project.

**Do not go live on the money endpoints until step 4's tests pass** — that is where
customer money is at stake.
