# GO WATT — Launch Status Report

**Date:** 2 August 2026 · **Target production date:** 10 August 2026 (T‑8 days)
**Audience:** the team. Everything below was read out of the current codebase, not from older docs.

---

## 1. Where we are in one paragraph

The product is **feature-complete and type-clean**. The app is a single Expo/React-Native
binary that serves four roles (customer, host/investor, admin, superadmin) in Arabic and
English, talking to our **own Node/Express + PostgreSQL backend** — the Supabase migration
is finished and the SDK is gone. Money, hardware control and billing all run server-side.
What stands between us and 10 August is **not code, it is infrastructure and accounts**:
the backend has no permanent HTTPS home yet, Thawani production access isn't switched on,
and nothing has been submitted to the stores.

---

## 2. Architecture snapshot

| Layer | What it is | State |
|---|---|---|
| Mobile app | Expo SDK 56 / RN 0.85, TypeScript, React Navigation (role-based navigators, lazy-loaded screens) | ✅ builds clean |
| Design | GO WATT system — #378B5A / #F4A53C / #214A38, Montserrat + Tajawal, animated splash | ✅ done |
| Backend | Node + Express + `pg`, 18 route modules, Zod validation, Helmet, rate limiting, JWT access/refresh | ✅ builds clean |
| Database | PostgreSQL. Money logic lives in SQL functions (holds, billing, splits) with protective triggers | ✅ logic done |
| Realtime | Socket.IO over Postgres LISTEN/NOTIFY | ✅ |
| Maps | OpenStreetMap (no Google key needed, no Maps billing) | ✅ |
| Payments | Thawani hosted checkout + **saved cards (new, 2 Aug)** | ⚠️ needs prod account |
| Hardware | Tuya cloud switch control for private chargers | ✅ code done |
| Notifications | Expo push + in-app inbox + SMTP email + iSmartSMS OTP | ⚠️ needs prod creds |

---

## 3. Feature status

**Customer** — map + search, station details, live availability, booking, QR start, live
session (kWh / cost / CO₂), auto-shutoff protection, session summary + rating, wallet with
holds and history, notification inbox, favourites, in-app directions, profile & car setup.
**Status: complete.**

**Host / Investor** — application flow, admin review (accept/reject), charger listing,
availability toggle, Tuya device binding, bookings, earnings, payout request.
**Status: complete.** Earnings split is automatic; the **bank transfer at the end is still
manual** — no Omani payout provider is wired (Thawani is pay-in only). This is a known,
accepted gap for launch.

**Admin / Superadmin** — users, customer detail, investor applications, payouts, flagged
items, analytics, live map, role management. **Status: complete.**

**Auth** — email + password (validated), phone OTP via iSmartSMS with dev fallback, password
reset by email. Google / Apple sign-in are **not** implemented — buttons are not shown, so
nothing is broken, but note it if the stores ask (Apple only requires Sign in with Apple when
another social login is offered — we offer none, so we are fine).

**Payments — what changed on 2 August:** the "Credit / debit card — coming soon" tile is now
a real payment method. Cards are tokenised by Thawani (we never store a PAN), can be added,
listed, set as default and removed, and when a charging session needs more than the wallet
holds the saved card is charged automatically — including the bank OTP step — and the session
starts without the customer leaving the flow. Implemented against the official
`Thawani-ECommerce-API.yaml`.

**Not present:** automated tests. There is no unit or integration suite in either project, so
release confidence comes from manual regression only. See §6.

---

## 4. Launch blockers (must be done before 10 August)

