# Watt — Production Launch Plan

**Goal:** Ship Watt on the Apple App Store and Google Play Store as a live, real-money EV charging marketplace for Oman.

**Current state:** App is feature-complete with dev-mode auth bypass. Three roles (customer, host, admin) all work. 15 real stations seeded. Private charger sharing implemented. Needs real auth, real payments, and store submission.

**Estimated total time:** 6–8 weeks for a solo developer working part-time, 3–4 weeks full-time.

---

## Already Completed ✅

- **4-role user system built** — Guest, Customer, Investor (host), and Admin each have a fully separate navigation stack and dedicated experience.
- **Admin panel rebuilt** — Control dashboard only; admin does not share screens with customers. Full KPIs, user management, application review, station status control, and platform-wide booking oversight.
- **Full UI design refresh done** — All emoji icons replaced with a consistent SVG icon library across all 4 user flows. Cleaner, more professional look throughout.
- **15 official Oman stations seeded** with real governorate data, connector types, and real-time status.
- **Private charger sharing** (host/investor flow) implemented end-to-end — map listing, booking, earnings tracking.
- **Bilingual AR/EN** with RTL layout support across all screens.

## In Progress 🔄

1. **Investor application form** — Improving bilingual (AR/EN) support, cascading governorate/wilayat city picker, and the interactive map location pin.
2. **Bug fixes** — Map filter crash fixed, realtime subscription stability improvements.
3. **Hardware integration** — Tuya smart switch integration for real charger on/off control from the host dashboard.

---

## Phase 1 — Foundation Fixes (Week 1)
*Make the app run correctly without dev shortcuts. Nothing ships without this.*

### 1.1 Restore Real Authentication
The auth flow is coded but commented out. This is the first thing to fix.

**Steps:**
1. Open `src/navigation/index.tsx`
2. Uncomment the 6 screen imports at the top (Splash, RoleSelect, Phone, OTP, SignIn, SignUp)
3. Uncomment the RootStack screen definitions for those screens
4. Replace the `DevLogin` block with the real entry point (`SplashScreen`)
5. Delete `src/screens/DevLoginScreen.tsx`
6. Test the full sign-up flow: phone → OTP → role select → home

**Supabase Auth Setup:**
- Enable Phone auth in Supabase dashboard → Authentication → Providers → Phone
- Add a real SMS provider (Twilio recommended, cheapest for Oman: ~$0.05/SMS)
  - Go to Supabase → Auth → SMS Provider → Twilio
  - Create a Twilio account, get Account SID + Auth Token + phone number
  - Set `From` number as a Twilio verified number
- Test OTP delivery to an Omani number (+968 prefix)
- In `AuthContext.tsx`, confirm `signInWithOtp` and `verifyOtp` methods are pointing to the right Supabase methods

**Auth Screens to verify work end-to-end:**
- `SplashScreen.tsx` (3-slide onboarding, skip button)
- `RoleSelectScreen.tsx` (customer vs investor choice)
- `SignInScreen.tsx` (email/password login)
- `SignUpScreen.tsx` (email/password + name signup)
- `TermsScreen.tsx` — fill in real content (see Phase 3)
- `PrivacyScreen.tsx` — fill in real content (see Phase 3)

---

### 1.2 Apply All Supabase Migrations
Both migration files need to be applied to the live Supabase project.

**Steps:**
1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link to project: `supabase link --project-ref cnwlmbpmgwmhzzjnmltz`
4. Apply migrations:
   ```
   supabase db push
   ```
5. Verify in Supabase dashboard → Table Editor:
   - `profiles` table has `role` column with values: customer, investor, admin
   - `charger_listings` table exists with all columns
   - `bookings` table has `listing_id` column

**Files to apply:**
- `supabase/migrations/20260611_add_roles_and_charger_listings.sql`
- `supabase/migrations/20260617_add_admin_role.sql`

---

### 1.3 Tighten Row Level Security (RLS)
Current RLS lets any authenticated user read everything. Admin tables need protection.

