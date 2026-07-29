# Watt App — Update Notes

## Role System

The app has **two user roles**. Every signed-in user has exactly one role stored in `profiles.role`.

| Role | Navigator | Tabs |
|---|---|---|
| `customer` | `CustomerNavigator` | Map · Bookings · Wallet · Profile |
| `host` | `HostNavigator` | Dashboard · My Charger · Earnings · Profile |

After login, `AppNavigator` reads `profile.role` and routes to the correct navigator automatically:

```
session exists + role === 'admin'    → AdminNavigator
session exists + role === 'host'     → HostNavigator
session exists + role === 'customer' → CustomerNavigator
no session                           → DevLoginScreen  (dev mode, see below)
```

Hosts who have no charger listing yet are sent to `HostSetupScreen` first; once they complete setup they land in `HostTabs`.

---

## Dev Mode — Bypassed Auth

The normal login/signup flow is **temporarily disabled** while testing.

### Active right now
```
src/navigation/index.tsx  →  DevLogin screen only (no Splash / RoleSelect / Phone / OTP)
src/screens/DevLoginScreen.tsx  →  three-button quick-login screen
```

### Test accounts (auto-created in Supabase on first tap)

| Role | Email | Password |
|---|---|---|
| Customer | `customer@watt-test.com` | `Watt@test1` |
| Host | `host@watt-test.com` | `Watt@test1` |
| Admin | `admin@watt-test.com` | `Watt@test1` |

The DevLogin screen handles everything:
1. Tries `signInWithPassword` first
2. If user does not exist → calls `signUp` → creates profile with test data → signs in
3. Subsequent taps = instant login, no account creation

### Test customer profile
- Full name: Test Customer
- Membership: Gold
- Wallet: 25.000 OMR
- Sessions: 12 · kWh: 148
- Car: Tesla Model 3

### Test host profile
- Full name: Test Host
- Membership: Standard
- Wallet: 8.500 OMR

### Test admin profile
- Full name: Watt Admin
- Full platform access

---

## How to Restore Normal Auth (before production)

**Step 1** — In `src/navigation/index.tsx`, uncomment the 6 auth imports:

```ts
import SplashScreen from '../screens/SplashScreen';
import RoleSelectScreen from '../screens/RoleSelectScreen';
import PhoneScreen from '../screens/PhoneScreen';
import OTPScreen from '../screens/OTPScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
```

**Step 2** — In the same file, replace the DevLogin block:

```tsx
// Remove this:
<RootStack.Screen name="DevLogin" component={DevLoginScreen} />

// Restore this (already written as a comment in the file):
<RootStack.Screen name="Splash" component={SplashScreen} />
<RootStack.Screen name="RoleSelect" component={RoleSelectScreen} ... />
<RootStack.Screen name="Phone" component={PhoneScreen} ... />
<RootStack.Screen name="OTP" component={OTPScreen} ... />
<RootStack.Screen name="SignIn" component={SignInScreen} ... />
<RootStack.Screen name="SignUp" component={SignUpScreen} ... />
```

**Step 3** — Delete `src/screens/DevLoginScreen.tsx`.

---

## UI Redesign (this session)

### New files
| File | Purpose |
|---|---|
| `src/components/icons.tsx` | 25+ SVG vector icons (replaces emojis throughout) |
| `src/screens/DevLoginScreen.tsx` | Dev-only quick login (remove before production) |
| `src/screens/admin/AdminDashboardScreen.tsx` | Admin analytics dashboard |
| `src/screens/admin/AdminUsersScreen.tsx` | Admin user management |
| `src/screens/admin/AdminApplicationsScreen.tsx` | Investor applications list |
| `src/screens/admin/AdminApplicationDetailScreen.tsx` | Application review + approve/reject |

### Updated files
| File | Changes |
|---|---|
| `src/constants/colors.ts` | Added semantic bg colors: `primaryBg`, `primaryTint`, `successBg`, `errorBg`, `warningBg`, `goldBg`, `backgroundAlt`, `borderStrong` |
| `src/navigation/index.tsx` | Custom tab bar with SVG icons + pill active indicator; admin/dev mode routing |
| `src/screens/SplashScreen.tsx` | Decorative circles, better logo ring, gold animated dots |
| `src/screens/RoleSelectScreen.tsx` | Background decorations, badge chips, SVG arrow buttons |
| `src/screens/SignInScreen.tsx` | SVG back arrow + eye toggle, focused-border input highlight |
| `src/screens/MapScreen.tsx` | SVG search/clear/locate icons, improved bottom sheet + station cards |
| `src/screens/BookingsScreen.tsx` | Scrollable filter tabs, status dot badges, active booking border |
| `src/screens/WalletScreen.tsx` | Decorative balance card, PlusIcon top-up, summary box |
| `src/screens/ProfileScreen.tsx` | Stats card overlapping hero, SVG settings icons, improved modals |
| `src/screens/StationDetailsScreen.tsx` | SVG back + book icons, colored stat cards with top accent |
| `src/screens/HostDashboardScreen.tsx` | Gold HOST badge, earning cards with color accent, better empty state |
| `src/screens/HostChargerScreen.tsx` | Border radius updated to match design system |

---

## Supabase Project

URL: `https://cnwlmbpmgwmhzzjnmltz.supabase.co`

