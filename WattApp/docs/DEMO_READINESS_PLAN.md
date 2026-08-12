# GO WATT — Demo Readiness Plan (4-Day Sprint)

> **Goal:** a real installable APK, on a real phone, that walks a real end-user
> through the full app — customer, investor, and admin — without anything
> breaking live. Not a full production launch (that's Phase 7, see bottom).
>
> **Working loop, same as every other phase:** I build/fix → you test on the
> APK/device → we check it off → next item. Update the checkboxes as we go so
> this stays the single source of truth for the sprint.

---

## Why the demo format changes the plan

You confirmed the demo is an **installed APK on a real phone**, not Expo Go on
the same Wi-Fi. That one decision drives most of Day 1:

- Expo Go could reach the backend because the phone and laptop share the same
  Wi-Fi network (`192.168.x.x`) — this is exactly the LAN-IP problem we kept
  hitting this session.
- An installed APK has no such shortcut. It needs a **stable, public URL** for
  the backend that works regardless of which Wi-Fi (or mobile data) the demo
  phone is on, and regardless of this laptop's local IP changing.
- Standing up a full production server (Phase 7 — domain, managed Postgres,
  TLS, hardening) is real infrastructure work and doesn't fit in 4 days
  alongside everything else. The pragmatic middle ground: run the backend
  here (Docker Postgres + OSRM already work) behind a **persistent tunnel**
  (e.g. Cloudflare Tunnel) that gives a stable `https://` URL. Same code, same
  data, just reachable from anywhere.

---

## External dependencies we don't control (flag these now, don't discover them on demo day)

| Dependency | Status | Demo risk | Fallback if not resolved in time |
|---|---|---|---|
| **Thawani** (real payment keys) | Broken — current secret key returns `401 Unauthorized` from Thawani's own API; publishable key still missing | Wallet top-up / add-card can't be shown live | Pre-fund demo wallets directly in the database so booking/charging/refund flows still demo end-to-end; show the top-up **UI** and explain the payment gateway is pending Thawani's approval |
| **Omantel SMS OTP** | Waiting on their API whitelist | Real SMS won't arrive | The app already has a dev-only master OTP code (`000000`) outside production — fine for a controlled demo login, just don't present it as "real SMS" |
| **Real Tuya-controlled charger** | Unknown — depends on whether a physical smart plug is set up | Can't show a real plug turn on/off unless real hardware is present | If no hardware is available, demo the flow up to "Start Charging" and narrate that the physical switch integration is proven in code (already used for host chargers) but needs a live device for a physical demo |

None of these block *building* a working demo — they block a couple of specific *live moments*. Each has a fallback above so the demo doesn't stall on something outside our control.

---

## Day 1 — Infrastructure, backend exposure, and blockers

**Environment**
- [ ] Stand up a persistent tunnel (Cloudflare Tunnel or equivalent) to this machine's backend, get a stable `https://` URL that survives laptop restarts and Wi-Fi changes
- [ ] Confirm the router DHCP reservation (offered earlier) is actually done, so the *tunnel target* doesn't silently break either
- [ ] Point `EXPO_PUBLIC_API_URL` (for the EAS build) at the tunnel URL, not a LAN IP
- [ ] Re-verify OSRM (directions) and Mapbox geocoding still respond correctly through the tunnel
- [ ] Confirm `PUBLIC_URL` (used for Thawani redirect links) matches the tunnel URL too

**Blockers**
- [ ] Thawani: reach out to their support for valid secret + publishable keys; verify any new key with a live `curl` test before trusting it (we've been burned twice on this already)
- [ ] SMS OTP: check current Omantel whitelist status; confirm the dev-OTP fallback is reliable for demo login either way
- [ ] SMTP: set up *something* that actually sends email (even a free-tier provider) — right now password-reset and investor-application confirmation emails go nowhere
- [ ] Set a real `price_per_kwh` for the 35 imported EVO/Audi stations (currently the generic placeholder, 0.028 OMR/kWh)

**Data**
- [ ] Build a clean demo dataset: one customer account, one investor/host account (with an approved, working charger), one admin account, one superadmin account — all with sane starting wallet balances
- [ ] Spot-check the EVO/Audi station governorate assignments that were best-effort guesses (the 3 border-area ones) if governorate accuracy will come up in the demo

---

## Day 2 — Customer journey, end to end

- [ ] Sign up / sign in — phone OTP path, email/password path, forgot-password (needs Day 1's SMTP fix)
- [ ] Map: browse official stations, EVO/Audi stations, and private host chargers together; satellite/streets toggle; search (own stations *and* the new Mapbox place search); favorite/unfavorite; tap a pin → station details (type, power, price, status, AR+EN)
- [ ] My Favorites screen — saved chargers appear, tap-through works, remove works
- [ ] Book a charger → wallet hold placed → **Start Charging** → live session screen (overstay banner logic) → **Complete** → star rating → optional photo proof
- [ ] Wallet: top-up flow (1–50 OMR clamp), Thawani checkout redirect (or documented fallback per the table above), saved-card management from both entry points (Profile *and* Wallet)
- [ ] Trip Planner: battery slider, swap button, advanced options (reserve %, consumption rate), place search + "locate me", plan a route, save it, book stops in order from **My Trips**
- [ ] Mobile/roadside charging: request → tracking screen → summary/receipt
- [ ] Report an issue: submit with and without a photo, see status update after admin responds
- [ ] Notifications bell — unread badge, marks read, deep-links correctly
- [ ] Profile: edit vehicle, switch language (confirm RTL layout holds up everywhere, not just text direction), "Become an Investor" banner (dismiss + apply)

---

## Day 3 — Investor and Admin/Superadmin journeys

**Investor**
- [ ] Apply as investor → admin approves → applicant gets notified
- [ ] My Charger: device ID locked after approval, on/off toggle (confirm it only changes *availability*, never physically powers the plug outside a session), self-charge, today's/this-month's earnings, rating
- [ ] Investor Earnings report (if payouts are being demoed) — itemized sessions, share button

**Admin**
- [ ] Admin map: pins for all station types, satellite toggle, search + status filter chips, notification bell
- [ ] Customers list, Investors list (confirm the superadmin-vs-admin visibility rule still holds: superadmin sees only *active* investors, admin sees everyone)
- [ ] Reports inbox: respond to a ticket, close it, confirm the customer sees the response
- [ ] Active Sessions: force-stop-and-bill, force-stop-and-refund — confirm both actually finalize/refund correctly (this is money-critical, worth a careful pass)
- [ ] Payouts: mark paid / reject, view a payout's earnings report
- [ ] Analytics + Flagged Sessions screens load with real data

**Superadmin**
- [ ] Platform Settings (commission %, default price, hold buffer/minimum)
- [ ] Overstay settings (grace period, per-minute fee, safety cap) — currently set to 0.1 OMR/min (no longer 0 — confirm this is the intended demo rate)
- [ ] Mobile-charging settings (callout fee, price/kWh, radius, etc.)
- [ ] Admin management — add/remove an admin by phone number

---

## Day 4 — Validation hardening, real build, dress rehearsal

- [ ] **Input validation sweep** (the thing you flagged specifically): signup fields, phone number formats, price/percentage editors in Superadmin, wallet top-up bounds, report form, booking duration — confirm every one gives a clear error message instead of a silent failure or a confusing server error, on both the client and server side
- [ ] **Error/empty states**: airplane-mode test on a couple of key screens, an empty favorites/bookings/reports list, an expired-session redirect to login
- [ ] **Crash safety**: deliberately try a few bad inputs (empty forms, huge numbers, rapid double-taps on submit buttons) on the highest-traffic screens and confirm nothing white-screens
- [ ] **Build the real APK** (`eas build --profile preview`) pointed at the Day 1 tunnel URL, install it on an actual phone — not Expo Go — since push notifications and a few native behaviors can't be verified in Expo Go at all
- [ ] Confirm push notifications actually arrive on that build
- [ ] **Write the literal click-by-click demo script** — which account logs in first, which charger gets booked, what gets shown on the admin side — so nothing is improvised live and every step has already been tested exactly as it'll be shown

---

## Explicitly out of scope for this sprint

These are real, tracked in `ROADMAP.md`, but don't block a working demo — don't let them creep into these 4 days:

- **Phase 7** — production database + real domain (`go-watt.com` backend, managed Postgres, TLS). Do this *after* a successful demo, as its own effort.
- **Phase 9/10** — business model document, charger-installation-request flow.
- **Phase 11** — real website registration (currently waitlist-only).
- **Phase 15** — registration-field/flow simplification pass.
- **App Store / Play Store submission** — review time alone can take days and isn't something we control.
- **An automated test suite** — none exists today; this sprint is deliberately a manual QA pass instead, since building real test coverage is its own multi-day effort.

---

## How we'll track this

Same convention as `UPDATE.md`: I'll check items off here as we verify them together, and flag anything that turns out broken as we hit it, rather than assuming "built" means "working" — per the progress tracker, almost everything so far is still marked **"awaiting your test,"** which is exactly what this sprint exists to close out.

---

## Live QA Pass — Findings (2026-08-12)

> Tested against the real running backend + database (not just reading code): registered throwaway test accounts, ran real bookings/sessions/refunds through the actual API, then cleaned up every test artifact afterward. Distinct from the static code audit below.

**Fixed:**
- **Duplicate validation messages** — a field failing multiple checks with the same message (e.g. the password policy's three `.regex()` rules) showed the sentence repeated ("Password must be at least 8 characters..., Password must be at least 8 characters..."). Fixed in `backend/src/middleware/validate.ts` by deduping messages before joining — fixes this for every form, not just signup.
- **Wallet top-up had no real upper/lower bound server-side** — the client clamps to 1–50 OMR, but the server's actual check (`thawani.validateAmount`) allowed 0.1–500 OMR. A client bypass or a bug could have topped up 500 OMR in one go. Added a top-up-specific 1–50 OMR check in `backend/src/modules/payments/payments.routes.ts`, deliberately *not* touching the shared `validateAmount` — that looser range is legitimately needed by the separate insufficient-balance "pay shortfall from card" flow, which can charge as little as 0.1 OMR.
- **Stray invisible Unicode character in a real charger's address** — one of the private listings ("Ashraf's" charger near Samail) had a zero-width joiner hidden between "Ad Dakhiliyah" and "Governorate," which would have rendered as `Ad DakhiliyahGovernorate` with no visible space. Cleaned directly in the database.
- **3 stuck "active" charging sessions**, one over a month old (started 7 July), sitting in the database from earlier testing. Would have shown up confusingly in Admin → Active Sessions during the demo. Force-stopped-and-refunded all three via the real admin endpoint (also served as a live test of that endpoint, which worked correctly).

**Verified working correctly (no changes needed):**
- Registration, login, duplicate-email handling, weak-password rejection, phone OTP (including the dev fallback), the new email OTP, forgot-password — all tested end-to-end against the real backend.
- Full booking → wallet-hold → charging session → completion → rating cycle — confirmed billing is computed **server-side from elapsed time**, not from whatever the client submits, which is the correct anti-fraud design.
- Investor application → admin accept → role promotion → charger listing creation → applicant notification — all correct. (Caught and fixed my own testing mistake mid-flow: I briefly promoted the *real* admin account to `investor` by reusing its token for a test submission. Reverted immediately and re-ran the test with a properly isolated throwaway account.)
- The availability toggle correctly never touches the physical switch (`switch_status` stayed `false` the whole time) — confirms the "clean charger control model" fix from earlier in the roadmap still holds.
- Admin force-stop-and-refund: wallet fully restored, session marked `interrupted`, booking marked `cancelled` — all correct.

**New finding, not yet fixed (worth a decision):**
- **No scheduled job runner exists anywhere** — `auto-shutoff`, `no-show`, `reminders`, and `reconcile-payments` are only reachable as manually-triggered HTTP endpoints (`backend/src/modules/jobs/jobs.routes.ts`); nothing in the app calls them on a schedule, not even locally. This is *why* the 3 stuck sessions above existed — nothing ever ran to auto-finalize them. For a real demo/launch this needs either a real cron service hitting these endpoints periodically, or an in-process scheduler (e.g. `node-cron`) added to `backend/src/index.ts`. Not fixed yet — flagging for a decision on approach before building it.
- **Overstay fee is no longer 0** — it's currently set to `0.1 OMR/minute` (checked live), not the `0` this plan assumed earlier. Not a bug — someone already configured it via Superadmin — just updating this doc to match reality.

---

## QA Audit — Code-Level Findings (static, 2026-08-11)

> Full static read of every major screen and shared module. No fixes applied — findings only. Ordered by impact on the demo.

### Health Score Estimate: 61/100

| Category | Score | Notes |
|---|---|---|
| Critical blockers | 0/100 | API URL won't survive demo day as-is |
| Auth flows | 65/100 | Email/password + phone OTP solid; Google/Apple throw alerts |
| Core booking flow | 78/100 | Logic correct; a few edge-case holes |
| Wallet | 72/100 | Thawani flow intact; cap may block demos |
| Map | 80/100 | OSM renders fine; status dot inconsistency |
| Profile | 60/100 | Two visible data bugs; one untranslated string |
| Admin panel | 75/100 | All screens registered; not fully audited |
| i18n / RTL | 85/100 | Both language files present; one hardcoded string found |

---

### CRITICAL — Will break the demo

**QA-001 · API URL is a DHCP LAN IP**
- File: `.env:18`
- `EXPO_PUBLIC_API_URL=http://192.168.10.117:8090`
- An installed APK on a demo phone cannot reach this address unless the phone is on the exact same Wi-Fi with this machine at that IP. The IP changes with DHCP. The EAS build bakes this value at build time — a different network = blank app.
- Fix: set this to the Cloudflare Tunnel URL (Day 1 task) before `eas build`.

**QA-002 · SMTP is not configured — password reset emails go nowhere**
- File: `backend/src/app.ts` (not audited deeply) + Day 1 plan
- `AuthContext.ts:183` calls `api.auth.forgotPassword()` which hits the backend. If the backend has no SMTP transport, the reset link is never sent. Users who forget their password during the demo are permanently locked out.
- Fix: set up even a free-tier SMTP (Resend, Mailgun) before demo day.

---

### HIGH — Visible bugs that embarrass the demo

**QA-003 · Security modal shows phone number in the "Email" field** — ✅ **FIXED**
- File: `src/screens/ProfileScreen.tsx:594`
- Confirmed real. Now shows `session?.user?.email || profile?.phone || '—'`.

**QA-004 · "Edit" button on vehicle card is hardcoded English** — ✅ **FIXED**
- File: `src/screens/ProfileScreen.tsx:782`
- Confirmed real. Added a generic `t.edit` key (AR: "تعديل") and wired it in. `VehicleCard` didn't call `useLang()` at all — added that too, otherwise `t` wasn't in scope there.

**QA-005 · Google and Apple sign-in buttons silently fail with an alert**
- File: `src/context/AuthContext.tsx:158-159`
- Confirmed the stub exists, but as the audit itself notes, neither button is actually rendered in `SignInScreen`/`SignUpScreen` today — zero live surface area. Not touched; revisit only if these buttons get added to the UI later.

**QA-006 · Booking: estimated cost shown as negative without blocking submission** — reviewed, **not a bug, left as-is**
- File: `src/screens/BookingScreen.tsx:607-610`
- Checked the actual money flow: a booking is only a reservation — no funds move until **Start Charging**, which already has its own robust insufficient-balance handling (pay-shortfall-from-card or a clear top-up prompt, verified working in this session's live QA). The debt guard at line 364 (`wallet_balance < -0.5`) is specifically about *existing* unpaid debt from a past session, not this booking's projected cost. Blocking on projected balance here would wrongly prevent a legitimate "I'll top up before I arrive" booking. Red text at booking time is an early warning, not a dead end — left it alone.

**QA-007 · Deep-link scheme `watt://` must be registered in the EAS build** — ✅ **verified fine, no fix needed**
- File: `app.json`
- Checked directly: `"scheme": "watt"` is already present. False alarm.

---

### MEDIUM — Worth fixing before demo; won't crash but will look unpolished

**QA-008 · Wallet top-up hard-capped at 50 OMR**
- File: `src/screens/WalletScreen.tsx:34`
- `const MAX_TOP_UP = 50` — a single EV fast-charge session at 50 kWh × 0.028 OMR = 1.4 OMR, so 50 OMR gives many sessions. But if you demo a DC fast-charge scenario with a higher price-per-kWh, the demo user may need to top up more than once. Decide if 50 OMR is the intentional business cap before the demo.

**QA-009 · About screen shows hardcoded version "1.0.0"** — ✅ **FIXED**
- File: `src/screens/ProfileScreen.tsx:693`
- Confirmed real. Now reads `Constants.expoConfig?.version ?? '1.0.0'`.

**QA-010 · Selected listing card uses `is_available` boolean for status dot — ignores the newer `status` column** — ✅ **FIXED**
- File: `src/screens/MapScreen.tsx:561`
- Confirmed real — exactly as described, a `busy` listing would show green. Now uses `STATUS_COLOR[(selectedListing as any).status] ?? (selectedListing.is_available ? COLORS.available : COLORS.offline)`, matching the pin and station-card logic elsewhere in the same file.

**QA-011 · ChargingScreen shows wrong cost for the first render cycle**
- File: `src/screens/ChargingScreen.tsx:22, 61`
- `pricePerKwh` is initialised to `PRICE_PER_KWH_DEFAULT = 0.028`. It is corrected at lines 190-191 after `fetchSession()` resolves. If the actual charger price differs (e.g., 0.040 OMR), the cost display ticks up using the wrong rate until the fetch completes (~1-2 s). On a fast demo this may not matter, but for chargers priced differently it will show a wrong number briefly.

**QA-012 · Rescue pulse animation runs even when the user is a guest**
- File: `src/screens/MapScreen.tsx:143-157`
- `Animated.loop(...)` starts unconditionally on mount. The button is hidden via `{isAuthenticated && ...}` but the animation loop itself runs. On low-end demo devices this burns an unnecessary animation frame budget. Minor — but worth noting for battery.

**QA-013 · Profile hero subtitle is blank when `profile.phone` is null** — ✅ **FIXED**
- File: `src/screens/ProfileScreen.tsx:307`
- Confirmed real. Now falls back to `session?.user?.email`, and the line only renders at all when one of the two exists (no more blank line).

**QA-014 · Password reset SMTP link: `forgotPassword` endpoint sends the reset URL — confirm the URL includes the correct tunnel domain**
- File: `src/context/AuthContext.tsx:191`, backend `forgot-password` route
- The backend sends `watt://reset-password?token=...` as the reset URL. For this deep link to work in the demo APK, the backend needs to know the correct URL scheme. Check the backend's `forgot-password` handler to ensure it doesn't hardcode `http://localhost` or a LAN IP in the email body.

---

### LOW — Polish; won't break the demo

**QA-015 · WhatsApp support number and email are hardcoded in the Help modal**
- File: `src/screens/ProfileScreen.tsx:657, 665`
- `https://wa.me/96892421050` and `mailto:support@watt.om` are literals in code. Not a crash, but if either changes you need a build update. Consider moving to a config constant.

**QA-016 · Legacy Supabase credentials still present in `.env`**
- File: `.env:22-23`
- The anon key and Supabase URL are still committed (git-ignored but present on disk). These are live credentials for a cloud project you're no longer using. Not shipped in the app (`EXPO_PUBLIC_SUPABASE_*` is referenced but unused after migration), but worth cleaning up to avoid confusion.

**QA-017 · DB connection in `.env` is placeholder text**
- File: `.env:36-42`
- `DB_HOST=your-company-server-ip-or-domain`, `DB_PASSWORD=your-strong-database-password`. These are the values used by migration scripts. If someone runs a migration against this `.env` it will fail or hit the wrong host. Fine for now since Postgres is dockerized locally — just ensure whoever runs `psql -f` knows to set these first.

**QA-018 · `rescueLiveDot` color is `COLORS.primaryDark` (dark green on gold) — low contrast**
- File: `src/screens/MapScreen.tsx:750-754`
- The live-callout dot on the rescue button is dark green against the gold background. Hard to see at a glance. Consider white or a contrasting color.

**QA-019 · MapScreen: station list subtext for private listings shows empty when `operating_hours` isn't set**
- File: `src/screens/MapScreen.tsx:319-321`
- `? item.operating_hours ?? ''` — `operating_hours` on a listing is synthesized in `listingToStation.ts` from `availability_start`/`availability_end`. If those fields are null on a record, the subtext is blank.
- `listingToStation.ts:21` already provides a fallback (`'08:00 – 22:00'`) so in practice this should always be populated — but any listing row where those columns are explicitly null will show empty subtext.

**QA-020 · Booking flow: drum (spin-wheel) time picker doesn't scroll to initial value on fast mounts**
- File: `src/screens/BookingScreen.tsx:73-79`
- The `DrumColumn` uses a 100 ms `setTimeout` to scroll to the initial selected value. On slow JS thread (first load of a lazy screen), 100 ms may not be enough and the drum renders at position 0 (showing "1" for hours), not the computed default.

---

### Summary of top priorities before building the demo APK

| # | Issue | Effort | Must-fix before demo? |
|---|---|---|---|
| QA-001 | API URL → tunnel URL | 5 min (env change + rebuild) | YES |
| QA-003 | Security modal shows phone as email | 1 min | YES |
| QA-007 | `watt://` scheme in app.json | 2 min | YES (password reset) |
| QA-002 | SMTP setup | 1–2 h | YES (reset + notifications) |
| QA-004 | "Edit" hardcoded English | 2 min | Yes |
| QA-006 | Booking lets negative-balance proceed | 10 min | Yes |
| QA-010 | Listing status dot wrong color | 5 min | Nice to have |
| QA-009 | About version hardcoded | 5 min | Nice to have |
| QA-013 | Profile subtitle blank when no phone | 2 min | Nice to have |