**Add these policies in Supabase SQL Editor:**

```sql
-- Only admins can read ALL profiles (others read own only)
CREATE POLICY "admins_read_all_profiles" ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only admins can update any profile (others update own only)
CREATE POLICY "admins_update_all_profiles" ON profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only admins can read ALL bookings (users read own only)
CREATE POLICY "admins_read_all_bookings" ON bookings
  FOR SELECT USING (
    auth.uid() = user_id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only admins can update ANY booking (for force-cancel)
CREATE POLICY "admins_update_all_bookings" ON bookings
  FOR UPDATE USING (
    auth.uid() = user_id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only admins can update stations
CREATE POLICY "admins_update_stations" ON stations
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
```

---

### 1.4 Environment Variables & Secrets
Never commit secrets to git. Move keys to environment variables.

**Create `WattApp/.env` (add to `.gitignore`):**
```
EXPO_PUBLIC_SUPABASE_URL=https://cnwlmbpmgwmhzzjnmltz.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
EXPO_PUBLIC_GOOGLE_MAPS_KEY=your_maps_key_here
```

**Update `src/lib/supabase.ts`** to use `process.env.EXPO_PUBLIC_SUPABASE_URL`

**Secure the Google Maps API key:**
- Go to Google Cloud Console → APIs & Services → Credentials
- Restrict the key to only these apps:
  - iOS app: bundle ID `com.watt.ev`
  - Android app: package name `com.watt.ev` + SHA-1 fingerprint
  - (Remove unrestricted access)

---

## Phase 2 — Real Payments (Week 2)
*The app earns money through the wallet. This phase makes money real.*

### 2.1 Thawani Pay Integration
Thawani is Oman's leading payment gateway — the correct choice for OMR payments.

