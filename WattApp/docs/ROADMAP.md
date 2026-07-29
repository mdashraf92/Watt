# GO WATT — Enhancement Roadmap

Working loop for every phase:
**Build → Test in Expo Go → Ashraf verifies on phone → Commit → Next phase**

One phase at a time. Never move to the next phase until the current one is verified working.

---

## Phase 1 — Payment Integrity (money can never walk away) 🔴 CRITICAL

**Goal: a customer can NEVER charge without the money being secured first.**

1. **Wallet hold (escrow) model:**
   - Before a session starts, the app reserves (holds) the estimated cost from the customer's wallet.
   - If wallet balance < minimum hold → session cannot start; customer is sent to top-up.
   - During charging, the server deducts in real time from the hold.
   - When the hold is nearly used up → auto-shutoff fires (edge function already exists) and the session ends. Customer physically cannot consume more than they paid for.
   - On session end, unused hold is instantly released back to the wallet.
2. **All billing stays server-side** (already the case — keep it that way; the phone never decides the price).
3. **Wallet redesign** (UI + logic):
   - Clear sections: Available balance / On hold / Transaction history.
   - Top-up via Thawani (already integrated).
   - Every session shows as a clean transaction line with receipt.

**Files affected:** ChargingScreen, WalletScreen, BookingScreen, new DB migration (holds table + triggers), auto-shutoff edge function.

---

## Phase 2 — Automatic Investor Settlement (no payout requests) 🔴 CRITICAL

**Goal: remove the manual payout-request/approval flow completely.**

1. When a session on a private charger completes and is billed:
   - The platform commission (e.g. 20%) goes to GO WATT.
   - The host share (e.g. 80%) is **instantly credited to the investor's earnings balance** — automatic, no admin action.
2. Investor withdraws to bank on their own schedule (or automatic monthly transfer). The admin page changes from "approve requests" to a **read-only settlement report** (who earned what, what was transferred).
3. Commission percentage lives in a settings table so superadmin can change it without code.

**Files affected:** AdminPayoutsScreen → becomes AdminSettlementsScreen, InvestorEarningsScreen, DB migration (earnings ledger + trigger on session completion).

---

## Phase 3 — Device Control & Hardware Trust 🟠 HIGH

1. **Lock the Device ID after admin approval:**
   - Once `tuya_device_id` is set AND the listing is approved by admin, the field becomes read-only in the investor's edit page.
   - Enforced server-side too (DB trigger/RLS) — so even a hacked app can't change it. Only admin can re-assign a device.
2. **Fast on/off control:**
   - Optimistic UI: the switch flips instantly in the app, then confirms with Tuya; rolls back with an error message if the command fails.
   - Show live device status (online/offline/on/off) from Tuya on both the investor screen and during charging.
   - Add a timeout + one automatic retry on Tuya commands so a slow network doesn't leave the switch "stuck".
3. **Hardware ↔ app calculation reconciliation:**
   - Compare kWh reported by the Tuya meter against what the app billed for each session.
   - If mismatch > tolerance (e.g. 5%) → flag the session for admin review.
   - This is the trust layer: neither the customer nor the host can be cheated by a faulty meter.

**Files affected:** InvestorChargerScreen, ChargingScreen, Tuya edge function, DB migration (lock trigger + reconciliation columns).

---

## Phase 4 — Rating After Charging 🟠 HIGH (currently missing, not broken)

1. Add a star-rating card (1–5 + optional comment) on the SessionSummary screen after every session.
2. Save to a `session_ratings` table; a DB trigger updates the station/listing average (`rating`, `total_ratings`) — these columns already exist and already display on the map.
3. One rating per session (enforced in DB). Skippable — never block the customer.

**Files affected:** SessionSummaryScreen, DB migration, i18n (ar + en).

---

## Phase 5 — Superadmin Role & Admin Management 🟠 HIGH

1. New role: `superadmin` (you). Superadmin sees everything admin sees, **plus**:
   - **Admin Management page**: promote a user to admin, demote an admin, see admin activity.
   - **Platform Settings page**: commission %, kWh price defaults, hold minimums.
