# Dashboard testing

This development sandbox uses a separate local PostgreSQL database. It does not modify the shared backend `.env` or production accounts. Its money, orders and bookings are fictional test records.

## Start the sandbox

From `mobile-app/backend`:

```powershell
npm run dashboard:setup
npm run dashboard:sandbox
```

Setup requires local PostgreSQL binaries (default: PostgreSQL 18). It preserves generated account passwords on reruns. The API listens on port 8081.

Open http://localhost:8081/dashboard/ for administrators or http://localhost:8081/seller/ for sellers. Passwords and account IDs are in `mobile-app/.artifacts/dashboard-sandbox/test-users.json`; this private generated file is ignored by version control.

| Test email | Access | Functionality to test |
| --- | --- | --- |
| test-superadmin@gowatt.invalid | Admin dashboard | Action inbox, configuration status, job HTTP history, platform management |
| test-admin@gowatt.invalid | Admin dashboard | Action inbox, search, saved status filters, record actions |
| test-shop@gowatt.invalid | Seller portal | Orders, product fields, duplicate listings, bulk stock, settlement balance |
| test-service@gowatt.invalid | Seller portal | Customer booking details, daily calendar, availability capacity, service listings |
| test-host@gowatt.invalid | Mobile host dashboard | Earnings, active sessions, pending payouts, host bookings |
| test-investor@gowatt.invalid | Mobile investor dashboard | Monthly earnings and sessions, active charging, pending payouts |
| test-cafe@gowatt.invalid | Mobile cafe staff dashboard | Search paid orders, oldest orders first, collection workflow |
| test-operator@gowatt.invalid | Mobile operator dashboard | Assigned van, operational controls, visible load failures |
| test-customer@gowatt.invalid | Mobile customer account | Marketplace orders, appointments and wallet |

Mobile testing requires a development build pointing `EXPO_PUBLIC_API_URL` at this API. On a physical phone, use the development computer's reachable LAN address with port 8081; `localhost` on the phone points at the phone itself. Production deployment configuration is deferred.

## Verification

```powershell
npm run build
npm run test:packages
npm run test:marketplace
npm run test:delivery
npm run test:dashboards
```

The dashboard check exercises account access for all nine users and browser workflows for both administrator roles and both seller roles, including stock updates, listing duplication and availability creation. Browser screenshots are saved beside the credentials. It requires Playwright and installed Chromium; `PLAYWRIGHT_MODULE` can override the local module location.

Availability changes enforce ownership, booked capacity and appointment history. Stock updates are atomic and reject stale versions. Settlement balances exclude refunded or settled items and distinguish eligible from pending funds. Configuration status reports whether credentials are configured; live payment, SMS, email and charging-device verification still require real integrations. Native dashboards still need testing on a phone before release.