Key tables:
- `profiles` — user accounts (role: customer / host / admin)
- `stations` — official EV stations (15 Oman stations)
- `charger_listings` — private host chargers (blue pins on map)
- `bookings` — all booking records
- `charging_sessions` — active and completed charging sessions
- `wallet_transactions` — top-up / charge / refund / bonus history
- `investor_applications` — investor applications pending admin review
- `connectors` — individual connector status per station

Pending SQL to apply in Supabase SQL Editor:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'host', 'admin'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
```

---

---

# Plan Till Production

## Overview

Watt is a 3-role EV charging platform built for Oman. Every user has exactly one role: **Admin**, **Customer**, or **Host (Investor)**. The goal is a fully self-sustaining marketplace where customers find and book chargers, hosts earn money from their private chargers, and the admin controls and monitors everything from a single panel.

---

## Role 1 — Admin (You / Watt Team)

The admin is the platform operator. There is only one admin account. The admin never books or charges — they manage and control the entire platform.

### What Admin Has Now
- Dashboard with total users, total revenue, bookings count, pending applications alert
- Users screen — search all users, filter by role, change role, delete accounts
- Applications screen — list all investor applications filtered by status
- Application Detail — full review page with Approve (upgrades user to Host) and Reject

### What Admin Still Needs

**Analytics & Reporting**
- Revenue chart by month (line/bar chart)
- Bookings chart by week
- Most active stations (top 5 by bookings)
- User growth over time
- Export reports as CSV or PDF

**Station Management**
- List all 15 official Watt stations
- Edit station details (name, address, price per kWh, power, hours)
- Change station status (available / busy / fault / offline)
- Add new official stations
- View per-station revenue and booking count

**Booking Management**
- View all bookings across all users
- Filter by status, date range, station, user
- Force cancel any active booking
- View booking QR code
- See real-time active sessions

**Charger Listing Management**
- View all private host charger listings
- Approve or suspend a listing
- Edit pricing or availability on behalf of host
- Remove a listing

**Notifications & Broadcasts**
- Send push notification to all users
- Send targeted message to specific user by role or ID
- Announce new stations or promotions

**Admin Profile**
- Admin name and contact details
- Change admin password
- View admin activity log (who approved what, when)

---

## Role 2 — Customer

The customer is the EV driver. They open the app to find a nearby charger, book it, pay, and charge their car.

### What Customer Has Now
- Map screen with official stations (colored pins) and private host chargers (blue pins)
- Search stations by name or governorate
- Station details page (connectors, price, hours, amenities, ratings)
- Booking flow (select duration, estimated cost, confirm)
- Active booking screen — QR code + animated scan line + Start Charging button + countdown timer
- Charging session screen
- Bookings history with filter tabs (all / active / confirmed / completed)
- Wallet — balance card, top-up with Thawani Pay (demo), transaction history
- Profile — stats, car model, membership level (standard / silver / gold), settings
- Language toggle (Arabic / English)
- Investor application form (3-step: personal info → location → package selection)

### What Customer Still Needs

**Map Improvements**
- Filter stations by connector type (Type2, CCS, CHAdeMO)
- Filter by price range
- Filter by availability only
- Show distance in km from user location
- Navigate to station via Google Maps / Apple Maps button
- Station reviews — read and write ratings with comments

**Booking Improvements**
- Select specific connector (not just station)
- Real-time connector availability polling
- Booking reminder push notification 15 min before slot
- Reschedule booking before it starts
- Booking receipt / invoice as PDF

**Charging Session**
- Live kWh counter during active session
- Live cost counter during active session
- Stop charging button (ends session, calculates final cost, deducts from wallet)
- Session summary screen after stop (total kWh, total cost, duration, CO2 saved)
- Share session summary card (for social)

**Wallet**
- Real Thawani Pay integration (not demo)
- Transaction filter (top-up / charges / refunds)
- Refund request button for cancelled bookings
- Low balance warning notification

**Profile**
- Upload profile photo
- Edit email address
- Push notification preferences saved to Supabase (currently UI-only)
- View current investor application status (pending / approved / rejected)
- Loyalty points system tied to kWh charged
- Membership upgrade path: Standard → Silver (20 sessions) → Gold (50 sessions)

**Notifications**
- Push notification when booking is confirmed
- Push notification when charger is ready to use
- Push notification when charging session ends
- Push notification when wallet is topped up

---

## Role 3 — Host (Investor)

The host is a property owner or business who installs a Watt charger at their location and earns money from bookings made by customers. A customer becomes a host by submitting an investor application from their profile — the admin reviews and approves it.

### What Host Has Now
- Dashboard — online/offline toggle, today's bookings, this month earnings, all-time earnings
- My Charger — mini map showing charger location, charger details (type, power, price, hours), edit mode
- Earnings — wallet balance, monthly/all-time earnings, recent transaction list
- Profile (shared with customer profile screen)

### Investor Application Flow (customer → host)
1. Customer taps "Become Investor" in profile
2. 3-step form: personal info, location details, package selection (Basic 15 OMR/mo or Pro 50 OMR/mo)
3. Revenue estimator shows projected monthly earnings
4. Application submitted → status: pending
5. Admin reviews in Applications tab → Approve → customer role upgrades to host
6. Host opens app → lands in HostNavigator automatically
7. Host completes charger setup (map pin + charger details)

### What Host Still Needs

**Dashboard Improvements**
- Weekly earnings chart (bar chart by day)
- Upcoming bookings list for next 7 days
- Average rating displayed prominently
- Occupancy rate (% of available hours that were booked)

**My Charger Improvements**
- Multiple photos of the charger location (upload from gallery)
- Set custom pricing by time of day (peak / off-peak)
- Set blocked dates (charger not available)
- Charger health / connectivity status
- Request maintenance from Watt team button

**Bookings Management**
- Full list of all bookings for their charger
- Filter by status (confirmed / active / completed / cancelled)
- View customer name for each booking
- Block a specific customer if needed

**Earnings & Payouts**
- Payout request button (transfer earnings to bank account)
- Payout history
- Watt commission breakdown (10% deducted, shown clearly)
- Monthly earnings report PDF

**Notifications**
- Push notification when a new booking arrives
- Push notification when a customer starts charging
- Push notification when a booking is cancelled
- Weekly earnings summary every Sunday

**Host Profile**
- Host public rating (average across all bookings)
- Switch to Customer view (host can also use the app as a customer)

---

## Production Checklist

### Auth & Security
- [ ] Restore real auth flow (Splash → RoleSelect → Phone/OTP → SignIn/Up)
- [ ] Delete DevLoginScreen.tsx
- [ ] Enable phone number OTP via Supabase (Twilio or similar)
- [ ] Set up Row Level Security (RLS) for admin-only tables
- [ ] Protect admin routes so only role=admin can access them
- [ ] Rate limiting on auth endpoints

### Payments
- [ ] Real Thawani Pay SDK integration (replace demo top-up)
- [ ] Webhook for payment confirmation
- [ ] Automatic wallet deduction when charging session ends
- [ ] Refund flow for cancelled bookings

### Push Notifications
- [ ] Expo Push Notifications setup (expo-notifications)
- [ ] Save device push token to profiles table on login
- [ ] Supabase Edge Function to send notifications on booking events
- [ ] Admin broadcast notification screen

### Database
- [ ] Apply all pending migrations to production Supabase
- [ ] Add indexes for performance (bookings by user, bookings by station)
- [ ] Set up database backups
- [ ] RLS policies for admin-only queries

### App Store
- [ ] App icon (all sizes) for iOS and Android
- [ ] Splash screen asset
- [ ] App Store description in Arabic and English
- [ ] Google Play listing
- [ ] Privacy Policy URL live
- [ ] Terms of Use URL live
- [ ] Build with EAS Build (not Expo Go)

### Testing
- [ ] Test all 3 roles end-to-end on real device
- [ ] Test booking → charging → session end → wallet deduction full flow
- [ ] Test investor application → admin approval → host navigation
- [ ] Test wallet top-up with real Thawani payment
- [ ] Test Arabic RTL layout on all screens
- [ ] Test on both iOS and Android

---

## Current State (June 2026)

| Feature | Status |
|---|---|
| Customer map + stations | Done |
| Customer booking flow | Done |
| Customer wallet (demo) | Done |
| Customer wallet transaction filter | Done |
| Customer profile + settings | Done |
| Customer profile — investor application status | Done |
| Customer profile — membership progress bar | Done |
| Investor application form | Done |
| Map filters (availability + connector type) | Done |
| Map distance in km + Navigate button | Done |
| Live charging session counters (kWh / cost) | Done |
| Session summary screen (CO₂ saved, share) | Done |
| Host dashboard | Done |
| Host charger management | Done |
| Host earnings screen | Done |
| Host earnings — commission breakdown | Done |
| Host bookings list | Done |
| Admin dashboard | Done |
| Admin users management | Done |
| Admin application review + approve/reject | Done |
| Admin station management (view + change status) | Done |
| Admin station — add new station | Done |
| Admin bookings management (view + force cancel) | Done |
| Real auth flow (OTP) | Bypassed for dev |
| Real Thawani Pay | Not started |
| Push notifications | Not started |
| Host payout system | Not started |
| App Store submission | Not started |
----------------------------------------------------------------------------------------------------------------------------------
 📊 Watt App — Full Analysis & Code Review

  What you have

  A genuinely complete dual-role EV charging app — much further along than "needs building":

  ┌─────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │    Area     │                                                     State                                                      │
  ├─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ App         │ Expo SDK 56 / React Native 0.85 — the current stack, works on both iOS & Android by design                     │
  ├─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Screens     │ 30 screens across 4 roles: Guest, Customer, Investor, Admin — all wired                                        │
  ├─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Backend     │ Supabase: 21 migrations, 6 edge functions (Thawani payments, Tuya hardware control, push, email, auto-shutoff) │
  ├─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Money layer │ Server-side billing, wallet protection triggers, payment verification — already hardened                       │
  ├─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ i18n        │ Full Arabic + English with RTL                                                                                 │
  └─────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Code review findings

  ✅ What's genuinely good (worth saying — this is above-average work):
  - complete_charging_session RPC is excellent: idempotent (can't double-charge), row-locked, prices come from the server never the phone, kWh capped at
  physical limits
  - Thawani checkout verifies user identity, session ownership, and amount bounds server-side
  - The profile trigger makes role/wallet_balance immutable from the client — users can't make themselves admin or give themselves money

  🔴 Blocker — free-charging loophole (supabase/schema.sql:212)
  The RLS policy sessions: update own lets a user update their own charging session directly. A technical user could mark their session completed with cost 0
  before calling the billing RPC — the RPC would then see "already completed" and never charge them, even though they physically received electricity.
  Fix: remove the client update policy on charging_sessions; all completion must go through the RPC. ~10-line migration.

  🟡 Should fix before launch:
  1. wallet: insert own (schema.sql:216) — users can insert fake rows into their transaction history (balance is protected, but the ledger can be polluted).
  Inserts should be server-only.
  2. devProfile/devSignIn bypass still ships in AuthContext.tsx — nothing calls it today, but dead login-bypass code shouldn't go to the App Store.
  3. Google Maps Android key in app.json is an unrestricted dev key (already tracked in your GO_LIVE.md step 5).

  💭 Minor: tab bar uses hardcoded iOS bottom padding instead of safe-area insets (affects older iPhones); check_email_exists lets anyone probe which emails are
  registered (a deliberate UX choice — fine, just know it).

  The honest part

  The app doesn't need "building" — it needs the 3 fixes above, then store builds. Your own GO_LIVE.md is accurate: what's left after code fixes is account work
  only you can do — eas login/eas init (Expo account), Apple Developer ($99/yr), Thawani merchant keys, privacy policy URL. I can guide you through each but
  can't log in for you.

  ---
  Proposed plan (the /loop)

  A self-pacing loop that each cycle: fix → verify → report, until the app is store-ready:

  1. Cycle 1: Apply the security migration (close the free-charging hole + wallet ledger), remove dev bypass code, fix safe-area padding
  2. Cycle 2: Run TypeScript check + expo-doctor, verify nothing broke, deploy the migration to your Supabase project
  3. Cycle 3: Walk you through eas init + kick off iOS & Android builds, monitor them, fix any build errors that surface
  4. Ongoing cycles: re-check build status, resolve issues, until both an .aab (Android) and .ipa (iOS) exist


# 🔄 Enhancement Phases — Progress Tracker

> Full details of every phase are in **ROADMAP.md**. This table is the live status —
> updated after every work session so Ashraf can review progress at any time.
>
> **Working loop:** Build → Ashraf tests in Expo Go → verified → commit → next phase.

| # | Phase | What it covers | Status |
|---|-------|----------------|--------|
| 1 | 💰 Payment integrity | Close free-charging security hole · wallet hold (escrow) before charging · auto-shutoff when hold runs out · wallet redesign (Available / On-hold / History) | 🟢 **BUILT — awaiting your review + test** |
| 2 | 🏦 Auto investor settlement | Remove payout requests — investor credited automatically when session ends · admin page becomes read-only settlement report · commission % in settings | 🟢 **BUILT (needs payout provider to go live)** |
| 3 | 🔌 Device control & trust | Lock device ID after admin approval (UI + database) · fast optimistic on/off switch · live Tuya status · kWh meter-vs-billed reconciliation | 🟢 **BUILT — awaiting your review + test** |
| 4 | ⭐ Rating after charging | Star rating card on session summary (was never built — that's why it "doesn't work") · updates station/listing average | 🟢 **BUILT — awaiting your review + test** |
| 5 | 👑 Superadmin | New superadmin role · promote/demote admins from the app · platform settings page (commission %, prices, hold minimum) | 🟢 **BUILT — awaiting your review + test** |
| 6 | 🎨 My Charger UI redesign | Hero card with status + today's earnings · quick stats · locked device badge | 🟢 **BUILT — awaiting your review + test** |
| 7 | 🌐 Production DB + domain | Separate production Supabase · gowatt domain for emails, payments, links | ⚪ Not started |
| 8 | ✨ Polish & extras | ✅ connection-retry safety net · ✅ admin analytics · ✅ receipt share · ✅ no-show auto-release · ⏳ push (coded, needs dev build) · ⬜ onboarding stepper · ⬜ offline · ⬜ store release · ⬜ map provider | 🔵 **IN PROGRESS** |
| 9 | 📄 Business model document | Revenue streams · unit economics · commission structure · 12-month projection · **includes the charger-installation-request service** | ⚪ Not started |
| 10 | 🏗️ Charger installation requests | Customers without a home charger apply in-app for GO WATT to install one (new revenue stream — depends on Phase 9 pricing) | ⚪ Not started |

### Phase log

*(newest first — one entry per completed work session)*

- **2026-07-19** — Roadmap created (ROADMAP.md). Progress tracker added. Phase 1 started.
- **2026-07-19** — **Phase 1 built.** Prepaid wallet-hold model implemented (details below).
- **2026-07-19** — **Phase 2 built.** Automatic investor payouts (gated off until a payout provider is added). Details below.
- **2026-07-19** — **Phase 3 built.** Device ID lock after approval, fast on/off, meter reconciliation. Details below.
- **2026-07-19** — **Phase 4 built.** Star rating after charging (the missing feature). Details below.
- **2026-07-19** — **Phase 5 built.** Superadmin role, admin management, platform settings page. Details below.
- **2026-07-19** — **Phase 6 built.** My Charger screen now shows real earnings (today + this month). Details below.
- **2026-07-20** — **Phases 1–5 DEPLOYED** to the cloud Supabase project (all migrations + both edge functions). Verified.
- **2026-07-20** — **Phase 8 started.** Connection-retry safety net: the app no longer hangs forever if the profile can't load — it shows a "Couldn't connect · Try Again" screen (with Sign out). Files: `AuthContext.tsx`, `navigation/index.tsx`, i18n.
- **2026-07-20** — **Phase 8 batch.** Admin analytics dashboard, session receipt share, and no-show auto-release built + deployed; push-on-auto-stop coded (not yet deployed). Details below.

---

## 📋 Phase 8 — Review Notes (Polish batch)

### 1) Connection-retry safety net ✅ (deployed in app code)
If the app is logged in but can't load your profile (no internet, server down), it now
shows a **"Couldn't connect · Try Again"** screen with a Sign-out option — instead of
the endless spinner you hit during testing.

### 2) Admin analytics dashboard ✅ (live)
New **Analytics** page (Admin → Profile → Analytics): revenue, sessions, and kWh for
**Today / This Month / All Time**, a flagged-sessions count, and the **top 5 chargers**
this month. Backed by a new admin-only `get_admin_analytics` function (deployed).

### 3) Session receipt share ✅ (in app code)
The charging summary screen now has a **"Share receipt"** button — sends a clean text
receipt (station, date, energy, duration, cost, CO₂) via the phone's share sheet
(WhatsApp, email, etc.). No new dependency. (A formatted PDF version can be added later
with `expo-print` if you want it.)

### 4) No-show auto-release ✅ (live)
If a customer books but never starts charging, the booking is automatically marked
**no-show once its time window fully passes**, which **frees the slot** for others.
Runs every 10 minutes (pg_cron job `release-no-shows`). No fee is charged (no money was
ever held). A small no-show fee can be added later if you want one.

### 5) Push notification on auto-stop ⏳ (coded, not deployed)
When a session is auto-stopped (customer away from phone), the code now sends them a
**"Charging finished · charged X OMR"** push. This is **written but intentionally not
deployed yet**, because:
- Push **can't be tested in Expo Go** — it needs a real **dev build** (EAS).
- It needs `PUSH_INTERNAL_SECRET` configured as a Supabase secret.
- It touches the **critical auto-shutoff billing** function, so I won't push it live
  until it can actually be verified.
When you do a dev-build testing pass, we deploy the updated `auto-shutoff-chargers`
and confirm the push arrives.

### 🎫 Booking Page Redesign — plan & loop (2026-07-20)

**Goal: a customer books in under 30 seconds with as few taps as possible.**

Why the current page is slow (analysis):
- Time is chosen with **3 scroll wheels** (hour + minute + AM/PM) — 60 minute
  options to scroll through, precise flicking, easy to land on a taken time.
- You only discover a time is booked **after** dialing it in.
- Duration needs the **keyboard** (typed minutes).
- Total: ~6–10 fiddly interactions per booking.

New design — "tap · tap · book":
1. **Day chips** (Today preselected) — 0–1 tap
2. **Duration chips** (30m/1h/1.5h/2h/3h + a −15/+15 stepper, no keyboard) — 0–1 tap
3. **Start-time grid**: every free half-hour shown as a tappable pill, grouped
   Morning/Afternoon/Evening/Night. Taken/past times are hidden or greyed.
   The **earliest free time is auto-selected** — 0–1 tap
4. Big sticky **Book · price** button — 1 tap
→ Fastest path is **1 tap**; typical is 2–4 taps, well under 30 seconds.

Build phases + loop:
| Phase | What | Status |
|---|---|---|
| A | UX analysis + target flow (this plan) | ✅ |
| B | Build the new one-screen flow (slot grid, chip durations, auto-select, sticky CTA) | ✅ (v1) |
| C | Arabic + English + RTL for all new labels | ✅ |
| D | TypeScript check + `/code-review` on the diff, fix findings | ✅ (2 findings found & fixed) |
| E | **Loop v1**: Ashraf tested → wants a STEP WIZARD instead, + Full-charge + h/m picker | ✅ feedback taken |

### 🎫 Booking Redesign v2 — STEP WIZARD (Ashraf's direction, 2026-07-20)

One decision per screen, with a progress bar and Back/Next:
- **Step 1 — Day**: pick the day. Shows the **current time** ("Now 2:45 PM").
- **Step 2 — Start**: **Start now** (today) or pick a free start time.
- **Step 3 — How long?** two modes:
  - **⚡ Full charge** — charger booked until the car finishes / the window ends
    ("no end time"). You only pay for the energy actually used.
  - **⏱ Set a time** — pick **hours + minutes** (steppers, no keyboard).
- **Step 4 — Confirm & Book**: full summary → one Confirm button.

⚠️ **How "Full charge / no end time" works with the money system (important):**
A charger can't be *literally* open-ended — the double-booking guard and the
auto-shutoff both need an end. So Full charge = **reserve the longest free window**
from your start (until the next booking or the charger's closing time, capped at 8h),
turn the plug on, and **bill only the real kWh used** — the unused part of the prepaid
hold is released automatically (Phase 1 already does this). In practice: "charge my
car fully without guessing a duration, pay only for what it takes."
Known limitation: if the car finishes early and the customer walks away without
tapping Stop, the slot stays reserved until the window ends or auto-shutoff. A future
"detect charging complete (power→0) and auto-stop" upgrade removes that.

| Phase | What | Status |
|---|---|---|
| B2 | Build the 4-step wizard (day → start → duration modes → confirm) | 🔵 |
| C2 | AR/EN/RTL for wizard labels | 🔵 with B2 |
| D2 | tsc + `/code-review` on the diff, fix findings | ⬜ |
| E2 | **Loop**: Ashraf tests → adjust → done | ⬜ |

Unchanged under the hood: availability via `get_booked_slots`, debt-cap check,
the overlap-safe DB constraint, host push notification, navigation to ActiveBooking.

### 🧍 Customer Profile & Payment Setup flow (2026-07-20)

Requested flow:
- Signup stays name/email/password only.
- **After signup → a skippable popup** nudges "complete your profile".
- **When the customer picks a charger to book → profile completion is required first:**
  car details (battery size, connector type, make/model) → then a **payment method**
  step → then the booking. Saved to the profile, editable later.

⚠️ **Card storage:** raw card numbers are never stored (PCI law). Decision: build the
full profile + car details + a **payment-method screen shell now** (card entry shown
as "coming soon"), and wire real **Thawani tokenized saved-cards** later. The wallet
remains the working payment rail in the meantime.

| Phase | What | Status |
|---|---|---|
| P1 | DB: car fields on profile (battery_kwh, connector_type, car_make) + prompt flag | ✅ deployed |
| P2 | Post-signup skippable "complete profile" popup | ✅ |
| P3 | Complete-Profile screen: car details form | ✅ |
| P4 | Payment-method step (wallet + "add card coming soon" shell) | ✅ |
| P5 | Booking gate: picking a charger requires a complete car profile first | ✅ |
| P6 | Editable later from Profile (Car & payment row) · car-specific full-charge estimate · tsc + /code-review | 🔵 |

### ✅ Admin flagged-sessions review (2026-07-21)
Completes Phase 3's meter-vs-billed reconciliation. Admin → Analytics → tap the
"flagged sessions" banner → a review screen listing each mismatch (meter vs billed
kWh, % difference, customer, charger) with a **Mark reviewed** button. Backed by
`get_flagged_sessions_detail` + `resolve_flagged_session` (deployed live).

### ✅ Charger reviews on Station Details (2026-07-21)
Surfaces the Phase 4 ratings: the station details screen now shows a **Reviews**
section — average + count, and recent written reviews (reviewer first name, stars,
comment, date). Backed by `get_charger_reviews` (deployed; returns first-name-only
for privacy). Social proof that helps customers choose a charger.

### ✅ Favorite chargers (2026-07-21)
Customers can save chargers for quick access. A **heart button** on the station
details screen toggles favorite; **favorited stations float to the top** of the
map's nearby list with a heart marker. New `favorites` table (RLS: own only,
deployed). Regular drivers reach their usual charger in one tap. (Official stations
now; private-listing favorites can be added later — the table already supports them.)

### Still open in Phase 8 (not started)
Investor onboarding stepper, offline/poor-network handling, App/Play Store release,
and the map-provider swap (waiting on Rashid's quote).

### What changed (files)
- Migrations (live): `20260720_admin_analytics.sql`, `20260720b_no_show_release.sql`
- App: `AuthContext.tsx`, `navigation/index.tsx`, new `AdminAnalyticsScreen.tsx`,
  `AdminProfileScreen.tsx`, `SessionSummaryScreen.tsx`, types + AR/EN text
- Edge fn (repo only, not redeployed): `auto-shutoff-chargers` push block

---

## 📋 Phase 1 — Review Notes (Ashraf, please read before testing)

### The problem this fixes
Before: a customer could book with **no money**, charge their car, let the wallet go
negative, tap "Pay Later", and walk away. The debt cap was only 0.5 OMR. **Money could leave.**

### The new logic — "Prepaid Hold" (like a hotel deposit)
1. When the customer taps **Start Charging**, the app now asks the server to
   **reserve (hold)** the estimated cost of the session from their wallet — *before*
   the charger is switched on.
2. If they don't have enough money → charging **will not start**; they're sent to top up.
   The charger never powers on.
3. While charging, the real cost is tracked. **The final bill can never be more than
   what was held**, so the wallet can never go negative.
4. When they stop, any **unused hold is instantly released** back to their available balance.
5. This is enforced **on the server**, so even a hacked app can't bypass it.

The wallet now shows two numbers:
- **Available to Spend** = what a new charge can use
- **On Hold** = reserved for the session in progress (shown only during charging)

### What changed (files)
- **New database migration** `supabase/migrations/20260719_prepaid_wallet_hold.sql`
  - Adds `held_balance` (on the customer) and `held_amount` (on each session)
  - New `start_charging_session` function — checks money, places the hold, starts the session
  - Rewrote billing into one shared function used by **both** the app-stop and the
    automatic-shutoff — so they can never disagree. Caps the bill at the held amount.
  - Hold-size settings the admin can tune later: 25% buffer, 1.000 OMR minimum
- **App:** `ActiveBookingScreen` (reserves money first), `WalletScreen` (Available / On-hold),
  plus Arabic + English text and the auto-shutoff server function.

### ⚠️ Before this works on your phone — ONE step needed from us
The database migration must be **deployed to your Supabase project**, and the updated
auto-shutoff function **re-deployed**. I did **not** push these to your live database yet —
I'll do it with you so you can watch, or you approve and I run it. Until then the app
code expects columns that don't exist in the DB, so **test only after we deploy**.

### What to test once deployed
1. Empty wallet → try to charge → should be blocked with "top up" prompt.
2. Top up → start charging → wallet shows the amount moving to **On Hold**.
3. Stop early → unused hold returns to Available; you're billed only for what you used.
4. Let a booking run to its end → auto-shutoff bills correctly and releases the hold.

### Note
Investor **self-charging** (owner charging their own car) is unchanged — no hold is
placed there because they're paying themselves.

---

## 📋 Phase 2 — Review Notes (Automatic Investor Payouts)

### Your model (confirmed)
```
Customer pays → Company Thawani account → commission kept automatically
             → the rest becomes the investor's balance
             → automatically sent to the investor's bank (payout API)