2. Admins can no longer be created by hand in the database — only by superadmin in the app.
3. RLS policies updated so only superadmin can touch the `role` column for admin/superadmin values.

**Files affected:** new SuperAdminScreen(s), navigation, AuthContext, DB migration (role + RLS).

---

## Phase 6 — My Charger UI Redesign 🟡 MEDIUM

1. Rebuild InvestorChargerScreen with a cleaner layout:
   - Hero card: charger photo/status, big on/off state, today's earnings.
   - Quick stats row: sessions this month, kWh delivered, earnings this month.
   - Bookings list below, edit details behind a single button.
2. Device ID shown as a locked badge (after Phase 3) with "Contact support to change".

---

## Phase 7 — Server Database & Domain (production infrastructure) 🟡 MEDIUM

1. **Production Supabase project** separate from development:
   - Dev project = testing; Prod project = real customers and real money.
   - All 21 migrations + 6 edge functions deployed to prod.
2. **Custom domain** (e.g. `gowatt.om` / `api.gowatt.om`):
   - Emails sent from `@gowatt.om` (professional, not spam-flagged).
   - Payment redirect URLs and deep links on the domain.
   - Later: landing page + app-store links on the domain.
3. Environment switch in the app build (dev points to dev DB, release build points to prod).

---

## Phase 8 — Polish & Additional Improvements 🟢 (my additions)

Things not on your list that the app needs to be complete:

1. **Push notifications** for the money moments: booking confirmed, charging started/finished, wallet credited, investor got paid. (expo-notifications already installed.)
2. **Session history export / receipts** — PDF or share sheet for customers and investors (needed for taxes/records).
3. **Booking no-show handling** — if a customer books but never plugs in, auto-release the slot after X minutes and (optionally) charge a small no-show fee.
4. **Investor onboarding checklist** — a visual stepper: Apply → Approved → Device configured → Live on map. Right now the investor can't easily see where they are in the process.
5. **Admin analytics dashboard** — daily revenue, sessions, kWh delivered, top stations, growth graph.
6. **Offline/poor-network handling** — Oman coverage gaps: queue the stop-charging command, cache the map region, show clear "reconnecting" states.
7. **App Store / Play Store release** — EAS build profiles, app icons/splash, store listings (AR + EN), privacy policy hosted on the domain.
8. **Map provider upgrade** — when Rashid's quote arrives, swap the OSM tile URL (one-line change in OSMMap.tsx) for Arabic-labeled commercial tiles.

---

## Phase 10 — Charger Installation Requests 🟢 (new revenue stream)

For customers who **don't have a charger at home**:
1. New in-app application: "Request charger installation" — home address, parking type, photos, preferred schedule.
2. Admin reviews → quote sent → customer accepts → installation scheduled → charger auto-registered as their listing (they can become an investor immediately).
3. Pricing/margin defined in the Phase 9 business model first.

---

## Phase 9 — Business Model Document 🟢

A proper document (PDF) covering:
- Revenue streams: commission on host sessions, margin on official stations, future subscriptions/fleet deals.
- Unit economics: cost per kWh vs price per kWh, commission %, payback period on a Tuya device.
- The three-sided market: customers / investors (hosts) / GO WATT platform.
- Pricing table for Oman, competitor comparison, 12-month projection.

---

## Suggested Order

| Order | Phase | Why first |
|---|---|---|
| 1 | Phase 1 — Payment integrity | Money leakage is an existential risk |
| 2 | Phase 2 — Auto settlement | Removes your biggest manual workload |
| 3 | Phase 3 — Device lock + fast control | Hardware trust; small + high impact |
| 4 | Phase 4 — Rating | Quick win, visible feature |
| 5 | Phase 5 — Superadmin | Needed before you add more admins |
| 6 | Phase 6 — My Charger UI | Visual, after logic is solid |
| 7 | Phase 7 — Prod DB + domain | Before real launch |
| 8 | Phase 8 — Polish list | Ongoing |
| 9 | Phase 9 — Business model | Parallel to any phase (document work) |
