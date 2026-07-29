# Watt App — User Flows & Step-by-Step Guides

> Complete journey maps for every user type in the Watt EV charging platform, from first app open to key actions. Includes the full Tuya smart device setup process for investors.

---

## Table of Contents

- [User Types Overview](#user-types-overview)
- [Flow 1 — Guest User](#flow-1--guest-user)
- [Flow 2 — Customer User](#flow-2--customer-user)
  - [Registration](#21-registration)
  - [Finding & Booking a Station](#22-finding--booking-a-station)
  - [Active Booking & Charging](#23-active-booking--charging)
  - [Managing Your Account](#24-managing-your-account)
  - [Becoming an Investor](#25-becoming-an-investor)
- [Flow 3 — Investor (Host)](#flow-3--investor-host)
  - [Application Acceptance](#31-application-acceptance)
  - [Tuya Device Handover & Setup](#32-tuya-device-handover--setup)
  - [Going Live & Accepting Bookings](#33-going-live--accepting-bookings)
  - [Daily Operations](#34-daily-operations)
  - [Earnings & Withdrawals](#35-earnings--withdrawals)
- [Flow 4 — Admin](#flow-4--admin)
  - [Reviewing Investor Applications](#41-reviewing-investor-applications)
  - [Providing & Verifying the Tuya Device](#42-providing--verifying-the-tuya-device)
  - [Managing Customers](#43-managing-customers)
  - [Monitoring the Station Network](#44-monitoring-the-station-network)
- [End-to-End: Tuya Device Full Lifecycle](#end-to-end-tuya-device-full-lifecycle)
- [Status Reference Tables](#status-reference-tables)

---

## User Types Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        WATT APP USERS                           │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│     GUEST     │   CUSTOMER    │   INVESTOR    │      ADMIN      │
│               │               │   (HOST)      │                 │
│ Browse map    │ Book & charge │ Share charger │ Approve apps    │
│ View stations │ Manage wallet │ Earn income   │ Verify devices  │
│ No account    │ Full account  │ Full account  │ Manage network  │
│               │               │ + host tabs   │                 │
└───────────────┴───────────────┴───────────────┴─────────────────┘
```

| User Type | Account Required | Key Capability | Tab Count |
|-----------|-----------------|----------------|-----------|
| Guest | No | Browse map & stations | 4 (Wallet & Bookings locked) |
| Customer | Yes | Book stations, manage wallet | 4 |
| Investor | Yes (approved) | All customer features + manage private charger | 5 |
| Admin | Yes (assigned) | Approve investors, manage users & network | 4 |

---

## Flow 1 — Guest User

A guest is anyone who opens the app without signing in. They can browse freely but cannot book or use the wallet.

### Complete Guest Journey

```
Open App
    │
    ▼
Splash Screen (3 slides)
    │  Swipe through or tap Skip
    ▼
Sign In Screen
    │  Tap "Browse as Guest"
    ▼
┌─────────────────────────────────────┐
│         GUEST HOME (Map Tab)        │
│  • View all public stations on map  │
│  • Color-coded by status            │
│    🟢 Available  🟠 Busy            │
│    🔴 Fault      ⚫ Offline          │
│  • See nearby stations list         │
│  • Search stations by name          │
└──────────────┬──────────────────────┘
               │ Tap station pin or list item
               ▼
    Station Details Screen
    • Name, address, rating
    • Price per kWh
    • Connector types & status
    • Operating hours & amenities
    • "Get Directions" button (opens Maps)
    • "Book Now" button → redirects to Sign In
               │
               │ Tap Bookings or Wallet tab
               ▼
    Guest Locked Screen
    • Shows what they're missing
    • "Sign In" and "Create Account" buttons
               │
               │ Tap Profile tab
               ▼
    Guest Profile Screen
    • "Create Account" CTA
    • Feature preview list
```

### What a Guest Can Do

| Action | Available? |
|--------|-----------|
| View map & stations | ✅ Yes |
| Read station details | ✅ Yes |
| Get directions to a station | ✅ Yes |
| Search stations | ✅ Yes |
| Book a charging slot | ❌ No — sign in required |
| View wallet | ❌ No — sign in required |
| View booking history | ❌ No — sign in required |

### Guest → Customer Upgrade Path

From any locked screen or the guest profile, tap **Sign In** or **Create an Account** to enter the Customer registration flow.

---

## Flow 2 — Customer User

### 2.1 Registration

```
Sign In Screen
    │
    ├─── Already have an account?
    │         │
    │         ▼
    │    Enter Email + Password
    │         │
    │         ▼
    │    App loads your profile
    │         │
    │         ▼
    │    Customer Home (Map Tab) ✅
    │
    └─── New user?
              │
              ▼
         Sign Up Screen
              │
         Fill in:
         • Full Name
         • Email Address
         • Password (min. 6 characters)
              │
              ▼
         Tap "Create Account"
              │
         Profile created automatically
              │
              ▼
         Customer Home (Map Tab) ✅

    ─── OR use social login ───────────────
    │
    ├─ "Continue with Google"
    │       → In-app browser opens Google OAuth
    │       → Approve → browser closes → profile created
    │       → Customer Home ✅
    │
    └─ "Sign in with Apple" (iOS only)
            → Native Apple sheet
            → Approve → profile created
            → Customer Home ✅
```

### 2.2 Finding & Booking a Station

```
Step 1 — Open the Map
────────────────────────────────────────────────
• All public stations appear as colored pins
• Private investor chargers appear as separate pins
• Bottom sheet lists nearby stations sorted by distance
• Use the search bar to filter by name

Step 2 — View Station Details
────────────────────────────────────────────────
Tap any pin or list item →

Station Details Screen shows:
┌─────────────────────────────┐
│  Station Name               │
│  📍 Address · Governorate   │
│  ⚡ X kW  •  ★ 4.8 (124)   │
│  💰 0.028 OMR / kWh         │
│                             │
│  Connectors:                │
│  [CCS ✅] [Type2 ✅]        │
│                             │
│  Hours: 06:00 – 00:00       │
│  Amenities: Mall · WiFi     │
│             Parking · Food  │
│                             │
│  [Get Directions] [Book Now]│
└─────────────────────────────┘

Step 3 — Book a Slot
────────────────────────────────────────────────
Tap "Book Now" →

Booking Screen:

  1. Choose Day
     [Sun 22] [Mon 23] [Tue 24 ✓] [Wed 25] ...

  2. Choose Time
     [08:00] [08:30] [09:00 ✓] [09:30] ...

  3. Set Duration
     ←─────────────────────────●──── 90 min

  4. Review Cost Summary
     ┌────────────────────────────────┐
     │ Duration:      90 min          │
     │ Estimated kWh: 33 kWh          │
     │ Price:         0.028 OMR/kWh   │
     │ Total Cost:    0.924 OMR       │
     │ Balance After: 4.076 OMR       │
     └────────────────────────────────┘

  ⚠️  If wallet balance < estimated cost:
      → "Insufficient Balance" modal appears
      → Tap "Top Up Wallet" to add credit first

  5. Tap "Confirm Booking"
     → Booking created (status: confirmed)
     → Navigate to Active Booking Screen
```

### 2.3 Active Booking & Charging

```
Active Booking Screen
────────────────────────────────────────────────
┌─────────────────────────────┐
│  ✅ Booking Confirmed        │
│                             │
│  [QR CODE]                  │
│  Show this at the charger   │
│                             │
│  ⏱ Time Remaining: 47:23   │
│    to reach the station     │
│                             │
│  Station:   Muscat Mall Hub │
│  Date:      Tue, 24 Jun     │
│  Time:      09:00           │
│  Duration:  90 min          │
│  Est. Cost: 0.924 OMR       │
└─────────────────────────────┘

    │ Arrive at station
    │ Tap "Start Charging Now"
    ▼

Charging Screen (Live Session)
────────────────────────────────────────────────
┌─────────────────────────────┐
│  ⚡ Charging Session         │
│                             │
│     [Battery Animation]     │
│          68% → 94%          │
│                             │
│  Energy:    12.4 kWh        │
│  Cost:      0.347 OMR       │
│  Duration:  00:26:14        │
│  Remaining: 2.653 OMR       │
└─────────────────────────────┘

Options during charging:
• "Stop Charging" — ends session early, charges actual usage
• "Back to Home" — minimizes screen; session continues in background
  → A "⚡ Session Active" banner appears across all tabs
  → Tap banner to return to Charging Screen

    │ Session ends (manual stop or duration expires)
    ▼

Session Summary Screen (Receipt)
────────────────────────────────────────────────
┌─────────────────────────────┐
│  ✅ Charging Complete!       │
│  Thank you for using Watt   │
│                             │
│  Energy Delivered: 33 kWh   │
│  Total Cost:       0.924 OMR│
│  Duration:         90 min   │
│                             │
│  🌱 CO₂ Saved: 7.7 kg       │
│  (vs. equivalent petrol car)│
│                             │
│  [Share Summary]            │
│  [Back to Home]             │
└─────────────────────────────┘
```

### 2.4 Managing Your Account

#### Wallet — Top Up

```
Wallet Tab
    │
    ▼
┌─────────────────────────────┐
│  💰 5.000 OMR               │
│  Wallet Balance             │
│                             │
│  Sessions: 12               │
│  Total kWh: 144             │
│  OMR Spent: 4.032           │
│                             │
│  [⬆️ Top Up]                 │
└─────────────────────────────┘
    │ Tap "Top Up"
    ▼
Top Up Modal
    Choose amount:
    [1 OMR] [2 OMR] [5 OMR]
    [10 OMR] [20 OMR] [50 OMR]
    │
    ▼
Confirm screen shows:
    Current Balance: 5.000 OMR
    Amount Added:   +10.000 OMR
    New Balance:    15.000 OMR
    Pay via:        Thawani
    │
    Tap "Confirm Top Up"
    ▼
Thawani payment sheet opens
    │ Complete payment
    ▼
✅ "Top Up Successful — 10.000 OMR added"
    Balance updated immediately
```

#### Bookings — Cancel a Booking

```
Bookings Tab → Upcoming section
    │ Tap "Cancel" on a confirmed booking
    ▼
Cancel Modal:
    "Why are you cancelling?"
    ○ Change of plans
    ○ Wrong time slot
    ○ Emergency
    ○ Other
    │ Select reason → Tap "Confirm Cancellation"
    ▼
Booking status → cancelled ✅
Wallet refunded (if applicable)
```

#### Profile — Edit Personal Info

```
Profile Tab → Tap "Edit Info"
    │
    ▼
Edit fields:
    • Full Name
    • Phone Number
    • Car Model
    │ Tap "Save Changes"
    ▼
Profile updated ✅
```

### 2.5 Becoming an Investor

Any customer can apply to become an investor directly from their Profile tab.

```
Profile Tab
    │
    │ See one of these states on the profile card:
    │
    ├── [No application yet]
    │       Card shows: "Become a Watt Investor"
    │       "Add a station and earn monthly income"
    │       Tap → InvestorApplicationScreen
    │
    ├── [Application pending]
    │       Card shows: "Application Under Review"
    │       "Submitted · Watt team will contact you within 48h"
    │
    ├── [Needs more info]
    │       Card shows admin comment
    │       "Submit Updated Application →"
    │       Tap → InvestorApplicationScreen (pre-filled)
    │
    └── [Rejected]
            Card shows: "Application Not Approved"
            "Tap to submit a new application"
            Tap → InvestorApplicationScreen (blank)
```

See **Flow 3** for the full Investor journey after application.

---

## Flow 3 — Investor (Host)

An investor is a customer whose application was accepted by the Watt admin. They keep all customer capabilities and gain three extra things: a dedicated "My Charger" tab, an "Earnings" tab, and a physical Tuya smart device provided by Watt.

### 3.1 Application Acceptance

```
Customer submits InvestorApplicationScreen form
    │
    │ Data saved to charger_applications table
    │ Status: pending
    ▼
Admin reviews application (see Flow 4.1)
    │
    │ Admin taps "Accept"
    ▼
System automatically:
    • Sets profile.role = 'investor'
    • Creates a charger_listings row for this investor
    • Application status → approved
    │
    ▼
Investor opens the app next time
    │
    │ Navigation switches to InvestorNavigator
    ▼
Investor Welcome Modal appears (ONE TIME ONLY)
┌─────────────────────────────────────┐
│  ✅ Application Approved! 🎉         │
│  You are now a Watt Investor        │
│                                     │
│  ⭐ Your Charger Location:          │
│     Seeb, Muscat                    │
│                                     │
│  Complete the setup to start        │
│  accepting bookings and earning.    │
│                                     │
│  [Continue]                         │
└─────────────────────────────────────┘
    │ Tap "Continue"
    ▼
investor_welcomed = true (modal never shows again)
    │
    ▼
Investor Home — 5-tab navigation:
    [Map] [Bookings] [My Charger] [Earnings] [Profile]
```

### 3.2 Tuya Device Handover & Setup

This is the most critical setup step. The Watt admin handles **everything** — physical delivery, hardware installation, Wi-Fi pairing, and Device ID retrieval. The investor's only action is to **paste one code** into the Watt app.

#### Why a Tuya device?

The Tuya smart device is a Wi-Fi-connected smart switch or EV charger controller. It allows Watt (and the investor) to remotely turn the charger ON or OFF. Without it, customers cannot start a charging session through the app.

#### Responsibility split at a glance

| Who | What they do |
|-----|-------------|
| **Admin** | Delivers device · installs it · pairs it to Wi-Fi · retrieves Device ID · sends it to investor |
| **Investor** | Receives Device ID · opens Watt app · pastes the code · saves |

#### Part A — Admin Delivers, Installs & Pairs the Device (On-Site Visit)

```
After accepting the investor application (in the Admin panel):

Admin schedules an on-site visit to the investor's location.
During the visit, the admin:

Step 1 — Bring the Watt Investor Kit
    ┌──────────────────────────────────────────┐
    │  📦 Watt Investor Kit                    │
    │                                          │
    │  Contents:                               │
    │  • 1× Tuya-compatible smart switch /    │
    │       EV charger controller              │
    │  • Power adapter / installation cable   │
    │  • Quick-start reference card           │
    └──────────────────────────────────────────┘

Step 2 — Install the Device
    • Connect the Tuya smart switch between the
      power source and the investor's EV charger
    • Power it on — the LED starts blinking (pairing mode)

Step 3 — Pair the Device to the Investor's Wi-Fi
    On the admin's phone (Smart Life / Tuya Smart app):
    a. Tap "+" → "Add Device"
    b. Select Smart Plug / EV Charger category
    c. Follow the Wi-Fi pairing wizard:
         - Ask the investor for their Wi-Fi network name & password
         - Enter the credentials
         - Wait ~30 seconds for the device to connect
    d. Device appears in Smart Life as "Smart Plug" ✅

Step 4 — Retrieve the Device ID
    In the Smart Life app on the admin's phone:
    • Tap the device name
    • Tap the pencil icon (Edit) top-right
    • Scroll to "Device Information"
    • Copy the value next to "Virtual ID" or "Device ID"
      Example: bf3a8c0e12345678

    ⚠️  This 16-character code is the Tuya Device ID.
        The admin must send it to the investor immediately.

Step 5 — Send the Device ID to the Investor
    Admin shares the code via WhatsApp / SMS / phone call:

    ┌──────────────────────────────────────────────────┐
    │  WhatsApp / SMS to investor:                     │
    │                                                  │
    │  "Your Watt charger device is set up ✅          │
    │   Open the Watt app → My Charger tab →           │
    │   tap Add Device ID and paste this code:         │
    │                                                  │
    │   bf3a8c0e12345678                               │
    │                                                  │
    │   That's all you need to do!"                    │
    └──────────────────────────────────────────────────┘
```

#### Part B — Investor Pastes the Device ID in the Watt App

```
Open Watt App → "My Charger" Tab
    │
    ▼
InvestorChargerScreen
    │
    │ You will see the Setup Progress card:
    │
    ┌─────────────────────────────────────────┐
    │  You're Approved! 🎉                    │
    │  Complete these 4 steps to go live:     │
    │                                         │
    │  ✅ Step 1: Listing Created              │
    │             Your profile is registered  │
    │                                         │
    │  ⏳ Step 2: Link Smart Device           │
    │             Add your Tuya Device ID     │
    │             [Add Device ID]             │  ← Tap this
    │                                         │
    │  ⏳ Step 3: Admin Verification          │
    │             Admin will verify your      │
    │             device (usually 24h)        │
    │                                         │
    │  ⏳ Step 4: Go Live & Earn              │
    │             Enable the online toggle    │
    └─────────────────────────────────────────┘
    │
    │ Tap "Add Device ID"
    ▼
Edit Charger Modal opens
    │
    ▼
Scroll to "Smart Device" section:
┌─────────────────────────────────────────┐
│  TUYA DEVICE ID                         │
│  ┌─────────────────────────────────┐    │
│  │ bf3a8c0e12345678                │    │ ← Paste the code the admin sent
│  └─────────────────────────────────┘    │
│                                         │
│  Device Status: Not linked yet          │
└─────────────────────────────────────────┘
    │
    │ Paste the 16-character code received from admin
    │ Tap "Save Changes"
    ▼
Device ID saved to charger_listings.tuya_device_id ✅

Status now shows:
    Device Status: ⏳ Pending admin verification

✅ That's it — the investor's job is done.
   The admin handles the final verification remotely.
```

#### Part C — Admin Verifies the Device in the App (Remote)

```
After receiving confirmation that the investor has pasted the code:

Admin opens Watt App → Admin Panel → Investors tab
    │
    │ Finds the investor's approved application
    │ Expands it to see "Charger Device" section:
    │
    ┌──────────────────────────────────────┐
    │  CHARGER DEVICE                      │
    │  Device ID:     bf3a8c0e12345678     │
    │  Status:        Not verified         │
    │                                      │
    │  [Verify Device]                     │
    └──────────────────────────────────────┘
    │
    │ Admin already confirmed the physical install
    │ during the on-site visit — this is the final
    │ in-app sign-off.
    │
    │ Tap "Verify Device"
    │ Confirmation: "Mark this device as verified?
    │               This allows customers to start charging."
    │ Tap "Verify"
    ▼
tuya_verified = true ✅

Investor receives a notification (or admin informs via WhatsApp):
    "Your device is verified — you can now go live!"
```

#### Part D — Investor Sees Verified Status & Goes Live

```
Investor opens "My Charger" tab
    │
    ▼
Device Status: ✅ Verified & active

Setup Progress:
    ✅ Step 1: Listing Created
    ✅ Step 2: Smart Device Linked    (code pasted)
    ✅ Step 3: Admin Verified         (done remotely by admin)
    ⏳ Step 4: Go Live & Earn  ← Last step — investor toggles ON
```

### 3.3 Going Live & Accepting Bookings

```
"My Charger" Tab
    │
    ▼
Online/Offline Toggle (now unlocked after verification)
    │
    │ Toggle ON
    ▼
Confirmation prompt:
    "This will make your charger visible to customers on the map."
    [Cancel] [Turn Online]
    │
    │ Tap "Turn Online"
    ▼
charger_listings.is_available = true ✅

Your charger pin now appears on the map for all users!

    ┌──────────────────────────────────────┐
    │  ⚡ My Charger                       │
    │  Status: 🟢 Online                   │
    │                                      │
    │  Address:   Street 12, Al Khuwair    │
    │  Type:      Type2                    │
    │  Power:     7.4 kW                   │
    │  Price:     0.025 OMR/kWh            │
    │  Hours:     08:00 – 22:00            │
    │                                      │
    │  Total Sessions:  0                  │
    │  Your Rating:     No ratings yet     │
    └──────────────────────────────────────┘

Tip shown: "Toggle ON to make your charger visible to customers on the map."
```

### 3.4 Daily Operations

#### Monitoring Customer Bookings

```
"My Charger" Tab → Scroll down to "Customer Bookings"
    │
    ▼
Bookings are grouped into 3 sections:
┌──────────────────────────────────────┐
│  ⚡ Active Now                        │
│  Mohammed A. · started 14 mins ago   │
│  Duration: 60 min                    │
├──────────────────────────────────────┤
│  📅 Upcoming                         │
│  Khalid S. · Today 16:00 · 90 min   │
│  Sara M.   · Tomorrow 10:30 · 60 min │
├──────────────────────────────────────┤
│  ✅ Past                             │
│  Ahmed H.  · Yesterday 09:00 ✅      │
└──────────────────────────────────────┘
```

#### Editing Charger Details

```
"My Charger" Tab → Tap pencil / "Edit Details"
    │
    ▼
Edit Modal:
    • Address / Landmark
    • Power Output (kW)
    • Price per kWh (OMR)
    • Available From  (e.g. 08:00)
    • Available Until (e.g. 22:00)
    • Notes for customers
      (e.g. "Ring bell on arrival, gate code: 1234")
    │
    Tap "Save Changes" ✅
```

#### Taking the Charger Offline

```
"My Charger" Tab → Toggle OFF the online switch

⚠️  When offline:
    • Your pin disappears from customer map
    • No new bookings can be made
    • Existing confirmed bookings are NOT cancelled
      (coordinate directly with those customers)
```

#### Charging Your Own Car

```
"My Charger" Tab → Tap "Charge My Car"
    │
    ▼
Confirmation:
    "Start Charging — This will turn on your charger and
     start a session. Cost deducted from your wallet at
     your listed rate."
    [Cancel] [Start]
    │
    │ Prerequisites:
    │   ✅ Tuya device linked
    │   ✅ Device admin-verified
    │ ❌ If not met → error message shown
    ▼
Charging session starts for your own listing
Session tracked in ChargingScreen as normal
```

### 3.5 Earnings & Withdrawals

```
"Earnings" Tab (was "Wallet" in customer view)
    │
    ▼
┌──────────────────────────────────────┐
│  💰 Available Balance: 12.450 OMR   │
│  [Withdraw]  (coming soon)           │
│                                      │
│  This Month:   4.200 OMR            │
│  All Time:    12.450 OMR            │
│                                      │
│  Wallet Transactions                 │
│  ─────────────────────────          │
│  ⚡ Charging – Mohammed A.  +0.925  │
│  ⚡ Charging – Khalid S.    +1.120  │
│  ⚡ Charging – Sara M.      +0.750  │
└──────────────────────────────────────┘

Earnings come from:
    Customer charges your listing
        → 90% of session cost → your wallet
        → 10% commission → Watt platform
```

---

## Flow 4 — Admin

The admin manages the entire platform: investor applications, station network, and customer accounts.

### 4.1 Reviewing Investor Applications

```
Admin Panel → "Investors" Tab
    │
    ▼
Applications list with filter chips:
    [All] [Pending] [Approved] [Rejected]
    │
    ▼
Each application card shows:
┌──────────────────────────────────────┐
│  Mohammed Ahmed               PENDING│
│  📞 +968 9123 4567                   │
│  📍 Seeb, Muscat                     │
│  🔌 Type2  ·  7.4 kW                │
│  📅 Submitted: Jun 20, 2026         │
└──────────────────────────────────────┘
    │ Tap card to expand full details
    ▼
Full Application Detail:
    Personal Information:
        Name:  Mohammed Ahmed
        Phone: +968 9123 4567

    Location:
        Governorate: Muscat
        City:        Seeb
        Coordinates: 23.58800, 58.38290

    Charger Details:
        Type:  Type2
        Power: 7.4 kW

    Government Requirements:
        Electricity Form: Muscat Electricity Distribution
        Commercial Reg:   1234567
        ID Card:          A1234567

    Admin Actions:
    ┌──────────────────────────────────┐
    │  [📞 Call]  [✅ Accept]          │
    │  [❌ Reject] [🔍 On Review]      │
    │                                  │
    │  Comment for Applicant:          │
    │  ┌────────────────────────────┐  │
    │  │ Write a note...            │  │
    │  └────────────────────────────┘  │
    │  [Save Comment]                  │
    │                                  │
    │  [🗑 Delete Application]         │
    └──────────────────────────────────┘
```

#### Admin Decision Actions

| Action | What Happens | Applicant Sees |
|--------|-------------|----------------|
| **Accept** | role → `investor`, charger listing created | Welcome modal on next app open |
| **Reject** | status → `rejected` | "Not Approved" card on Profile |
| **On Review** | status → `under_review` | "Under Review" card |
| **Add Comment** | admin_comment saved | Comment shown on their Profile card |
| **Delete** | Application permanently deleted | Card disappears from Profile |

### 4.2 Providing & Verifying the Tuya Device

The admin owns this entire process. The investor only needs to paste one code.

#### Phase 1 — Admin On-Site Visit (Full Setup)

```
After tapping "Accept" on the investor application:

1. Admin retrieves a Tuya smart device from inventory.

2. Admin schedules and conducts a site visit to the investor's location.
   During the visit:

   a. Install the device
      • Connect the Tuya smart switch between the power
        source and the investor's EV charger
      • Power it on — LED blinks (ready to pair)

   b. Pair the device to the investor's Wi-Fi
      On the admin's phone (Smart Life / Tuya Smart app):
      • Tap "+" → "Add Device" → Smart Plug / EV Charger
      • Follow the pairing wizard:
          - Ask investor for their Wi-Fi name & password
          - Enter credentials → wait ~30 seconds
      • Device appears in Smart Life ✅

   c. Retrieve the Device ID
      • In Smart Life: tap device → pencil icon → Device Information
      • Copy the "Virtual ID" (e.g. bf3a8c0e12345678)

   d. Send the Device ID to the investor
      ┌──────────────────────────────────────────────────┐
      │  WhatsApp / SMS to investor:                     │
      │                                                  │
      │  "Your Watt charger device is set up ✅          │
      │   Open Watt app → My Charger tab →               │
      │   tap Add Device ID and paste this code:         │
      │                                                  │
      │   bf3a8c0e12345678                               │
      │                                                  │
      │   That's all you need to do!"                    │
      └──────────────────────────────────────────────────┘

   e. Confirm the charger works on-site
      • Test switch ON/OFF via Smart Life app
      • The physical charger should power on and off ✅
```

#### Phase 2 — Admin Remote Verification (In-App, After Investor Pastes Code)

```
Once the investor pastes the Device ID in the Watt app
(see Investor Flow 3.2, Part B):

Admin Panel → "Investors" Tab
    │ Find the investor's approved application
    │ Expand to see the "Charger Device" section
    ▼
┌──────────────────────────────────────┐
│  CHARGER DEVICE                      │
│                                      │
│  Device ID:  bf3a8c0e12345678        │
│  Status:     ⚠️ Not verified         │
│                                      │
│  [Verify Device]                     │
└──────────────────────────────────────┘
    │
    │ Physical install was confirmed on-site in Phase 1.
    │ This is the final in-app sign-off.
    │
    │ Tap "Verify Device"
    ▼
Confirmation dialog:
    "Mark this device as verified?
     This allows customers to start charging."
    [Cancel] [Verify]
    │
    Tap "Verify" →
    │
    ▼
tuya_verified = true ✅
Investor sees: "Verified ✓" in their My Charger tab
Charger online toggle is now fully functional
Notify investor: "You're verified — go live!"
```

### 4.3 Managing Customers

```
Admin Panel → "Customers" Tab
    │
    ▼
Searchable customer list
(Search by name or phone number)
    │
    ▼
Each customer row:
┌──────────────────────────────────────┐
│  Sara Mohammed                       │
│  📞 +968 9876 5432                   │
│  Joined: Jan 15, 2026               │
│  Sessions: 24  kWh: 288  💰 8.000  │
│  Membership: 🥈 Silver               │
└──────────────────────────────────────┘
    │ Tap to expand
    ▼
Expanded details:
    • Vehicle: Tesla Model 3
    • Connector: CCS
    • Wallet Balance: 8.000 OMR
    • Membership: Silver

Admin Actions:
    ┌──────────────────────────────────┐
    │  [🔴 Deactivate Account]         │
    │  Customer blocked from sign-in   │
    │                                  │
    │  [🟢 Reactivate Account]         │
    │  (if already deactivated)        │
    │                                  │
    │  [🗑 Delete Account]             │
    │  ⚠️ Permanent — cannot undo      │
    └──────────────────────────────────┘
```

### 4.4 Monitoring the Station Network

```
Admin Panel → "Stations" Tab (default)
    │
    ▼
Full-screen map of all public stations
    │
    ▼
Summary bar at top:
┌────────────────────────────────────────────┐
│  Total: 15  │ Available: 12 │ Busy: 2      │
│  Fault: 1   │ Offline: 0                   │
└────────────────────────────────────────────┘
    │
    │ Tap any station pin
    ▼
Station Info Sheet:
┌──────────────────────────────────────┐
│  Muscat Mall Charging Hub            │
│  Status: 🟢 Available                │
│  Connectors: 4 available / 4 total   │
│  Power: 50 kW                        │
│  Price: 0.028 OMR/kWh               │
│  Hours: 06:00 – 00:00               │
│  Last Maintenance: Not recorded      │
└──────────────────────────────────────┘
```

---

## End-to-End: Tuya Device Full Lifecycle

This diagram shows the complete journey of the Tuya device from admin approval to a customer starting a charging session.

```
═══════════════════════════════════════════════════════════════════
                    TUYA DEVICE LIFECYCLE
═══════════════════════════════════════════════════════════════════

PHASE 1 — APPLICATION & ACCEPTANCE
───────────────────────────────────
Customer  ──► Submits InvestorApplicationScreen form
                    │
                    ▼
Admin     ──► Reviews in AdminInvestorsScreen
                    │
                    │ Taps "Accept"
                    ▼
System    ──► profile.role = 'investor'
          ──► charger_listings row created
          ──► Application status = 'approved'

PHASE 2 — ADMIN ON-SITE VISIT  (OFF-APP)
─────────────────────────────────────────
Admin     ──► Travels to investor's location with Watt Investor Kit
          ──► Installs the Tuya smart switch on the charger circuit
          ──► Opens Smart Life app on admin's phone
          ──► Pairs the device to investor's Wi-Fi
          ──► Retrieves the Device ID from Smart Life app
          ──► Sends the Device ID to investor via WhatsApp / SMS

PHASE 3 — INVESTOR PASTES THE CODE  (WATT APP)
────────────────────────────────────────────────
Investor  ──► Receives Device ID from admin (e.g. bf3a8c0e12345678)
          ──► Opens Watt → "My Charger" tab
          ──► Taps "Add Device ID"
          ──► Pastes: bf3a8c0e12345678  ← ONE action only
          ──► Saves → tuya_device_id stored in DB

              Device Status: ⏳ Pending verification

PHASE 4 — ADMIN REMOTE VERIFICATION  (WATT ADMIN PANEL)
─────────────────────────────────────────────────────────
Admin     ──► Opens AdminInvestorsScreen
          ──► Finds investor → sees Device ID pasted
          ──► Taps "Verify Device"  (install already confirmed on-site)
          ──► tuya_verified = true ✅
          ──► Notifies investor: "You're verified — go live!"

PHASE 6 — GO LIVE
──────────────────
Investor  ──► Device Status shows: "Verified ✓"
          ──► Toggles online switch ON
          ──► is_available = true
          ──► Charger pin appears on map for all users

PHASE 7 — CUSTOMER BOOKS & CHARGES
────────────────────────────────────
Customer  ──► Sees charger on map
          ──► Books time slot
          ──► Arrives → "Start Charging Now"
                    │
                    ▼
System    ──► Calls Tuya API: switch_1 = true (charger ON)
          ──► charging_sessions row created (status: active)
          ──► ChargingScreen shows live kWh / cost

Customer  ──► Session ends (manual stop or duration expires)
                    │
                    ▼
System    ──► Calls Tuya API: switch_1 = false (charger OFF)
          ──► Session completed, cost deducted from wallet
          ──► 90% earnings → investor wallet
          ──► 10% commission → Watt

═══════════════════════════════════════════════════════════════════
```

---

## Status Reference Tables

### Booking Status

| Status | Meaning | Customer Sees |
|--------|---------|---------------|
| `pending` | Created but not confirmed | Loading... |
| `confirmed` | Confirmed, awaiting arrival | QR code + countdown |
| `active` | Charging session in progress | ChargingScreen |
| `completed` | Session finished | Receipt in history |
| `cancelled` | Cancelled by customer | Cancelled badge |
| `no_show` | Customer didn't arrive | No-show badge |

### Investor Application Status

| Status | Meaning | Investor Sees on Profile |
|--------|---------|--------------------------|
| `pending` | Submitted, waiting for admin | "Under Review" |
| `under_review` | Admin is actively reviewing | "Under Review" |
| `approved` | Accepted — investor role granted | Welcome modal (once) |
| `rejected` | Not approved | "Not Approved" |
| `needs_info` | Admin needs more documents | Admin's comment shown |

### Tuya Device Status

| Condition | Status Label | Investor Can Go Online? |
|-----------|-------------|------------------------|
| No `tuya_device_id` entered | "Not linked yet" | ❌ No |
| `tuya_device_id` set, `tuya_verified = false` | "Pending admin verification" | ❌ No |
| `tuya_verified = true` | "Verified ✓" | ✅ Yes |

### Station Status

| Status | Color on Map | Meaning |
|--------|-------------|---------|
| `available` | 🟢 Green | Has available connectors |
| `busy` | 🟠 Orange | All connectors occupied |
| `fault` | 🔴 Red | Hardware issue reported |
| `offline` | ⚫ Grey | Station not operational |

---

*User Flows — WattApp · Expo SDK 56 · June 2026*
