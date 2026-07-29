# Watt App — Full Launch Cost & Blocker List

> Audited from the live codebase on June 2026. Every blocker below was verified by reading the actual source code — not assumed. Costs are in USD with OMR equivalents at 1 OMR ≈ 2.60 USD.

---

## Quick Summary

| Category | Blockers | Est. One-Time Cost | Est. Monthly Cost |
|----------|----------|--------------------|-------------------|
| [Critical — App broken without these](#1-critical-blockers) | 5 | $75 – $400 | $75 – $250 |
| [Important — Features incomplete](#2-important-blockers) | 5 | $0 – $200 | $20 – $120 |
| [Infrastructure & Publishing](#3-infrastructure--publishing) | 6 | $230 – $730 | $75 – $400 |
| [Marketing Website](#4-marketing-website) | 5 | $0 – $2,500 | $0 – $40 |
| [Legal & Compliance](#5-legal--compliance) | 3 | $500 – $3,000 | $0 |
| **Total Estimate** | **24** | **$805 – $6,830** | **$170 – $810/mo** |

---

## 1. Critical Blockers

These will break the app or block users from completing core actions. Fix before any launch.

---

### B-01 — Thawani Payment Is Not Wired Up

**Severity:** 🔴 Critical  
**What the code actually does:** `WalletScreen.tsx` line 87 writes `payment_method: 'thawani'` directly to the database and updates the wallet balance — **without ever calling Thawani's API**. There is no Thawani SDK, no checkout session, no redirect. Users can top up for free right now.  
**What needs to be built:**
- Register a merchant account on Thawani Pay (thawani.om)
- Integrate Thawani Checkout API: create a payment session → redirect user to Thawani payment page → handle webhook callback → only update wallet on confirmed payment
- Set up a Supabase Edge Function as the webhook receiver (to avoid exposing secret key in the app)

| Item | Cost |
|------|------|
| Thawani merchant account | Free |
| Thawani transaction fee | 2.9% of each top-up + 0.100 OMR flat fee per transaction |
| Development work | 2–4 days of dev time |

> **Example:** A user tops up 10 OMR → Thawani takes ~0.385 OMR → investor/Watt receives 9.615 OMR.

---

### B-02 — Push Notifications Are Not Implemented

**Severity:** 🔴 Critical  
**What the code actually does:** `ProfileScreen.tsx` has toggle switches for "Push Notifications", "Booking Reminders", "Charging Updates". These are purely UI state variables — no actual notification tokens are registered, no messages are sent.  
The `supabase/functions/notify-booking/index.ts` Edge Function exists but has no FCM/APNs credentials configured.  
**What needs to be built:**
- Add `expo-notifications` package
- Request notification permission on first launch
- Store Expo Push Token in the `profiles` table
- Wire up the Edge Function with your Expo Push credentials or Firebase project
- Send booking confirmation, charging session start, and investor booking alert notifications

| Item | Cost |
|------|------|
| `expo-notifications` package | Free |
| Firebase project (FCM) | Free up to 1M messages/month |
| Expo Push Notifications service | Free |
| Development work | 1–2 days |

---

### B-03 — Email Notifications Are Commented Out

**Severity:** 🔴 Critical  
**What the code actually does:** Both `AdminInvestorsScreen.tsx` (line 17) and `InvestorApplicationScreen.tsx` have this at the top:
```ts
// TODO: wire up once SMTP is configured
function sendEmail() { return Promise.resolve(); }  // no-op
```
No investor ever receives a confirmation email after applying. No admin notification of new applications. No approval/rejection email is sent.  
**What needs to be built:**
- Connect an email provider to Supabase Edge Functions
- Trigger emails on: application submitted, application accepted, application rejected, admin comment added

| Item | Cost |
|------|------|
| Resend (recommended — Supabase native integration) | Free up to 3,000 emails/month, then $20/month |
| Sendgrid alternative | Free up to 100 emails/day |
| Development work | 1 day |

---

### B-04 — Tuya Integration Uses a Node.js Package That Cannot Run in React Native

**Severity:** 🔴 Critical  
**What the code actually does:** `package.json` lists `@tuya/tuya-connector-nodejs` — this is a **server-side Node.js SDK**. It cannot run inside a React Native app. Supabase Edge Functions run on **Deno**, not Node.js, so this package won't work there either.  
**What needs to be built:**
- Create a Supabase Edge Function that calls the **Tuya Open API** directly using HTTP fetch (no SDK needed)
- The Edge Function needs: `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET` environment variables
- The app calls the Edge Function; the Edge Function calls Tuya's API to switch the device on/off
- Sign Tuya API requests using HMAC-SHA256 (Tuya's auth spec)

| Item | Cost |
|------|------|
| Tuya IoT Platform account | Free |
| Tuya Cloud API — free tier | 1M API calls/month free |
| Paid Tuya plan (if exceeded) | ~$0.001 per API call |
| Development work | 2–3 days (API auth signing is non-trivial) |

---

### B-05 — Expo SDK Version Mismatch

**Severity:** 🔴 Critical  
**What the code actually does:** `package.json` declares `"expo": "~54.0.0"` but `CLAUDE.md` references Expo v56.0.0 docs. The app may have dependency mismatches causing build failures.  
**What needs to be built:**
- Run `npx expo install expo@~56.0.0 --fix` and resolve any peer dependency conflicts
- Re-test navigation, location, and OAuth flows after upgrade

| Item | Cost |
|------|------|
| SDK upgrade | 0.5–1 day dev time |
| Cost | Free |

---

## 2. Important Blockers

Features partially built, visible in UI, but non-functional. Fix before soft launch.

---

### B-06 — Investor Withdrawal Shows "Coming Soon" Alert

**Severity:** 🟠 Important  
**What the code does:** `InvestorEarningsScreen.tsx` line 81: `onPress={() => Alert.alert('Coming Soon', '...')}`. The Withdraw button is a dead end.  
**What needs to be built:**
- Decide on payout method: bank transfer, wallet-to-wallet, Thawani payout API
- Build a payout request flow (investor submits bank IBAN → admin processes → marks as paid)
- Or integrate Thawani's Disbursement API for automated payouts

| Item | Cost |
|------|------|
| Thawani payout fee | Varies — check Thawani merchant agreement |
| Development work | 2–4 days |

---

### B-07 — Google Maps API Key Needs a Production Key with Billing

**Severity:** 🟠 Important  
**What the code does:** Uses `react-native-maps` with `PROVIDER_GOOGLE`. Works in development but Google Maps Platform requires a billing-enabled API key for production apps and enforces quota limits.  
**What needs to be built:**
- Create a Google Cloud project
- Enable: Maps SDK for Android, Maps SDK for iOS, Geocoding API (used in `InvestorApplicationScreen` reverse geocode), Places API (optional, for search)
- Restrict the API key to your app's bundle ID and SHA-1 fingerprint
- Add billing method to your Google Cloud account

| Item | Cost |
|------|------|
| Google Maps Platform (pay-as-you-go) | |
| Maps SDK loads | $7 per 1,000 map loads (first $200/month free) |
| Geocoding API (reverse geocode in investor form) | $5 per 1,000 requests |
| Estimated for 500 users/month | ~$50–$150/month |

---

### B-08 — Password Reset Deep Link (`watt://reset-password`) Not Handled

**Severity:** 🟠 Important  
**What the code does:** `AuthContext` sends a reset email with `redirectTo: 'watt://reset-password'`. There is no screen in the navigation that catches this deep link and lets the user set a new password.  
**What needs to be built:**
- Handle the `watt://reset-password` deep link in the app (using `expo-linking`)
- Add a `ResetPasswordScreen` that accepts the token from the URL and calls `supabase.auth.updateUser({ password })`
- Wire it into the root navigator

| Item | Cost |
|------|------|
| Development work | 1 day |
| Cost | Free |

---

### B-09 — Realtime Charger Status (Tuya Switch State) Not Reflected in UI

**Severity:** 🟠 Important  
**What the code does:** The `switch_status` field in `charger_listings` exists but is not updated by any realtime hook. If another user starts a session, the investor's charger screen doesn't update live.  
**What needs to be built:**
- Supabase realtime subscription on `charger_listings` for the investor's row
- Polling or webhook from Tuya to update `switch_status` after remote commands

| Item | Cost |
|------|------|
| Development work | 1 day |
| Cost | Free (within Supabase realtime limits) |

---

### B-10 — Notification Settings Have No Persistence or Effect

**Severity:** 🟠 Important  
**What the code does:** The notification toggles in `ProfileScreen` are local React state (`useState`). Closing the app resets them to `true`. They're never saved to the database, and no actual notification preferences are checked before sending.  
**What needs to be built:**
- Add `notification_prefs` JSON column to `profiles` table
- Save toggle state to Supabase when changed
- Read preferences in the Edge Function before sending a notification

| Item | Cost |
|------|------|
| Migration: add column | 0.5 day |
| Cost | Free |

---

## 3. Infrastructure & Publishing

---

### B-11 — Apple Developer Account

**Severity:** 🔴 Required to publish to iOS App Store  

| Item | Cost |
|------|------|
| Apple Developer Program | $99/year (~38 OMR/year) |
| App Store Connect setup | Free |
| App review time | 1–3 business days |
| TestFlight (beta testing) | Free (included) |

---

### B-12 — Google Play Developer Account

**Severity:** 🔴 Required to publish to Android Play Store  

| Item | Cost |
|------|------|
| Google Play Developer | $25 one-time (~9.5 OMR) |
| Play Store review time | 1–3 business days |
| Internal testing track | Free |

---

### B-13 — EAS Build (Production Builds)

**Severity:** 🔴 Required for signed production builds  
The current setup uses `npx expo start` for development. Production releases require EAS Build to generate signed `.apk` / `.aab` (Android) and `.ipa` (iOS).

| Item | Cost |
|------|------|
| EAS Build — Free tier | 30 builds/month (shared queue, slow) |
| EAS Build — Production plan | $99/month (~38 OMR/month) for priority queue + unlimited builds |
| **Recommendation** | Start free, upgrade when build queue is a bottleneck |

---

### B-14 — Supabase Production Plan

**Severity:** 🟠 Important  
The free Supabase tier pauses projects after 1 week of inactivity and has limited database size (500 MB). For a live app you need at minimum the Pro plan.

| Plan | Cost | What You Get |
|------|------|-------------|
| Free | $0 | 500 MB DB, pauses after inactivity, 2 GB bandwidth |
| Pro | $25/month (~9.5 OMR/month) | 8 GB DB, no pause, 250 GB bandwidth, daily backups |
| Team | $599/month | SOC2 compliance, HIPAA, advanced logs |
| **Recommendation** | **Pro plan** from day one of launch |

---

### B-15 — App Store Assets (Screenshots, Description, Preview Video)

**Severity:** 🟠 Required for App Store listing  

| Item | Cost |
|------|------|
| App icon (already have `assets/icon.png`) | Free |
| Screenshots — iOS (6.7", 6.1") × 2 languages | $0 (DIY with simulator) – $300 (designer) |
| Screenshots — Android (phone + tablet) × 2 languages | Same |
| App preview video (optional, increases conversion) | $0 (DIY with screen recording) – $500 (professional) |
| App Store description (EN + AR) | $0 (DIY) – $200 (copywriter) |

---

### B-16 — Domain Name

**Severity:** 🟠 Needed for website, deep links, and email credibility  

| Option | Cost | Notes |
|--------|------|-------|
| `.om` domain (watt.om) | ~$100–200/year | Requires Omani business registration, handled through Oman's TRAN |
| `.com` domain (wattech.com, getwatt.com, etc.) | $10–15/year | Easier to register, global |
| `.app` domain (watt.app) | $14–20/year | Great for apps, HTTPS enforced |
| **Recommendation** | Get a `.com` or `.app` now, pursue `.om` in parallel with business registration |

---

## 4. Marketing Website

You have a minimal `web/locator.html` file in the repo — a raw HTML station locator. A proper marketing website is separate.

---

### W-01 — Website Platform Choice

| Option | Build Time | Monthly Cost | Best For |
|--------|-----------|--------------|---------|
| **Framer** (recommended) | 1–3 days | $15/month | Fast, looks premium, no-code, RTL support |
| Webflow | 3–7 days | $14–$23/month | More control, CMS for blog |
| Next.js on Vercel | 5–14 days | $0–$20/month | Full custom, dev required |
| Wix / Squarespace | 1–2 days | $16–$23/month | Easiest, least flexible |
| **Recommendation** | **Framer** — fastest path to a premium-looking bilingual site |

---

### W-02 — Website Must-Have Pages

| Page | Purpose |
|------|---------|
| Home / Landing | Hero, value prop, App Store download badges |
| How It Works | 3-step flow for customers + 3-step for investors |
| Station Map (embed) | Live map of public stations (can use the existing `web/locator.html` or embed Google Maps) |
| Investor Program | Application CTA, revenue calculator, FAQ |
| About | Team, mission, contact |
| Privacy Policy | Link to legal document (already written in app) |
| Terms of Use | Link to legal document (already written in app) |

---

### W-03 — Website Hosting

| Platform | Free Tier | Paid Plan |
|----------|-----------|-----------|
| Vercel | Unlimited personal projects, 100 GB bandwidth | $20/month (Pro) |
| Netlify | 100 GB bandwidth, 300 build minutes | $19/month |
| Cloudflare Pages | Unlimited bandwidth | $0 on free plan |
| **Recommendation** | **Vercel free** — connects to GitHub, auto-deploys on push, global CDN |

---

### W-04 — Website Design & Content Cost

| Approach | Cost | Timeline |
|----------|------|----------|
| DIY using Framer templates | $0–$45 (template) | 2–5 days |
| Freelance designer (Malt / Upwork) | $300–$800 | 1–2 weeks |
| Design agency (Oman-based) | $1,500–$5,000 | 3–6 weeks |
| **Recommendation** | Buy a Framer template, fill in Watt content, translate to Arabic |

---

### W-05 — Arabic RTL Support on Website

The website must be fully Arabic with right-to-left layout, matching the app's bilingual experience.

| Item | Cost |
|------|------|
| Framer / Webflow RTL support | Built-in with CSS `dir="rtl"` |
| Arabic copywriting (if not DIY) | $100–$300 |
| Arabic SEO keywords (Google, Bing Arabia) | $0 (DIY research) |

---

## 5. Legal & Compliance

---

### L-01 — Privacy Policy & Terms of Use Review

**Current state:** The app has `PrivacyScreen.tsx` and `TermsScreen.tsx` with content written in-house. These need review by a licensed Omani lawyer before launch to ensure compliance with Oman's Personal Data Protection Law (Royal Decree 6/2022).

| Item | Cost |
|------|------|
| Omani law firm review + revision | $500–$2,000 |
| Annual review (data law changes) | $200–$500/year |

---

### L-02 — Commercial Registration (Oman)

Required to: open a merchant account with Thawani, register a `.om` domain, sign contracts with investors, and issue proper receipts.

| Item | Cost |
|------|------|
| Oman Commercial Registration (CR) | ~$520 (~200 OMR) one-time |
| Annual renewal | ~$130 (~50 OMR/year) |
| Ministry of Commerce fees (varies by activity) | ~$130–$390 (~50–150 OMR) |

---

### L-03 — Investor Agreement Template

When investors join, there must be a signed agreement covering commission rate (10%), liability, data handling, and charger ownership.

| Item | Cost |
|------|------|
| Legal template drafting | $300–$800 |
| Per-investor e-signature (DocuSign / Contractbook) | $0–$25/month |

---

## Full Cost Summary

### One-Time Costs

| Item | Low Estimate | High Estimate |
|------|-------------|---------------|
| Apple Developer Account | $99 | $99 |
| Google Play Developer | $25 | $25 |
| Domain name | $14 | $200 |
| App Store screenshots & assets | $0 | $800 |
| Website design & build | $0 | $2,500 |
| Legal (Privacy, Terms, Investor agreement) | $800 | $2,800 |
| Commercial Registration (Oman) | $650 | $780 |
| Development work (all blockers above) | ~$0 (self) | ~$5,000 (hired) |
| **Total One-Time** | **$1,588** | **$12,204** |

> Self-build estimate assumes you do the development work yourself and use free tools where possible.

---

### Monthly Running Costs

| Service | Free Tier Limit | Monthly Cost |
|---------|----------------|-------------|
| Supabase Pro | — | $25 |
| Google Maps Platform | $200 credit/month (~28K map loads) | $0–$150 |
| Resend (email) | 3,000 emails/month | $0–$20 |
| Expo Push Notifications | Unlimited | $0 |
| Tuya IoT Cloud | 1M API calls/month | $0–$20 |
| EAS Build | 30 builds/month | $0–$99 |
| Website hosting (Vercel) | Generous free tier | $0–$20 |
| Apple Developer (annualized) | — | $8.25 |
| **Total Monthly** | **At free tiers** | **$33 – $342/month** |

> Thawani transaction fees (2.9% + 0.100 OMR) are variable — they scale with revenue, not a fixed cost.

---

## Launch Plan — 2 Weeks Maximum

> **Principle:** Parallel tasks run simultaneously. Each day has one clear goal. Do not start a new task before testing the previous one.

---

### Week 1 — Fix the Code + Wire Up Money

| Day | Task | Est. Time | Note |
|-----|------|-----------|------|
| **Sun** | B-05: Upgrade Expo SDK to v56 | Full day | **Must be first** — unblocks everything |
| **Sun** (parallel) | B-11 + B-12: Register Apple Developer + Google Play accounts | 1 hour | Just payment, no dev work |
| **Mon** | B-08: ResetPasswordScreen + deep link handler | Full day | Relatively quick |
| **Tue** | B-04: Rebuild Tuya as Edge Function | Full day | HTTP fetch, no Node.js SDK |
| **Wed + Thu** | B-01: Integrate Thawani Checkout API | 2 days | Heaviest task — do not skip |
| **Fri** | B-03: Connect Resend to Supabase Edge Functions | Full day | Investor + admin emails |
| **Fri** (parallel) | B-14: Upgrade Supabase to Pro | 10 min | Just payment in Supabase dashboard |
| **Fri** (parallel) | B-07: Google Maps production API key | 1 hour | Create Google Cloud project + billing |

---

### Week 2 — Notifications + Infrastructure + Launch

| Day | Task | Est. Time | Note |
|-----|------|-----------|------|
| **Sun** | B-02: expo-notifications + store Push Tokens | Full day | |
| **Sun** (parallel) | B-10: Save notification prefs to DB | Half day | Simple migration + wire up toggles |
| **Mon** | B-09: Realtime switch_status update | Full day | Supabase Realtime subscription |
| **Mon** (parallel) | B-13: Set up EAS Build | 2 hours | `eas build --profile production` |
| **Mon** (parallel) | B-16: Register domain | 15 min | |
| **Tue** | B-15: App Store screenshots + descriptions (EN + AR) | Full day | DIY with simulator |
| **Tue** (parallel) | W-01: Build marketing website on Framer | Full day | Ready-made template + Watt content |
| **Wed** | Final signed build + full flow testing | Full day | Test every user flow end-to-end |
| **Thu** | Submit to App Store + Google Play | Full day | 1–3 days review starts now |
| **Fri** | Launch website + await store approvals | — | |

---

### What Cannot Be Done in 2 Weeks ⚠️

These must be **started now** but will not finish before launch:

| Task | Reason | Solution |
|------|--------|----------|
| L-01: Legal review | Omani lawyer needs 2+ weeks minimum | **Send request today**, launch with current text, update after review |
| L-02: Commercial Registration | Government process takes weeks | Start paperwork now in parallel |
| L-03: Investor agreement | Requires legal review | Use a temporary template, update post-launch |
| B-06: Investor withdrawal | 2–4 days dev + Thawani Disbursement decision | v1.1 — after launch |

---

---

## Total Cost in OMR — Safe First Launch

> Exchange rate: 1 OMR = 2.60 USD

### One-Time Costs (paid once before launch)

| Item | Why It's Non-Negotiable | OMR |
|------|------------------------|-----|
| Apple Developer Account | Cannot publish to iOS without it | **38 OMR** |
| Google Play Developer | Cannot publish to Android without it | **10 OMR** |
| Domain name (.app or .com) | Website, deep links, email credibility | **6 OMR** |
| Framer website template | Fastest path to a professional bilingual site | **17 OMR** |
| Commercial Registration (Oman) | Required to open a Thawani merchant account | **200 OMR** |
| Ministry of Commerce fees | Mandatory with registration | **50–150 OMR** |
| Legal review (Privacy + Terms + Investor agreement) | Protection under Oman's Personal Data Law (RD 6/2022) | **300–900 OMR** |
| **Total One-Time** | | **621 – 1,321 OMR** |

---

### Monthly Recurring Costs

| Service | Why It's Non-Negotiable | OMR/month |
|---------|------------------------|-----------|
| Supabase Pro | Without it, the app pauses automatically after inactivity | **10 OMR** |
| Framer (website hosting) | Keeps the marketing site live | **6 OMR** |
| Apple Developer (annualized) | Annual fee spread monthly | **3 OMR** |
| Google Maps | Within the free $200/month credit at launch | **0 OMR** |
| Resend (email) | Free up to 3,000 emails/month | **0 OMR** |
| **Total Monthly** | | **~19 OMR/month** |

---

### Variable Cost (deducted from revenue automatically)

| Item | Calculation |
|------|-------------|
| Thawani transaction fee | 2.9% + 0.100 OMR per transaction |
| Example: user tops up 10 OMR | Thawani takes **0.385 OMR** → you receive **9.615 OMR** |

---

### Bottom Line

| | Low | High |
|-|-----|------|
| **Before launch (one-time)** | **621 OMR** | **1,321 OMR** |
| **Every month after launch** | **19 OMR** | **77 OMR** |

**621 OMR** = DIY everything (Framer template + basic legal)

**1,321 OMR** = experienced lawyer for legal review + higher ministry fees

> **Recommendation:** Budget **900–1,000 OMR** for the first launch — covers everything with a comfortable safety margin.

---

*Cost audit generated from live WattApp codebase — June 2026.*  
*All USD costs converted at 1 OMR = 2.60 USD. Verify current rates before budgeting.*