**Setup:**
1. Register at [thawani.om](https://thawani.om) as a business
2. Complete KYC (need: commercial registration, bank account, authorized signatory ID)
3. Get test credentials: `publishable_key` + `secret_key`
4. API base URL (test): `https://uatcheckout.thawani.om/api/v1`
5. API base URL (live): `https://checkout.thawani.om/api/v1`

**How Thawani Pay works:**
- You create a "session" on your backend
- User is redirected to Thawani's checkout page
- Thawani redirects back to your app with success/fail
- You verify the payment on your backend and update the wallet

**Implementation Plan:**

**Step 1 — Create a Supabase Edge Function for payment sessions:**
```
supabase/functions/create-payment-session/index.ts
```
This function:
- Receives `{ amount, userId, description }` from the app
- Calls Thawani API to create a session
- Returns `{ sessionId, paymentUrl }` to the app
- Amount in Thawani is in **baisa** (1 OMR = 1000 baisa)

**Step 2 — Create a webhook handler Edge Function:**
```
supabase/functions/thawani-webhook/index.ts
```
This function:
- Receives payment success/fail webhook from Thawani
- Verifies the payment status by querying Thawani API
- On success: inserts `wallet_transactions` row + updates `profiles.wallet_balance`

**Step 3 — Update `WalletScreen.tsx`:**
- Replace demo top-up modal with real Thawani flow
- Use `expo-web-browser` to open `paymentUrl` in a browser
- Listen for the deep link redirect back to the app
- On return, call `refreshProfile()` to update wallet balance display

**Step 4 — Add Deep Link handling:**
In `app.json`, add:
```json
"scheme": "watt",
"intentFilters": [
  {
    "action": "VIEW",
    "data": [{ "scheme": "watt" }],
    "category": ["BROWSABLE", "DEFAULT"]
  }
]
```
Thawani success URL becomes: `watt://payment/success`
Thawani cancel URL becomes: `watt://payment/cancel`

---

### 2.2 Host Earnings Flow
When a customer completes a session at a host's charger, the host should receive payment.

**Logic to implement:**
1. When `ChargingScreen.tsx` ends a session at a charger listing (not official station):
   - Calculate host's cut: `actual_cost × 0.85` (Watt takes 15% commission)
   - Insert `wallet_transactions` for host: `type='earning'`, `amount=host_cut`
   - Update `profiles.wallet_balance` for the host
2. Customer's wallet is already deducted — verify this also inserts a `type='charge'` transaction

**Add host payout UI in `HostEarningsScreen.tsx`:**
- "Request Payout" button (visible when balance > 5 OMR)
- Payout goes to host's registered bank account (manual process initially, Thawani payout API later)
- For MVP: show a "Request payout" form that sends an email to Watt admin

---

## Phase 3 — Legal & Content (Week 2–3)
*Required by Apple and Google before submission.*

### 3.1 Fill In Terms of Use & Privacy Policy
Both screens are currently stubs. They need real legal content.

**`TermsScreen.tsx` — Must cover:**
- User eligibility (18+ for payment, Oman residents)
- Booking and cancellation policy (e.g., cancel 2hr before = full refund)
- Wallet top-up and refund policy
- Host responsibilities (keep charger available during booking)
- Watt's commission (15% from host earnings)
- Prohibited uses
- Governing law: Sultanate of Oman

**`PrivacyScreen.tsx` — Must cover:**
- What data is collected (phone, name, location, usage)
- Why it's collected (to provide charging services)
- Who it's shared with (Supabase, Thawani, Google Maps)
- User rights (delete account, export data)
- How to contact Watt for privacy questions
- GDPR-style consent language (even for Oman users — Apple requires it)

**Tip:** Use a legal template generator (Termly.io or PrivacyPolicies.com) and customize for Watt. Budget 1–2 hours.

---

### 3.2 App Store Required Legal Pages
Both stores require a hosted privacy policy URL (not in-app only).

**Options:**
1. Create a simple one-page website (GitHub Pages is free) at `wattev.om/privacy`
2. Or use Notion's public page feature as a quick temporary URL
3. Add the URL to both `app.json` and the store listing forms

---

## Phase 4 — App Quality (Week 3)
*Polish before the stores see it.*

### 4.1 Complete Missing Screens
These screens are stubs or incomplete:

| Screen | What's Missing |
|--------|---------------|
| `TermsScreen.tsx` | Real text content |
| `PrivacyScreen.tsx` | Real text content |
| `SplashScreen.tsx` | Verify 3-slide onboarding images render correctly |

### 4.2 Push Notifications
Customers need to know when their booking is confirmed, when to start charging, etc.

**Setup Expo Push:**
1. Install: `npx expo install expo-notifications`
2. In `AuthContext.tsx`, after login, call `registerForPushNotificationsAsync()` and save the `expoPushToken` to the `profiles` table (add a `push_token` column)
3. Supabase migration to add `push_token text` column to `profiles`

**Notification triggers (implement as Supabase Edge Functions or database triggers):**
- Booking confirmed → notify customer
- Booking starts in 30 min → remind customer
- Charging session complete → notify customer with cost
- New booking at your charger → notify host
- Investor application approved/rejected → notify applicant

**File to create:** `supabase/functions/send-push-notification/index.ts`
Uses Expo's push API: `https://exp.host/--/api/v2/push/send`

---

### 4.3 Error Handling & Edge Cases
Test every screen and fix crashes:

- [ ] What happens when Supabase is unreachable? (show retry button, not crash)
- [ ] What if wallet balance is 0 and user tries to book? (block + prompt top-up)
- [ ] What if host turns charger offline during an active booking? (notify customer)
- [ ] What if location permission is denied on map? (show manual search only)
- [ ] What if a booking QR is scanned twice? (show already-started error)
- [ ] Test all flows on a real Android device (not just simulator)
- [ ] Test all flows on a real iPhone (not just simulator)

---

### 4.4 Performance
- Add loading skeletons to `MapScreen.tsx` while stations load
- Paginate `BookingsScreen.tsx` and `WalletScreen.tsx` (currently loads all records)
- Add pull-to-refresh on all list screens
- Compress any local image assets

---

## Phase 5 — Store Preparation (Week 4)

### 5.1 App Assets
Both stores require specific image sizes. Create all of these:

**App Icon (required):**
- 1024×1024 PNG (no transparency, no rounded corners — the store adds them)
- Place at `assets/icon.png`
- Update `app.json`: `"icon": "./assets/icon.png"`

**Splash Screen:**
- 1284×2778 PNG (iPhone 14 Pro Max size, scales down)
- Place at `assets/splash.png`
- Background color: `#059669` (Watt green)

**Android Adaptive Icon:**
- Foreground: 1024×1024 PNG with transparent bg (the Watt logo centered)
- Background: solid `#14532D` (dark green)
- Already configured in `app.json` — just make sure the files exist

**Screenshots for Store Listing:**
Minimum 3, recommended 6–8 screenshots per device type:
- iPhone 6.9" (1320×2868): Map screen, booking screen, charging screen, wallet, profile, host dashboard
- Android phone (1080×1920): Same screens
- Take real screenshots on device or use a simulator

**App Preview Video (optional but increases conversion):**
- 15–30 second screen recording of: open app → find station → book → charge → wallet
- Export as MP4

---

### 5.2 EAS Build Setup
Expo Application Services (EAS) is the official way to build `.ipa` (iOS) and `.aab` (Android) files.

**Install EAS CLI:**
```bash
npm install -g eas-cli
eas login
```

**Create `WattApp/eas.json`:**
```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

**Build for Android (Google Play):**
```bash
cd WattApp
eas build --platform android --profile production
```
Output: `.aab` file for Google Play

**Build for iOS (App Store):**
```bash
eas build --platform ios --profile production
```
Output: `.ipa` file for App Store
Requires: Apple Developer account ($99/year)

---

### 5.3 App Store Connect Setup (iOS)
1. Enroll in Apple Developer Program: [developer.apple.com](https://developer.apple.com) — $99/year
2. Create App in App Store Connect:
   - Bundle ID: `com.watt.ev`
   - App Name: "Watt - EV Charging Oman"
   - Primary language: English
   - Category: Travel (or Utilities)
3. Fill in:
   - Description (English + Arabic)
   - Keywords: ev charging, oman, electric vehicle, شاحن, سيارة كهربائية
   - Support URL: your website or email
   - Privacy Policy URL: (required — see Phase 3)
4. Age rating: 4+ (no violence/adult content)
5. Upload build via EAS: `eas submit --platform ios`

**Apple Review typically takes 1–3 days.**

---

### 5.4 Google Play Console Setup (Android)
1. Create Google Play Developer account: [play.google.com/console](https://play.google.com/console) — $25 one-time fee
2. Create new app:
   - Package name: `com.watt.ev`
   - App name: "Watt - EV Charging Oman"
   - Language: English + Arabic
3. Fill in store listing:
   - Short description (80 chars): "Find and book EV chargers across Oman"
   - Full description (4000 chars)
   - Feature graphic (1024×500 PNG)
   - Screenshots (minimum 2)
4. Set up:
   - App content (answer questions about data collection)
   - Target audience: 18+
   - Privacy policy URL
5. Upload `.aab` to Production track
6. Upload via EAS: `eas submit --platform android`

**Google Review typically takes 3–7 days for first submission.**

---

## Phase 6 — Beta Testing (Week 4–5)
*Find bugs before real users do.*

### 6.1 Internal Testing
- Add 5–10 internal testers (your team + close contacts)
- iOS: TestFlight (free, part of App Store Connect)
  - `eas submit --platform ios` → available in TestFlight within minutes
- Android: Internal Testing track in Google Play Console
  - Upload `.aab` → Internal Testing → add tester emails

**Test checklist:**
- [ ] Sign up as new customer (fresh phone number)
- [ ] Find a station on the map
- [ ] Book a session
- [ ] Top up wallet with real OMR (when Thawani is live)
- [ ] Complete a charging session
- [ ] View session in Bookings + Wallet
- [ ] Sign up as host, set up charger listing
- [ ] Book the host's charger as a customer
- [ ] Host sees the booking in their dashboard
- [ ] Admin: approve an investor application
- [ ] Arabic language: test RTL layout on all screens
- [ ] Force-quit and reopen — session persists

### 6.2 External Beta (optional)
- iOS: TestFlight public link (up to 10,000 external testers)
- Invite EV owners in Oman via WhatsApp/social media
- Collect feedback via Google Form or Typeform
- Fix top 5 reported issues before going live

---

## Phase 7 — Launch (Week 6)

### 7.1 Pre-Launch Checklist

**Code:**
- [ ] `DevLoginScreen.tsx` deleted
- [ ] All `console.log` statements removed (search for `console.log` in codebase)
- [ ] No hardcoded credentials anywhere (search for `@watt-test.com`)
- [ ] `.env` file not committed (check `.gitignore`)
- [ ] Supabase anon key verified (not the service role key)
- [ ] Google Maps API key restricted to production app

**Backend:**
- [ ] All RLS policies applied and tested
- [ ] All migrations applied to production Supabase project
- [ ] Supabase Edge Functions deployed:
  - `create-payment-session`
  - `thawani-webhook`
  - `send-push-notification`
- [ ] Thawani Pay switched from test to live credentials

**App Stores:**
- [ ] App icons uploaded in all required sizes
- [ ] Screenshots uploaded for all required device sizes
- [ ] Privacy policy URL live and accessible
- [ ] Terms of use URL live and accessible
- [ ] Store description written in English and Arabic
- [ ] Version set to `1.0.0`, build number `1`
- [ ] App submitted to both stores for review

**Business:**
- [ ] Thawani business KYC approved
- [ ] Bank account connected for payouts
- [ ] Customer support email set up (e.g., support@wattev.om)
- [ ] Admin account created in Supabase (set role to 'admin' directly in DB)

---

### 7.2 Soft Launch Strategy
Don't launch to everyone at once. Launch in stages:

1. **Week 6, Day 1:** Go live on both stores (limited audience — just Muscat)
2. **Week 6–7:** Monitor Supabase logs, fix critical bugs
3. **Week 7:** Share with EV community groups in Oman (WhatsApp, Instagram)
4. **Week 8:** Scale up marketing once core flow is stable

---

## Phase 8 — Post-Launch (Ongoing)

### Immediate (Week 7–8)
- Monitor Supabase logs daily for errors
- Watch App Store + Google Play reviews — respond to every review
- Fix any crashes reported within 24 hours

### Month 2
- Real-time host payout via Thawani payout API (replace manual email request)
- In-app notifications for booking reminders (30 min before slot)
- Station review system (customers rate stations after session)
- Host charger reviews (customers rate private chargers)

### Month 3
- Membership upgrades: Standard → Silver → Gold with Thawani payment
- Referral program (invite a friend, both get 0.5 OMR)
- Fleet management accounts (companies with multiple EVs)

---

## Cost Estimate (Monthly Running Costs)

| Service | Cost |
|---------|------|
| Apple Developer Account | $99/year (~$8/month) |
| Google Play Account | $25 one-time |
| Supabase (Pro plan for production) | $25/month |
| Twilio SMS (OTP, ~500 signups/month) | ~$25/month |
| Expo EAS Build (production builds) | $29/month (or pay-per-build) |
| Google Maps API (up to $200 free credit/month) | $0–50/month |
| Thawani Pay | 2.5% per transaction (no monthly fee) |
| **Total (at launch)** | **~$87–$137/month** |

---

## Quick Reference — Order of Operations

```
Week 1:  Restore auth → Apply DB migrations → Fix RLS → Move secrets to .env
Week 2:  Thawani Pay integration → Host earnings flow
Week 3:  Legal content → Push notifications → Error handling
Week 4:  EAS build setup → App store accounts → Assets (icons, screenshots)
Week 5:  TestFlight + Play beta → Fix reported bugs
Week 6:  Submit to both stores → Go live → Announce
Week 7+: Monitor → Fix → Improve
```
