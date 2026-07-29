# Watt — Go-Live Guide

Everything in the codebase is production-ready. The steps below are the
account/credential actions only **you** can do (they need interactive logins
or merchant accounts I can't access). Do them in order.

---

## 1. Add the remaining secrets (Supabase Edge Functions)

Run from `WattApp/`. All other secrets (Tuya, push, base URLs) are already set.

```bash
# Thawani — from your Thawani merchant dashboard (UAT keys to test first)
npx supabase secrets set THAWANI_SECRET_KEY=<your_thawani_secret_key> --project-ref cnwlmbpmgwmhzzjnmltz
npx supabase secrets set THAWANI_PUBLISHABLE_KEY=<your_thawani_publishable_key> --project-ref cnwlmbpmgwmhzzjnmltz
# Already set to UAT. For production payments switch to:
#   npx supabase secrets set THAWANI_BASE_URL=https://checkout.thawani.om --project-ref cnwlmbpmgwmhzzjnmltz
```

Until the two Thawani keys are set, top-up shows a clear "not configured"
message instead of processing money. Everything else works without them.

---

## 2. Link EAS + create the project (enables push tokens + builds)

`eas init` writes `extra.eas.projectId` into `app.json`. Push notifications
only deliver once this exists — the app degrades gracefully until then.

```bash
npm install -g eas-cli
eas login                 # your Expo account
eas init                  # creates the project, writes projectId to app.json
eas build:configure       # confirms eas.json (already committed)
```

Then commit the `app.json` change `eas init` makes.

---

## 3. Production builds

```bash
eas build --platform android --profile production   # → .aab for Play Store
eas build --platform ios --profile production       # → .ipa for App Store
```

- Android: EAS will generate/manage the upload keystore for you.
- iOS: requires the Apple Developer Program ($99/yr); EAS handles signing when
  you log in with your Apple ID during the build.

Version numbers auto-increment (`appVersionSource: remote` in `eas.json`).

---

## 4. Push notifications credentials (one-time, during first build)

- **Android:** EAS uploads FCM credentials automatically the first time you
  build — accept the prompt, or run `eas credentials`.
- **iOS:** EAS generates the APNs key automatically during the iOS build.

No code changes needed — `send-push` uses the Expo Push service.

---

## 5. Google Maps production key (B-07)

The key in `app.json` (`android.config.googleMaps.apiKey`) is a dev key.
Before public release: create a billing-enabled key in Google Cloud Console,
restrict it to the `com.watt.ev` package + SHA-1 from `eas credentials`, and
replace the value.

---

## 6. Store listing copy

### App name
`Watt — EV Charging Oman`

### Subtitle / short description (≤ 30 / 80 chars)
- EN: `Charge your EV across Oman`
- AR: `اشحن سيارتك الكهربائية في عُمان`

### Full description — EN
```
Watt is Oman's EV charging network in your pocket.

FOR DRIVERS
• Find charging stations across all governorates on a live map
• See real-time availability, connector types, and pricing
• Book a slot, scan to start, and watch your session live (kWh, cost, CO₂ saved)
• Pay seamlessly from your in-app wallet
• Full booking history and receipts

FOR HOSTS (INVESTORS)
• Share your home charger and earn
• Manage availability with a single tap
• Track bookings and earnings in real time

• Full Arabic and English support (RTL)
• Secure payments via Thawani
```

### Full description — AR
```
واط هي شبكة شحن السيارات الكهربائية في عُمان بين يديك.

للسائقين
• اعثر على محطات الشحن في جميع المحافظات على خريطة مباشرة
• اطّلع على التوفّر الفوري وأنواع القوابس والأسعار
• احجز موعداً، وامسح للبدء، وتابع جلستك مباشرةً (كيلوواط/ساعة، التكلفة، ثاني أكسيد الكربون الموفَّر)
• ادفع بسهولة من محفظتك داخل التطبيق
• سجل حجوزات وإيصالات كامل

للمضيفين (المستثمرين)
• شارك شاحنك المنزلي واربح
• تحكّم في التوفّر بلمسة واحدة
• تابع الحجوزات والأرباح في الوقت الفعلي

• دعم كامل للعربية والإنجليزية
• مدفوعات آمنة عبر ثواني
```

### Keywords (App Store)
`EV, charging, electric car, Oman, charger, Thawani, EVSE, شحن, كهربائية`

### Category
Primary: `Travel` (or `Utilities`) · Content rating: everyone / 4+

---

## 7. Screenshots (required by both stores)

Capture on a simulator/emulator (no device needed):
- Map with station pins
- Station details
- Live charging screen
- Wallet
- Investor "My Charger" screen

Sizes: iPhone 6.7" + 6.1" (iOS), phone (Android). Do EN and AR sets.

---

## 8. Privacy Policy URL

Both stores require a public Privacy Policy URL. Host the existing policy from
the marketing website at `https://<yourdomain>/privacy` and paste the URL into
both store listings.

---

## Status snapshot

| Area | State |
|------|-------|
| Real hardware energy reading (Tuya) | ✅ live, deployed |
| Expo SDK 56 upgrade | ✅ done, `expo-doctor` clean |
| Password reset deep link | ✅ done |
| Push notifications (code + server) | ✅ done — needs `eas init` + build for delivery |
| Realtime charger status | ✅ done |
| Thawani payments (code + server) | ✅ deployed — needs merchant keys (step 1) |
| EAS build config + store copy | ✅ this file |
| Apple/Google accounts, builds, keys | ⏳ your action (steps 2–8) |