```

### What was already working
The **automatic split** already happens on every completed charge: the company
keeps its commission % and the investor is credited the rest. That part needed
no change. ✅  (Commission % lives in a setting the admin can change: `host_commission_rate`.)

### What Phase 2 adds — the automatic *outbound* payout
1. A scheduled server job (`disburse-payouts`) runs on a timer, finds every
   investor whose balance has reached the payout amount **and** who has saved
   their bank details, and **sends the money to their bank automatically**.
2. **No more "request payout" for investors** and **no more approve/reject for you.**
3. The old admin Payouts screen is now a **read-only log** — you just watch payments
   go out (Processing → Paid, or Failed if a transfer bounces; failed ones are
   auto-refunded and retried next run).
4. The investor Earnings screen no longer has a manual withdraw form — it just asks
   them to keep their bank details current, and tells them payouts are automatic.

### ⚠️ Important: this needs a payout provider to actually send money
Thawani (your current gateway) only **collects** money — it can't **send** money out
to someone's bank automatically. To make auto-payout truly hands-free you need a
**disbursement/payout provider** in Oman (a bank or fintech with a transfer API).

Because of that, Phase 2 ships **switched OFF and safe**:
- Master switch `payout_auto_enabled` = **false**
- `payout_provider` = **empty**
- Until BOTH are set, the job does nothing — zero risk deploying it.

When you get a provider, we plug its API into one clearly-marked spot in
`disburse-payouts/index.ts`, set the two config values, and it goes live.

**Interim option (your call):** until a provider exists, you can still pay investors
by reading the same log and doing the bank transfers by hand — the amounts and IBANs
are all there. If you'd prefer that as the day-one flow, tell me and I'll switch the
log into a simple "to-pay" checklist with a mark-as-paid button.

### What changed (files)
- **New migration** `20260719b_auto_payouts.sql` — settings, `enqueue_auto_payouts`
  and `settle_auto_payout` functions, extended payout table. All gated OFF by default.
- **New server function** `supabase/functions/disburse-payouts/` — the scheduled payer
  (with a labelled slot for the future provider API).
- **App:** `AdminPayoutsScreen` → read-only log; `InvestorEarningsScreen` → bank-details
  only + auto-payout info; status badge + Arabic/English text.

### Deploy steps (later, with Phase 1)
Migration + the new edge function must be deployed, plus a **cron schedule** set for
`disburse-payouts` (e.g. once daily). Not deployed yet.

---

## 📋 Phase 3 — Review Notes (Device Control & Trust)

### 1) Device ID locks after admin approval (your #1 request)
- Once you (admin) **verify** a charger's device, the investor **can no longer change
  the Device ID** on their edit page — it shows as a locked 🔒 field with a
  "contact support to change" note.
- This is enforced **on the server too** (a database rule), so even a tampered app
  can't change or move the device. Only an admin can re-assign it.
- Bonus security fix: an investor can no longer mark their **own** device as
  "verified" — only an admin can. (Previously the app's database rules didn't stop that.)

### 2) Fast, reliable on/off switch
- The charger toggle now flips **instantly** (optimistic) so it feels immediate.
- It then confirms with the physical device, with a **7-second timeout and one retry**.
- **Bug fixed:** before, if the hardware command failed, the app still showed the
  charger as "on" and saved that — so the map could show a charger available that
  was actually off. Now, if the device doesn't respond, the switch **rolls back**
  and tells the investor to check the charger.

### 3) Hardware ↔ App reconciliation (catching faulty meters)
- Every session now records the **device's own energy meter reading** next to the
  amount we billed.
- If the two disagree by more than a tolerance (25% and at least 0.5 kWh), the
  session is **auto-flagged for admin review** — so a faulty meter can't quietly
  overcharge a customer or shortchange an investor.
- A `get_flagged_sessions` report is ready for the admin app; a dedicated "flagged
  sessions" review screen can be added to the admin dashboard in Phase 8.

### What changed (files)
- **New migration** `20260719c_device_lock_and_reconcile.sql` — device-lock rule,
  reconciliation columns + flagging, updated billing function, flagged-sessions report.
- **App:** `InvestorChargerScreen` (locked device field + fast optimistic toggle),
  `ChargingScreen` (sends the meter reading on stop), types + Arabic/English text.

### To test once deployed
1. As admin, verify a charger → open the investor edit page → Device ID is locked 🔒.
2. Toggle the charger on/off → it flips instantly; unplug/disable the device and
   toggle → it should roll back with a "didn't respond" message.
3. (Needs hardware) run a session where the meter and estimate differ → the session
   is flagged.

---

## 📋 Phase 4 — Review Notes (Rating After Charging)

### Why it "wasn't working"
The rating feature was **never actually built**. The map already showed a star rating
for each charger, but there was no screen anywhere for a customer to *give* a rating —
so the number never changed. This adds the missing piece.

### What's new
- After a charging session ends, the **receipt screen now shows a 5-star rating card**
  with an optional comment box.
- Submitting updates that charger's **average rating and rating count** (the numbers
  already shown on the map and charger cards).
- **One rating per session** (a customer can change it, but not stack multiple).
- Fully **skippable** — it never blocks the customer from leaving the screen.

### What changed (files)
- **New migration** `20260719d_session_ratings.sql` — ratings table + `rate_session`
  function that recomputes the average.
- **App:** `SessionSummaryScreen` (star card + comment), `ChargingScreen` (passes the
  session id through), param types + Arabic/English text.

### To test once deployed
Finish a charge → on the receipt, tap stars → submit → reopen that charger on the map
and confirm its rating updated.

### Small note
If an investor rates a session on **their own** charger (self-charge), it currently
counts. Minor; can be excluded later if you want only customer ratings to count.

---

## 📋 Phase 5 — Review Notes (Superadmin & Admin Management)

### What's new
1. **A new top role: `superadmin` (you).** A superadmin sees everything an admin
   sees, plus a new **Superadmin** page (reached from Admin → Profile → Settings).
2. **Manage admins from the app** — no more editing the database by hand:
   - See the list of current admins.
   - Add a new admin by entering their **phone number** → "Make Admin".
   - Remove an admin with one tap.
3. **Platform Settings page** — change these live, no code needed:
   - **Commission %** (your cut of each charge)
   - **Default price** for new chargers
   - **Auto-payout threshold** (when investors get paid)
   - **Automatic payouts** on/off switch
   - **Payout provider** (the slot for your future Oman payout provider)

### Security (important)
- Only a **superadmin** can create or remove admins — enforced **on the server**.
  A normal admin can no longer promote anyone (previously the database didn't stop
  that; now it does). An investor also can't secretly mark their own device "verified".
- The platform settings can only be changed by a superadmin.

### ⚠️ First superadmin — how you become one
There can't be a superadmin until one exists, and only a superadmin can make more.
So the migration **automatically promotes your existing admin account**
(`admin@watt-test.com`, "محمد اشرف") to superadmin the first time it's deployed.
(Your other email `mdashraf@ankaa.om` isn't registered in the database, so it
can't be used until you sign up with it.) To use a different account, tell me
before we deploy.

### What changed (files)
- **New migration** `20260719e_superadmin.sql` — the role, `is_superadmin()`,
  tightened role-change security, admin-management + settings functions, and the
  one-time bootstrap of your account.
- **New screen** `SuperAdminScreen.tsx` (settings + admin management).
- **App:** navigation now routes superadmin like admin + adds the Superadmin page;
  an entry appears in Admin → Profile only for superadmins; types + AR/EN text.

### To test once deployed
Log in as your account → Admin → Profile → tap **Superadmin** → change the commission
and save; add/remove a test admin by phone number.

---

## 📋 Phase 6 — Review Notes (My Charger UI)

### What changed
The investor's **My Charger** screen now surfaces real money instead of placeholder stats:
- **Hero card** now shows a **"Today's earnings"** line under the on/off switch.
- The stats row now shows **This month's earnings**, **sessions this month**, and the
  charger's **rating** (was: total bookings / price / rating).
- The **device shows as a locked badge** once verified (from Phase 3), and everything
  else — edit behind one button, self-charge, bookings list — stays as before.

The earnings numbers are computed from the investor's real "earning" wallet
transactions (today and current month).

### Note on scope
This was done as a **focused, safe update** rather than tearing the whole screen apart —
so the on/off switch, device lock, and self-charge logic from Phase 3 stay intact and
proven. If you want a bigger visual overhaul (photos, new layout), we can do that once
you've tested the current version.

### What changed (files)
- `InvestorChargerScreen.tsx` — earnings fetch + hero earnings strip + new stats row;
  Arabic/English text.

### To test once deployed
Open **My Charger** as an investor with earnings → confirm today's + this month's
numbers look right.

---

## 📋 Charger Control Model — clarified (fixes the "who turns it on/off" problem)

### The problem
The investor's on/off toggle was doing **two different jobs at once**: it both
listed the charger *and physically powered the plug*. That meant an "available"
charger was live-powered — so a customer could plug in and charge **for free**
without booking or paying, and it was unclear who really controls the switch.

### The clean model (now)
Two separate things, each with one clear owner:

| Thing | Who controls it | What it does |
|---|---|---|
| **Availability** (online/offline) | The **investor** | Just a flag: "can customers see and book my charger?" It does **not** power the plug. Instant, no hardware needed. |
| **Power** (the physical switch) | The **system**, only during a session | The plug turns on **only** when an authorised session starts (a customer who booked + paid taps Start, or the investor self-charges), and turns off when the session ends or the booking time runs out. |

### Why this is safe and simple
- **No free electricity** — the plug is OFF whenever nobody has an active paid
  session, so a customer can't just plug in.
- **Two people can't clash** — power follows the *single* active session, and only
  one session can run on a charger at a time (bookings can't overlap). The investor's
  availability toggle never touches power, so it can't fight with a charging customer.
- **The investor still can't cut someone off** — turning "unavailable" is blocked
  while a customer is mid-charge.
- **Faster + more reliable** — the availability toggle no longer waits on the Tuya
  device to respond, so it never hangs or gets stuck.

### What changed (files)
- `InvestorChargerScreen.tsx` — the availability toggle now only sets the listing
  flag; the physical switch is left entirely to the session lifecycle (start/stop/
  auto-shutoff, which already power it on and off).