| # | Blocker | Why it blocks | Owner | Needed by |
|---|---|---|---|---|
| **B1** | **Backend has no permanent HTTPS host.** The preview build points at a temporary `trycloudflare.com` tunnel; the production profile points at `https://go-watt.com`, which is the marketing site. Android release builds refuse plain HTTP, so an IP:port backend will not work. | App cannot reach the API at all | DevOps | **4 Aug** |
| **B2** | Stand up `api.go-watt.com`: DNS, TLS cert, reverse proxy → Node on 8080, `PUBLIC_URL` and `CORS_ORIGIN` set, then `EXPO_PUBLIC_API_URL` in `eas.json` (production + preview) | Same as above | DevOps | **4 Aug** |
| **B3** | Run the DB scripts on the production database: `backend-compat.sql`, `backend-tables.sql`, `backend-realtime.sql`, `backend-saved-cards.sql`. Confirm the admin/role columns exist there (they were only ever created in the old cloud DB). | Login, realtime and cards fail without them | Backend | **4 Aug** |
| **B4** | **Thawani production**: merchant keys in `.env`, `THAWANI_BASE_URL` → `https://checkout.thawani.om`, and ask Thawani to enable **card saving + Payment Intents** (a separate permission from plain checkout). Test end-to-end with real 0.100 OMR first on UAT. | Top-ups and card payments | Ashraf | **5 Aug** |
| **B5** | Schedule the cron jobs (`auto-shutoff` every minute, `no-show`, `disburse`, `reminders`, `reconcile-payments`) with `JOB_SECRET`. Auto-shutoff is money-critical: without it a session can outrun its hold. | Revenue leakage | DevOps | **5 Aug** |
| **B6** | Production credentials for **SMTP** (password reset) and **iSmartSMS** (OTP login, registered sender header) | Users locked out | Ashraf | **5 Aug** |
| **B7** | Store submission: Android AAB via EAS + Play Console listing, data-safety form, privacy URL. iOS needs the Apple Developer account active. | No release | Mobile | **submit 6 Aug** |
| **B8** | Full manual regression on a real device against production, in both languages | Only safety net we have | Whole team | **7–8 Aug** |

### Realistic call on the date
Android on 10 August is achievable if B1–B3 land by 4 August. **iOS is the risk** — first-time
App Store review is commonly 1–3 days and can be longer, and it cannot start until the API is
live. Recommendation: **ship Android on 10 August, treat iOS as a fast follower** rather than
compressing testing to hit both.

---

## 5. Secondary items (nice before launch, safe after)

- Documentation is stale: `GO_LIVE.md`, `deploy/README.md`, `UPDATE.md` and
  `COST_AND_BLOCKERS.md` still describe Supabase edge functions and a dev-login screen that no
  longer exist. Rewrite before any handover, otherwise a new engineer follows the wrong runbook.
- Today's payment work is **uncommitted on `main`** — branch and commit it.
- Automatic bank payout for investors (needs an Omani payout provider).
- Google / Apple sign-in.
- Mobile-charging and trip-planner teasers stay as waitlist cards.

---

## 6. Risks

1. **No automated tests.** Every release is validated by hand. Before 10 August we should write
   a fixed regression checklist (signup → booking → charge → bill → payout) and run it verbatim
   on each build, so the same path is covered every time.
2. **Real money, first time in production.** Wallet holds, splits and refunds have never run
   against live Thawani. Budget a live pilot with small amounts on 7–8 August.
3. **Single backend host.** No redundancy, no monitoring/alerting yet. At minimum: health-check
   monitoring on `/health` and automated Postgres backups from day one.
4. **Compressed timeline.** Eight days with infrastructure, payments certification and store
   review in sequence leaves no slack. The Android-first plan buys that slack back.

---

## 7. Plan to 10 August

| Day | Focus |
|---|---|
| **3 Aug (Sun)** | Commit card work. Provision server, DNS for `api.go-watt.com`. |
| **4 Aug (Mon)** | TLS + reverse proxy live, DB scripts run, `eas.json` URLs updated, first preview build against real API. |
| **5 Aug (Tue)** | Thawani UAT end-to-end (top-up, add card, card charge with OTP), cron jobs scheduled, SMTP + SMS creds in. |
| **6 Aug (Wed)** | Switch Thawani to production, live 0.100 OMR test, build and **submit Android**. |
| **7 Aug (Thu)** | Full manual regression EN + AR on production. Backups + health monitoring on. |
| **8 Aug (Fri)** | Fix whatever regression finds; iOS build submitted if the Apple account is ready. |
| **9 Aug (Sat)** | Buffer. Freeze the code. |
| **10 Aug (Sun)** | **Android live.** iOS follows on review approval. |

---

*Prepared from the codebase on 2 August 2026. The app and backend both compile clean; no code
work is on the critical path — infrastructure and accounts are.*
