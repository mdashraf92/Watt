# Watt — Hardware Integration Guide
## Tuya Rail Switch ↔ App

This guide walks through every step to physically connect a Tuya-compatible rail switch (DIN breaker switch) to the Watt app so the app can turn power on and off automatically when a customer starts or stops a charging session.

---

## Equipment Required

| Item | Notes |
|------|-------|
| Tuya Wi-Fi Rail Switch | Any Tuya-compatible DIN-rail smart switch rated ≥ 32A (e.g., Tuya 1P+N 32A or 63A) |
| EV Charging Cable / EVSE unit | The cable that connects to the car |
| DIN Rail enclosure | Weatherproof box to house the switch |
| Wi-Fi Router / Hotspot | 2.4 GHz only — Tuya devices do NOT support 5 GHz |
| Tuya Smart app | Downloaded on investor's phone (iOS / Android) |
| Screwdriver + wire stripper | For physical wiring |
| Qualified electrician | Required — mains voltage wiring |

---

## Step 1 — Physical Wiring (Electrician required)

```
Grid Supply (Mains)
      │
  ┌───┴───┐
  │ MCB   │  (Main circuit breaker — existing)
  └───┬───┘
      │
  ┌───┴────────────┐
  │  Tuya Rail     │  ← Install this in the enclosure
  │  Switch        │
  └───┬────────────┘
      │
  ┌───┴───┐
  │  EVSE │  (EV charging unit / cable)
  └───────┘
      │
   [EV Car]
```

**Wiring notes:**
- Wire the Tuya switch **in series** between the MCB and the EVSE unit
- The switch must be rated for the EVSE's amperage (min 32A for 7kW chargers)
- Use appropriate cable gauge (6mm² for 32A, 10mm² for 40A+)
- The switch controls the **live (L)** wire; neutral (N) and earth (PE) pass through directly
- Mount in a weatherproof IP65 enclosure if outdoors

---

## Step 2 — Pair the Switch to the Tuya App

1. Download **Tuya Smart** or **Smart Life** app on your phone
2. Create a Tuya account (or log in)
3. Tap **"+"** → **Add Device** → **Electrical** → **Switch**
4. Put the switch into pairing mode:
   - Hold the reset button for 5 seconds until the LED blinks rapidly
5. Follow in-app instructions (connect to your 2.4 GHz Wi-Fi)
6. Name the device (e.g., "Watt Charger - Villa 12")
7. Verify the switch toggles ON/OFF from the Tuya app before proceeding

---

## Step 3 — Get the Tuya Device ID

1. Open Tuya Smart app → tap the device
2. Tap the **pencil/edit** icon (top right)
3. Scroll down → tap **Device Information**
4. Copy the **Virtual ID** or **Device ID** (format: `bf3a8c0e12345678abcd`)

---

## Step 4 — Get Tuya API Credentials (One time, done by Watt admin)

> This step is done once by the Watt team — not by each investor.

1. Go to [iot.tuya.com](https://iot.tuya.com) → Log in
2. **Cloud** → **Create Cloud Project**
   - Development method: Smart Home
   - Data center: **Europe** (covers Middle East / Oman)
3. Once created, go to **Overview** → copy:
   - **Access ID / Client ID** → `TUYA_CLIENT_ID`
   - **Access Secret / Client Secret** → `TUYA_CLIENT_SECRET`
4. Link your Tuya Smart app account to the Cloud project:
   - **Cloud** → **Devices** → **Link Tuya App Account**
   - Scan the QR code with the Tuya Smart app
5. Set the Supabase secrets (in terminal, inside `WattApp/`):
   ```bash
   npx supabase secrets set TUYA_CLIENT_ID=your_access_id
   npx supabase secrets set TUYA_CLIENT_SECRET=your_access_secret
   npx supabase secrets set TUYA_BASE_URL=https://openapi.tuyaeu.com
   npx supabase secrets set AUTO_SHUTOFF_SECRET=da4420bd-2c0e-4ac3-962c-22ade49b3397
   ```
   > **Note:** The `AUTO_SHUTOFF_SECRET` value above was auto-generated during setup. Do not change it unless you regenerate it in the database.

---

## Step 5 — Enter Device ID in the Watt App (Investor)

1. Investor opens the Watt app → **My Charger** tab
2. Tap **Edit** (top right)
3. Scroll to **Tuya Device ID** field at the bottom
4. Paste the Device ID copied in Step 3
5. Tap **Save Changes**
6. Status will show: **"⏳ Pending admin verification"**

---

## Step 6 — Admin Verifies the Device

1. Admin opens the Watt app → **Admin** → **Investors** tab
2. Find the investor → tap to open their application detail
3. Scroll to **Charger Device** section
4. Confirm the Device ID shown matches what the investor reported
5. Tap **"✓ Verify Device"**
6. Status changes to **"Verified ✓"**

> After verification, customers can activate the charger by tapping "Start Charging" in the app.

---

## How It Works After Setup

```
Customer taps "Start Charging"
        │
        ▼
App calls control-tuya-switch (action: 'on', booking_id)
        │
        ▼
Edge Function validates:
  • User owns the booking
  • Current time ≥ booking start time
  • Current time < booking end time
  • Device is tuya_verified = true
        │
        ▼
Tuya Cloud API → Rails Switch turns ON → Power flows → Car charges
        │
Customer taps "Stop Charging"
        │
        ▼
App calls control-tuya-switch (action: 'off', booking_id)
        │
        ▼
Tuya Cloud API → Rail Switch turns OFF → Power cut
        │
        ▼
Session completed, wallet deducted, receipt shown

─────────────────────────────────────────────────────
Auto-shutoff (if customer forgets to stop):
  pg_cron runs every minute
  → calls auto-shutoff-chargers edge function
  → finds sessions past booking end time
  → turns off switch automatically
  → marks session completed
```

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| "Charger device not configured" | Device ID not entered | Investor must add Tuya Device ID in app |
| "Charger not yet verified by admin" | Admin hasn't verified | Admin taps Verify Device in investor detail |
| "Tuya token error" | Wrong API credentials | Re-check `TUYA_CLIENT_ID` / `TUYA_CLIENT_SECRET` secrets |
| "Booking time not reached yet" | Customer tapped Start too early | Normal — button is disabled until booking time |
| Switch not responding | Wi-Fi issue | Check device is online in Tuya Smart app |
| 5 GHz Wi-Fi | Tuya doesn't support 5 GHz | Use 2.4 GHz only router |
| Device offline in Tuya app | Power loss or Wi-Fi down | Restore power/Wi-Fi; device re-connects automatically |

---

## Safety Notes

- Always use a **rated electrician** for the physical wiring
- The rail switch must be **rated equal to or above** the EVSE's maximum amperage
- Install a **dedicated MCB** for the EV charger circuit
- Use **weatherproof enclosures** (IP65+) for outdoor installations
- Test the switch manually in the Tuya app before submitting Device ID to Watt
- Do not share the Tuya API credentials — they control all investor switches
