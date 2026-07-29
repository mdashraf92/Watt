# Watt — EV Charging Network
## Complete Technical & Product Documentation

> **Watt** is a dual-role EV charging platform for the Sultanate of Oman. Customers find and book charging stations; investors (hosts) share home chargers to earn monthly income.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Setup Guide](#4-setup-guide)
5. [Environment & Configuration](#5-environment--configuration)
6. [Authentication Flows](#6-authentication-flows)
7. [User Roles & Navigation](#7-user-roles--navigation)
8. [Screens & Features](#8-screens--features)
9. [Booking Flow](#9-booking-flow)
10. [Investor (Host) Flow](#10-investor-host-flow)
11. [Supabase Backend](#11-supabase-backend)
12. [Database Schema](#12-database-schema)
13. [Row Level Security](#13-row-level-security)
14. [Realtime Subscriptions](#14-realtime-subscriptions)
15. [Internationalization (i18n)](#15-internationalization-i18n)
16. [Key Components & Contexts](#16-key-components--contexts)
17. [Admin Panel](#17-admin-panel)
18. [Smart Charger (Tuya) Integration](#18-smart-charger-tuya-integration)
19. [Membership Levels](#19-membership-levels)
20. [Wallet & Payments](#20-wallet--payments)

---

## 1. Project Overview

Watt solves two problems simultaneously:

- **EV drivers** in Oman have no reliable way to find, book, and pay for a charger in one app.
- **Property owners** with idle home chargers have no way to share them safely and earn income.

The app connects both sides of that market. A customer opens the map, finds the nearest station or private charger, confirms a time slot, arrives, scans a QR code, charges, and pays — all without cash or manual coordination. An investor applies once, gets approved by the Watt admin, lists their charger, and receives earnings in their in-app wallet.

### Supported Platforms

| Platform | Status |
|----------|--------|
| iOS      | Supported |
| Android  | Supported |
| Web      | Limited (locator page only) |

### Languages

| Language | Direction |
|----------|-----------|
| English  | LTR |
| Arabic   | RTL (full layout mirror) |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Expo React Native App              │
│                                                     │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────┐  │
│  │  AuthContext │  │LanguageContext │  │Charging │  │
│  │  (session,   │  │ (i18n, RTL)    │  │Context  │  │
│  │   profile,   │  └────────────────┘  │(session │  │
│  │   role)      │                      │persist) │  │
│  └──────┬───────┘                      └─────────┘  │
│         │                                           │
│  ┌──────▼──────────────────────────────────────┐   │
│  │          Navigation (react-navigation v6)    │   │
│  │  GuestNavigator / CustomerNavigator /        │   │
│  │  InvestorNavigator / AdminNavigator          │   │
│  └──────────────────────┬──────────────────────┘   │
│                         │                           │
│         Screens (40+) ◄─┘                           │
└───────────────────────┬─────────────────────────────┘
                        │ supabase-js client
                        ▼
          ┌─────────────────────────┐
          │   Supabase (PostgreSQL) │
          │  Auth · DB · Realtime   │
          │  Edge Functions         │
          └─────────────────────────┘
                        │
                        ▼
          ┌─────────────────────────┐
          │   Tuya IoT Cloud API    │
          │ (charger on/off control)│
          └─────────────────────────┘
```

### Data flow for a booking

```
User picks station → BookingScreen
  → validate wallet balance ≥ estimated cost
  → insert bookings row (status: pending → confirmed)
  → navigate to ActiveBookingScreen (shows QR + countdown)
  → user arrives, presses "Start Charging Now"
    → (Tuya) switch on charger
    → insert charging_sessions row (status: active)
    → navigate to ChargingScreen (realtime kWh / cost display)
  → user stops or duration expires
    → update charging_sessions (status: completed, kwh_delivered, cost)
    → deduct cost from profiles.wallet_balance
    → insert wallet_transactions row (type: charge)
    → navigate to SessionSummaryScreen (receipt + CO₂ saved)
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Expo SDK | 56.0.0 |
| Language | TypeScript | 5.x |
| Framework | React Native | 0.76.x |
| Navigation | React Navigation | v6 (Native Stack + Bottom Tabs) |
| Backend | Supabase | supabase-js v2 |
| Database | PostgreSQL (via Supabase) | 15 |
| Maps | react-native-maps (Google Maps) | latest |
| Location | expo-location | latest |
| OAuth | expo-web-browser | latest |
| Apple Auth | expo-apple-authentication | latest |
| Session storage | @react-native-async-storage | latest |
| IoT | Tuya Cloud API | — |
| Payments | Thawani (wallet top-up) | — |

---

## 4. Setup Guide

### Prerequisites

- Node.js 18+
- npm 9+ or yarn 1.22+
- Expo CLI (`npm install -g expo-cli`) or use `npx expo`
- Android Studio (for Android emulator) or Xcode (for iOS simulator)
- A Supabase project (free tier is enough for development)

### Clone and install

```bash
git clone <repository-url>
cd WattApp
npm install
```

### Start the development server

```bash
npx expo start
```

Press `a` for Android emulator, `i` for iOS simulator, or scan the QR code with the Expo Go app.

### Run on a physical device

Install [Expo Go](https://expo.dev/go) on your iOS or Android device, then scan the QR code shown by `npx expo start`.

> **Production builds**: Use EAS Build for production `.apk` and `.ipa` files.
> ```bash
> npx eas build --platform android
> npx eas build --platform ios
> ```

---

## 5. Environment & Configuration

All Supabase credentials are currently hardcoded in `src/lib/supabase.ts`. For production, move them to environment variables using Expo's `app.config.js` and `EXPO_PUBLIC_` prefix.

### Current configuration (`src/lib/supabase.ts`)

```typescript
const SUPABASE_URL      = 'https://cnwlmbpmgwmhzzjnmltz.supabase.co';
const SUPABASE_ANON_KEY = '<anon-key>';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:            AsyncStorage,  // persists session across app restarts
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,         // disabled — deep links handled manually
  },
});
```

### OAuth deep-link scheme

The app registers the URL scheme `watt://` for OAuth callbacks:

| Event | Deep link |
|-------|-----------|
| Google OAuth callback | `watt://auth/callback` |
| Password reset callback | `watt://reset-password` |

Configure this scheme in `app.json` under `expo.scheme`.

---

## 6. Authentication Flows

All authentication is managed by `src/context/AuthContext.tsx`. The context exposes a unified API to every screen via the `useAuth()` hook.

### 6.1 Email / Password

**Sign Up**

1. User enters full name, email, password.
2. `supabase.auth.signUp()` creates an auth user.
3. `profiles` row is upserted with `full_name`, `wallet_balance: 0`, `is_active: true`.
4. `fetchProfile()` loads the new profile; navigation switches to CustomerNavigator.

**Sign In**

1. User enters email, password.
2. `supabase.auth.signInWithPassword()` returns a session.
3. `fetchProfile()` loads the profile; if `is_active === false`, the account is blocked and the user is signed out immediately.

### 6.2 Google OAuth

1. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'watt://auth/callback', skipBrowserRedirect: true } })` returns an authorization URL.
2. `WebBrowser.openAuthSessionAsync(url, 'watt://auth/callback')` opens an in-app browser.
3. On success, the browser closes and returns `result.url` with the authorization code.
4. `supabase.auth.exchangeCodeForSession(result.url)` exchanges the code for a session.
5. `ensureProfile()` upserts a profile row (handles first-time OAuth users who have no row yet).

### 6.3 Apple Sign In (iOS only)

1. `AppleAuthentication.signInAsync()` returns credentials including an `identityToken`.
2. `supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken })` validates the token and creates a session.
3. `ensureProfile()` upserts the profile.

> Apple Sign In is guarded by `Platform.OS !== 'ios'` and `isAvailableAsync()`. Tapping it on Android shows "Not available on this device."

### 6.4 Forgot Password

1. User enters their email address.
2. `supabase.rpc('check_email_exists', { p_email })` verifies the account exists before sending. If no account is found, the error `NO_ACCOUNT` is thrown and the screen shows "No account found."
3. `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'watt://reset-password' })` sends the reset email.

### 6.5 Dev Login Bypass

`AuthContext` exposes `devSignIn(profile)` / `devSignOut()`. The `DevLoginScreen` (`src/screens/DevLoginScreen.tsx`) lets developers simulate any role (customer, investor, admin) without creating real accounts. The dev profile is stored in `devProfile` state and cleared on sign-out.

---

## 7. User Roles & Navigation

The root navigator (`src/navigation/index.tsx`) switches between four sub-navigators based on `profile.role`.

```
profile.role    → Navigator
─────────────────────────────────────────
(unauthenticated) → GuestNavigator
'customer'        → CustomerNavigator
'investor' | 'host' → InvestorNavigator
'admin'           → AdminNavigator
```

### 7.1 Guest Navigator

Unauthenticated users land here. They can browse the map and view station details. Bookings and Wallet tabs show a locked screen with a sign-in prompt.

```
GuestStack
  ├── SignIn
  ├── SignUp
  └── GuestTabs (bottom tabs)
        ├── GuestMap       → MapScreen
        ├── GuestBookings  → GuestLockedScreen (feature: 'bookings')
        ├── GuestWallet    → GuestLockedScreen (feature: 'wallet')
        └── GuestProfile   → GuestProfileScreen
```

### 7.2 Customer Navigator

```
CustomerStack
  ├── Tabs (bottom tabs)
  │     ├── Map            → MapScreen
  │     ├── Bookings       → BookingsScreen
  │     ├── Wallet         → WalletScreen
  │     └── Profile        → ProfileScreen
  ├── StationDetails       → StationDetailsScreen
  ├── Booking              → BookingScreen
  ├── ActiveBooking        → ActiveBookingScreen
  ├── Charging             → ChargingScreen
  ├── SessionSummary       → SessionSummaryScreen (gesture disabled — prevents back-swipe)
  └── InvestorApplication  → InvestorApplicationScreen
```

### 7.3 Investor Navigator

Investors have all customer screens plus two dedicated tabs.

```
InvestorStack
  ├── InvestorTabs (bottom tabs)
  │     ├── Map              → MapScreen
  │     ├── Bookings         → BookingsScreen
  │     ├── InvestorCharger  → InvestorChargerScreen
  │     ├── Wallet           → InvestorEarningsScreen
  │     └── Profile          → ProfileScreen
  └── (same stack screens as CustomerStack)
```

A one-time **InvestorWelcomeModal** appears after admin approval (`investor_welcomed === false`). It shows the charger address and a "Continue" button. On dismiss, `investor_welcomed` is set to `true` in the profile.

### 7.4 Admin Navigator

```
AdminStack
  └── AdminTabs (bottom tabs, accent: purple #7C3AED)
        ├── AdminMap       → AdminMapScreen
        ├── AdminCustomers → AdminUsersScreen
        ├── AdminInvestors → AdminInvestorsScreen
        └── AdminProfile   → AdminProfileScreen
```

---

## 8. Screens & Features

### 8.1 SplashScreen (`src/screens/SplashScreen.tsx`)

Three onboarding slides shown on first launch:

| Slide | Title | Subtitle |
|-------|-------|----------|
| 1 | Fast & Smart Charging | Find nearest station in seconds |
| 2 | Stations Everywhere | Growing network across Oman |
| 3 | Pay with Ease | Integrated digital wallet |

Navigation buttons: Skip (jump to sign-in) · Next · Get Started.

### 8.2 RoleSelectScreen (`src/screens/RoleSelectScreen.tsx`)

Presents two paths:
- **I Want to Charge** → Customer sign-up/in
- **I Have a Charger** → Host (investor) application path

### 8.3 SignInScreen (`src/screens/SignInScreen.tsx`)

Fields: Email, Password.  
Actions: Sign In · Forgot Password · Google · Apple (iOS) · Browse as Guest · Navigate to Sign Up.

Validation:
- Email must be a valid format.
- Password must be ≥ 6 characters.

### 8.4 SignUpScreen (`src/screens/SignUpScreen.tsx`)

Fields: Full Name, Email, Password.  
Actions: Create Account · Google · Apple (iOS) · Navigate to Sign In.

Duplicate-email detection: checks both `data.user.identities.length === 0` and Supabase error message for "already registered."

### 8.5 MapScreen (`src/screens/MapScreen.tsx`)

The home tab for all roles. Displays:
- All public stations from the `stations` table (color-coded by status: green=available, orange=busy, red=fault, grey=offline).
- All active private charger listings from `charger_listings` (shown with a distinct "My Charger" label for investors viewing their own pin).
- A bottom sheet list of nearby stations sorted by distance.
- A search bar to filter by station name.

Tapping a map pin or list item navigates to `StationDetails`.

### 8.6 StationDetailsScreen (`src/screens/StationDetailsScreen.tsx`)

Displays full station information:
- Name, address, status badge
- Price per kWh, power output, rating
- Connector types (Type2, CCS, CHAdeMO, GBT, Tesla) with status
- Operating hours, last maintenance date
- Amenities (icons: mall, wifi, parking, food court, etc.)
- "Book Now" button → `BookingScreen`
- "Get Directions" button → opens Google Maps / Apple Maps

Stations with `status !== 'available'` show a disabled "Unavailable" button.

### 8.7 BookingScreen (`src/screens/BookingScreen.tsx`)

Step-by-step booking creation:

1. **Day picker** — horizontal scroll of the next 7 days.
2. **Time picker** — grid of available 30-minute slots.
3. **Duration slider** — 30 min to 240 min in 30-min increments.
4. **Cost summary card** — shows estimated kWh, price rate, total cost, and wallet balance after booking.

Wallet guard: if `wallet_balance < estimated_cost`, a modal prompts top-up instead of confirming.

On confirm: inserts a `bookings` row and navigates to `ActiveBookingScreen`.

### 8.8 ActiveBookingScreen (`src/screens/ActiveBookingScreen.tsx`)

Shows the confirmed booking state:
- Large QR code (generated from `bookings.qr_code` UUID).
- Countdown timer to the booked time.
- Booking details (station, date, time, duration, estimated cost).
- "Start Charging Now" button — activates the charger (Tuya switch) and starts a `charging_sessions` row.
- "Cancel Booking" button — opens a reason picker modal, then updates `bookings.status = 'cancelled'`.

### 8.9 ChargingScreen (`src/screens/ChargingScreen.tsx`)

Live charging session view, subscribed to realtime updates:
- Animated battery icon.
- kWh delivered, running cost, elapsed duration.
- Remaining wallet balance after session.
- "Stop Charging" button — ends the session, computes final cost, updates wallet.
- "Back to Home" (minimize) — session continues in background; a floating banner appears on other tabs.

### 8.10 SessionSummaryScreen (`src/screens/SessionSummaryScreen.tsx`)

Post-session receipt:
- kWh delivered, total cost, duration.
- CO₂ saved calculation: `kWh × 0.233 kg` (compared to a petrol car).
- "Share Summary" action sheet.
- "Back to Home" resets navigation to the map tab.

Gesture back-swipe is disabled on this screen (`gestureEnabled: false`) to prevent accidental navigation away from the receipt.

### 8.11 BookingsScreen (`src/screens/BookingsScreen.tsx`)

Lists all bookings for the logged-in user. Sections:
- **Upcoming** (confirmed / active bookings, sorted ascending).
- **Past** (completed / cancelled, sorted descending).

Filter chips: All · Active · Confirmed · Completed.

Each card shows station name, date/time, status badge, and a "View →" button.  
Active bookings show a "⚡ Charging Session Active — tap to view" banner with priority ordering.

Cancel flow: reason picker modal → `bookings.status = 'cancelled'`.

### 8.12 WalletScreen (`src/screens/WalletScreen.tsx`)

Displays:
- Current balance (OMR).
- Stats row: total sessions, total kWh, total OMR spent.
- "Top Up" button → modal with preset amounts (1, 2, 5, 10, 20, 50 OMR).
  - Payment processed via Thawani.
  - On success: updates `profiles.wallet_balance`, inserts `wallet_transactions` (type: `topup`).
- Transaction history list with filter chips (All · Top Up · Charging · Refund).

### 8.13 ProfileScreen (`src/screens/ProfileScreen.tsx`)

User profile hub:
- Avatar (tap to change photo, uploads to Supabase Storage).
- Full name, email, phone, car model.
- Membership badge (Standard / Silver / Gold) with session-progress bar.
- Vehicle section: car model + connector type + year.
- Charging history preview.
- **Investor CTA card** — shows current application status (pending / not approved / needs info), or the "Become a Watt Investor" banner if no application exists yet.
- Settings: Notifications, Security & Privacy, Help & Support, About, Language toggle (EN/AR).
- Sign Out / Delete Account.

### 8.14 InvestorApplicationScreen (`src/screens/InvestorApplicationScreen.tsx`)

Multi-section form customers use to apply as investors:

| Section | Fields |
|---------|--------|
| Personal Information | Full Name*, Phone* |
| Location | Map pin picker (opens full-screen map modal with reverse geocoding), Governorate, City auto-filled |
| Station Name | Optional name for the charger (e.g. "My Home Charger – Seeb") |
| Charger Details | Type (Type2 / CCS / CHAdeMO / GBT)*, Power kW |
| Government Requirements | Electricity Authority Form Name*, Commercial Registration No.*, ID Card No.* |

On submit: inserts a row in `charger_applications` (status: `pending`).  
Success state shows a 4-step checklist: Application Review → Site Visit → Contract Signing → Charger Installation.

The `reapply` route param pre-fills the form from the most recent application.

### 8.15 GuestLockedScreen (`src/screens/GuestLockedScreen.tsx`)

Shown in place of Bookings or Wallet for unauthenticated users. Lists features they're missing and provides "Sign In" / "Create an Account" buttons.

---

## 9. Booking Flow

```
MapScreen
  └─► StationDetailsScreen
          └─► BookingScreen
                  │
                  ├── [insufficient balance] → Wallet top-up modal
                  │
                  └── [confirmed] → ActiveBookingScreen
                                        │
                                        ├── [cancel] → BookingsScreen
                                        │
                                        └── [start charging]
                                                │
                                                ▼
                                          ChargingScreen
                                                │
                                          [stop / auto-end]
                                                │
                                                ▼
                                        SessionSummaryScreen
                                                │
                                          [back to home]
                                                │
                                                ▼
                                            MapScreen
```

### Booking status lifecycle

```
pending → confirmed → active → completed
                   ↘ cancelled
                   ↘ no_show
```

---

## 10. Investor (Host) Flow

### 10.1 Application

1. Customer opens `ProfileScreen` and taps "Become a Watt Investor".
2. `InvestorApplicationScreen` opens. Customer fills in personal info, pins location on map, specifies charger type and government documents.
3. Form submits to `charger_applications` table (status: `pending`).
4. The profile card on ProfileScreen switches to "Application Under Review".

### 10.2 Admin Review

1. Admin opens `AdminInvestorsScreen` and sees the new application.
2. Admin can: **Accept** · **Reject** · **Mark as On Review** · **Add a comment** for the applicant · **Delete** the application.
3. On **Accept**: an RPC (`accept_investor_application`) sets `profiles.role = 'investor'` and creates a `charger_listings` row for the investor.

### 10.3 Post-Approval

1. Investor opens the app → navigation switches to `InvestorNavigator`.
2. `InvestorWelcomeModal` appears once (shows charger address, then sets `investor_welcomed = true`).
3. Investor sees the new "My Charger" tab.

### 10.4 InvestorChargerScreen (`src/screens/investor/InvestorChargerScreen.tsx`)

The investor's charger management hub:

| Feature | Description |
|---------|-------------|
| Online / Offline toggle | Sets `charger_listings.is_available`. Customers see the pin on the map only when online. |
| Tuya Device ID | Investor enters their Tuya device ID. Saved to `charger_listings.tuya_device_id`. |
| Admin Verification | Admin marks `tuya_verified = true`. Until verified, the charger cannot be switched on remotely. |
| Edit Details | Modal to update address, power (kW), price (OMR/kWh), availability hours, and notes for customers. |
| Customer Bookings | Live list of all bookings against the investor's listing (Active Now / Upcoming / Past sections). |
| Charge My Car | Investor can start a self-charging session using their own listing. |

### 10.5 InvestorEarningsScreen (`src/screens/investor/InvestorEarningsScreen.tsx`)

- Available balance (from `profiles.wallet_balance`).
- Earnings this month vs all-time.
- "Withdraw" button (coming soon).
- Wallet transaction history filtered to the investor's account.

---

## 11. Supabase Backend

### Project URL

```
https://cnwlmbpmgwmhzzjnmltz.supabase.co
```

### Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `notify-booking` | Database webhook on `bookings` insert | Sends push notification to the user |

### Database RPCs (stored procedures)

| RPC | Description |
|-----|-------------|
| `check_email_exists(p_email)` | Returns `bool` — used before sending password reset to avoid leaking account existence via error messages |
| `accept_investor_application(application_id)` | Sets `profiles.role = 'investor'`, creates `charger_listings` row, updates application status to `approved` |

---

## 12. Database Schema

### `profiles`

Extends `auth.users`. Created automatically via the `on_auth_user_created` trigger.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | `uuid` | PK → `auth.users` | |
| `phone` | `text` | `''` | |
| `full_name` | `text` | `''` | |
| `role` | `text` | `'customer'` | `customer`, `host`, `investor`, `admin` |
| `is_active` | `boolean` | `true` | Deactivated accounts cannot sign in |
| `avatar_url` | `text` | null | Supabase Storage path |
| `membership_level` | `enum` | `standard` | `standard`, `silver`, `gold` |
| `wallet_balance` | `numeric(10,3)` | `0` | OMR |
| `total_sessions` | `int` | `0` | Incremented on session completion |
| `total_kwh` | `numeric(10,3)` | `0` | |
| `car_model` | `text` | null | |
| `investor_welcomed` | `boolean` | `false` | Welcome modal shown flag |

### `stations`

Public EV charging stations managed by Watt.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | |
| `name` / `name_ar` | `text` | Bilingual names |
| `address` / `address_ar` | `text` | Bilingual addresses |
| `governorate` | `text` | Oman governorate |
| `wilayat` | `text` | Optional sub-region |
| `latitude` / `longitude` | `numeric(10,6)` | |
| `status` | `station_status` | `available`, `busy`, `fault`, `offline` |
| `price_per_kwh` | `numeric(6,3)` | Default: 0.028 OMR |
| `total_connectors` | `int` | |
| `available_connectors` | `int` | |
| `rating` | `numeric(3,2)` | 0–5 |
| `power_kw` | `numeric(6,1)` | e.g. 22, 50, 150 |
| `amenities` | `text[]` | e.g. `['mall','wifi','parking']` |
| `operating_hours` | `text` | e.g. `'24/7'`, `'06:00-00:00'` |

**15 seeded stations** across all Omani governorates: Muscat, Dhofar, Batinah, Dakhliyah, Sharqiyah, Wusta, Musandam, Dhahirah, and Buraimi.

### `connectors`

Child rows of `stations`. One row per physical connector port.

| Column | Type | Description |
|--------|------|-------------|
| `station_id` | `uuid` | FK → `stations` |
| `connector_type` | `enum` | `Type2`, `CCS`, `CHAdeMO`, `GBT`, `Tesla` |
| `power_kw` | `numeric(6,1)` | |
| `status` | `connector_status` | `available`, `occupied`, `fault`, `offline` |

### `bookings`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | `uuid` | FK → `auth.users` |
| `station_id` | `uuid` | FK → `stations` (null for private charger bookings) |
| `listing_id` | `uuid` | FK → `charger_listings` (null for public station bookings) |
| `status` | `booking_status` | `pending`, `confirmed`, `active`, `completed`, `cancelled`, `no_show` |
| `booked_at` | `timestamptz` | Start time of the slot |
| `duration_minutes` | `int` | |
| `estimated_kwh` / `estimated_cost` | `numeric(8,3)` | Calculated at booking time |
| `actual_kwh` / `actual_cost` | `numeric(8,3)` | Set when session completes |
| `qr_code` | `text` | UUID used as QR payload |

### `charging_sessions`

| Column | Type | Description |
|--------|------|-------------|
| `booking_id` | `uuid` | FK → `bookings` (optional — walk-up sessions may not have a booking) |
| `listing_id` | `uuid` | FK → `charger_listings` (for private charger sessions) |
| `status` | `session_status` | `active`, `completed`, `interrupted` |
| `started_at` | `timestamptz` | |
| `ended_at` | `timestamptz` | null while active |
| `kwh_delivered` | `numeric(8,3)` | Incremented in realtime |
| `cost` | `numeric(8,3)` | Running total |

### `wallet_transactions`

| Column | Type | Description |
|--------|------|-------------|
| `type` | `tx_type` | `topup`, `charge`, `refund`, `bonus` |
| `amount` | `numeric(8,3)` | Positive for credits, negative for debits |
| `balance_after` | `numeric(10,3)` | Snapshot of wallet after this transaction |
| `description` | `text` | Human-readable label |
| `payment_method` | `text` | e.g. `'Thawani'` |

### `charger_listings`

Private home charger listings created by investors on approval.

| Column | Type | Description |
|--------|------|-------------|
| `host_id` | `uuid` | FK → `profiles` |
| `station_name` | `text` | Optional display name |
| `charger_type` | `text` | `Type2`, `CCS`, `CHAdeMO`, `GBT` |
| `power_kw` | `numeric(6,2)` | Default: 7.4 |
| `price_per_kwh` | `numeric(6,3)` | Default: 0.025 OMR |
| `is_available` | `boolean` | Investor toggles this to go online/offline |
| `availability_start` / `availability_end` | `text` | e.g. `'08:00'`, `'22:00'` |
| `tuya_device_id` | `text` | Investor's Tuya device identifier |
| `switch_status` | `boolean` | Physical switch state (on/off) |
| `tuya_verified` | `boolean` | Admin marks true after verifying the device |

### `charger_applications`

Investor applications submitted by customers.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | `uuid` | FK → `auth.users` |
| `full_name`, `phone` | `text` | Applicant contact |
| `station_name` | `text` | Optional |
| `governorate`, `city` | `text` | From reverse geocode |
| `latitude`, `longitude` | `float` | From map pin |
| `charger_type` | `text` | |
| `power_kw` | `numeric` | Optional |
| `electricity_form_name` | `text` | Required government doc |
| `commercial_registration` | `text` | Required |
| `id_card_number` | `text` | Required |
| `status` | `text` | `pending`, `under_review`, `approved`, `rejected`, `needs_info` |
| `admin_comment` | `text` | Visible to applicant in ProfileScreen |

---

## 13. Row Level Security

Every table has RLS enabled. Policies follow the principle of least privilege.

| Table | Policy | Rule |
|-------|--------|------|
| `profiles` | read own | `auth.uid() = id` |
| `profiles` | update own | `auth.uid() = id` |
| `stations` | public read | `true` |
| `connectors` | public read | `true` |
| `bookings` | read/insert/update own | `auth.uid() = user_id` |
| `charging_sessions` | read/insert/update own | `auth.uid() = user_id` |
| `wallet_transactions` | read/insert own | `auth.uid() = user_id` |
| `investor_applications` | insert (auth) | `auth.uid() is not null` |
| `investor_applications` | read own | `auth.uid() = user_id` |
| `charger_listings` | public read | `true` (for map display) |
| `charger_listings` | insert own | `auth.uid() = host_id` |
| `charger_listings` | update/delete own | `auth.uid() = host_id` |

Admin operations (Accept/Reject investor applications, deactivate users) use the Supabase service role key via RPCs executed with `SECURITY DEFINER`.

---

## 14. Realtime Subscriptions

The app subscribes to three tables for live updates:

| Table | Subscriber | Purpose |
|-------|-----------|---------|
| `stations` | MapScreen | Status dots update live (busy ↔ available) |
| `bookings` | ActiveBookingScreen, BookingsScreen | Status changes push to UI without a pull-to-refresh |
| `charging_sessions` | ChargingScreen | kWh / cost ticker updates in real time |

Publication configured in schema:
```sql
alter publication supabase_realtime add table stations;
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table charging_sessions;
```

---

## 15. Internationalization (i18n)

### Language files

| File | Language |
|------|----------|
| `src/i18n/en.ts` | English (LTR) |
| `src/i18n/ar.ts` | Arabic (RTL) |

Both files export the same `Translations` interface defined in `ar.ts`. Every string in the app — including status labels, error messages, button text, and FAQ answers — has a translation key.

### LanguageContext (`src/context/LanguageContext.tsx`)

```typescript
const { t, isRTL, lang, setLang } = useLang();
```

- `t` — the full translations object for the active language.
- `isRTL` — `true` when Arabic is active; used to flip `flexDirection`, `textAlign`, and icon mirroring throughout all screens.
- `lang` — `'en'` | `'ar'`.
- `setLang(lang)` — persists choice in `AsyncStorage`.

Language preference persists across app restarts.

### Governorate map (`src/i18n/govMap.ts`)

Maps Oman's 11 governorates between English and Arabic for use in the investor application form:

```typescript
'مسقط' → 'Muscat'
'ظفار' → 'Dhofar'
// etc.
```

---

## 16. Key Components & Contexts

### AuthContext (`src/context/AuthContext.tsx`)

The single source of truth for authentication state.

| Exposed value | Type | Description |
|--------------|------|-------------|
| `session` | `Session \| null` | Supabase auth session |
| `profile` | `Profile \| null` | Active user profile (real or dev) |
| `devProfile` | `Profile \| null` | Dev-mode simulated profile |
| `loading` | `boolean` | True while session/profile is loading |
| `signIn(email, password)` | `async` | Email/password sign-in |
| `signUp(email, password, name)` | `async` | Account creation + profile upsert |
| `signInWithGoogle()` | `async` | OAuth via expo-web-browser |
| `signInWithApple()` | `async` | Apple native auth (iOS) |
| `sendPasswordReset(email)` | `async` | Email reset with existence check |
| `signOut()` | `async` | Clears session + devProfile |
| `updateProfile(data)` | `async` | Partial profile update |
| `deactivateAccount()` | `async` | Sets `is_active = false` + sign out |
| `refreshProfile()` | `async` | Re-fetches profile from DB |
| `devSignIn(profile)` | sync | Sets dev bypass profile |
| `devSignOut()` | sync | Clears dev profile |

### ChargingContext (`src/context/ChargingContext.tsx`)

Tracks an active charging session across navigations. When the user minimizes the ChargingScreen, the session continues and a floating "⚡ Session Active" banner appears in the tab bar. Tapping it navigates back to ChargingScreen.

### LanguageContext (`src/context/LanguageContext.tsx`)

See [Section 15](#15-internationalization-i18n).

### Icons (`src/components/icons.tsx`)

Custom Feather-inspired icon components: `MapPinIcon`, `CalendarIcon`, `WalletIcon`, `UserIcon`, `ZapIcon`, `UsersIcon`, `TrendingUpIcon`, `ShieldIcon`, `StarIcon`, `CheckIcon`, `XIcon`, `LocateIcon`, `ChevronRightIcon`.

All icons accept `size`, `color`, `strokeWidth`, and `filled` props for flexible usage.

### COLORS (`src/constants/colors.ts`)

Centralized color tokens:

| Token | Usage |
|-------|-------|
| `COLORS.primary` | Brand green (main CTA buttons, active tabs) |
| `COLORS.primaryDark` | Dark green (headers, hero sections) |
| `COLORS.primaryBg` | Light green background tint |
| `COLORS.primaryTint` | Light green border |
| `COLORS.gold` | Investor / premium features |
| `COLORS.goldBg` / `COLORS.goldTint` | Gold background and border |
| `COLORS.text` | Primary text |
| `COLORS.textSecondary` | Secondary text |
| `COLORS.textTertiary` | Placeholder / disabled text |
| `COLORS.card` | Card and tab bar background |
| `COLORS.background` | Page background |
| `COLORS.border` | Subtle borders |
| `COLORS.error` | Error states |

---

## 17. Admin Panel

Admin users access a purple-accented interface (`accentColor: '#7C3AED'`).

### AdminMapScreen (`src/screens/admin/AdminMapScreen.tsx`)

- Full-screen map of all 15+ stations.
- Summary stats bar: Total / Available / Busy / Fault / Offline counts.
- Tapping a pin shows a detail sheet with connector info, power, price, operating hours.

### AdminUsersScreen (`src/screens/admin/AdminUsersScreen.tsx`)

- Searchable list of all customer profiles.
- Each row shows: name, phone, join date, session count, kWh, wallet balance, membership.
- Expand a row to see vehicle info and connector preference.
- Actions: **Deactivate** (sets `is_active = false`) · **Reactivate** · **Delete** (hard delete with confirmation).

### AdminInvestorsScreen (`src/screens/admin/AdminInvestorsScreen.tsx`)

- Searchable list of all `charger_applications` with filter chips: All · Pending · Approved · Rejected.
- Application card: name, phone, governorate, charger type, submitted date, status badge.
- Expand to see full details including government documents.
- Actions:
  - **Accept** — promotes the user to investor role, creates charger listing.
  - **Reject** — sets status to `rejected`.
  - **On Review** — sets status to `under_review`.
  - **Add Comment** — saves `admin_comment` visible to the applicant.
  - **Verify Tuya Device** — sets `tuya_verified = true` on the charger listing.
  - **Delete Application** — hard delete with confirmation.

### AdminProfileScreen (`src/screens/admin/AdminProfileScreen.tsx`)

- Admin name, badge "System Administrator".
- Phone number.
- Language toggle.
- Sign out.

---

## 18. Smart Charger (Tuya) Integration

Watt uses the Tuya IoT Cloud to remotely control investor chargers.

### Setup flow

1. Investor purchases a Tuya-compatible EV charger or smart switch.
2. Investor links the device to their Tuya account via the Tuya/Smart Life app.
3. In `InvestorChargerScreen`, investor enters the **Tuya Device ID** (a 16-character hex string, e.g. `bf3a8c0e12345678`).
4. The device ID is saved to `charger_listings.tuya_device_id`.
5. Admin reviews and sets `tuya_verified = true`.
6. The charger is now remotely controllable.

### Remote switching

When a customer presses "Start Charging Now" on `ActiveBookingScreen`:
1. The app calls the Supabase Edge Function (or RPC) that calls the Tuya API: `PUT /v1.0/devices/{device_id}/commands` with `{ code: 'switch_1', value: true }`.
2. The charger turns on.
3. A `charging_sessions` row is created (status: `active`).

When the session ends:
1. The Tuya API call sets `switch_1: false` (charger off).
2. The session row is updated (status: `completed`, `kwh_delivered`, `cost`).

### Status indicators in InvestorChargerScreen

| State | Label | Meaning |
|-------|-------|---------|
| No `tuya_device_id` | "Not linked yet" | Investor has not entered a device ID |
| `tuya_device_id` set, `tuya_verified = false` | "Pending admin verification" | Waiting for admin to verify |
| `tuya_verified = true` | "Verified ✓" | Device is ready |

---

## 19. Membership Levels

Membership is earned automatically based on `profiles.total_sessions`.

| Level | Threshold | Color |
|-------|-----------|-------|
| Standard | 0–9 sessions | Default |
| Silver | 10–49 sessions | Silver |
| Gold | 50+ sessions | Gold |

The profile screen shows a progress bar ("X more sessions to reach Silver/Gold") and a "Silver unlocked! / Gold unlocked!" celebration once reached.

---

## 20. Wallet & Payments

### Top-up

Customers add credit to their in-app wallet via **Thawani** (Oman's local payment gateway).

Preset amounts: 1 · 2 · 5 · 10 · 20 · 50 OMR.

Flow:
1. Customer taps "Top Up" in WalletScreen.
2. Selects an amount.
3. Modal shows: Current Balance / Amount Added / New Balance / Payment via Thawani.
4. On confirm: Thawani payment sheet opens.
5. On success: `wallet_balance` incremented, `wallet_transactions` row inserted (type: `topup`).

### Charging deduction

On session end, `cost` is deducted from `wallet_balance` and a `wallet_transactions` row is inserted (type: `charge`).

### Pricing

| Station type | Price per kWh |
|-------------|---------------|
| Fast charger (150 kW) | 0.028–0.030 OMR |
| Standard AC (22–50 kW) | 0.024–0.028 OMR |
| Private investor charger | Investor-set (default 0.025 OMR) |

**Watt Commission**: 10% of all revenue from investor charger sessions.

---

*Documentation generated for WattApp — Expo SDK 56 — Last updated: June 2026*
