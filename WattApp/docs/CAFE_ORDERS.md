# Go Watt Café — order coffee, get a charging pass

Beanz-style order-ahead, limited to cafés that host a Go Watt charger. The driver picks a
package (e.g. **Coffee + 60 min — 5.000 OMR**), chooses the drink, pays by card, and gets one
QR/code used both to collect the coffee and as the charging pass.

## Flows

**Customer:** Coffee tab → café → package + drink (+ extras) → Pay by card → order screen
(live status, QR pass, **Start included charging**).

**Café staff:** Coffee tab → *Open my café orders* → **Accept** → **Mark ready** → enter the
customer's code (or tap the order) → **Collected**. A switch pauses new orders.

**Admin:** Admin profile → *Cafés*: enable café ordering on a package venue, set the split,
maintain the menu (manual / CSV / Beanz sync), create settlements and mark them paid,
handle refunds the gateway refused. Package price, charging minutes and **included drinks**
stay in *Manage venue packages*.

## Money

- Go Watt collects 100% by card (Thawani). No wallet involvement.
- Each paid order writes one `cafe_ledger` row: `charge_share` (Go Watt, fixed OMR per order)
  → `commission_pct` and, for Beanz cafés, `beanz_fee_pct` taken from the remainder → the
  café gets the rest. A check constraint enforces that the parts sum to the gross.
- Settlements batch unsettled, unvoided, accepted/ready/collected orders per café.
- Customer cancel or café reject is allowed only **before the café accepts**: the entitlement
  is refunded, the ledger row voided, and the card refunded by the backend.
- Paid orders not accepted within **5 minutes** are auto-rejected and refunded. Staff get an
  SMS if a paid order is unseen for 2 minutes.
- Wallet top-up paths (`/api/payments/verify`, `jobs/reconcile-payments`) ignore payment
  rows that carry `cafe_order_id`, so a café payment can never also credit the wallet.

## Deploy

1. Apply `backend/sql/backend-cafe-orders.sql` (after `backend-package-venues.sql`).
   **Deploy the migration before the backend** — the package editor and payment guards
   reference the new columns.
2. Env: `CAFE_ORDERS_ENABLED=true` (also requires `PACKAGES_CHARGING_ENABLED=true` and a
   fresh package monitor heartbeat). Optional: `BEANZ_API_URL`, `BEANZ_API_KEY`.
3. Cron (with `x-job-secret`):
   - `POST /api/jobs/cafe-orders` every 1 min — settles unverified payments, auto-rejects,
     retries refunds, SMS fallback.
   - `POST /api/jobs/cafe-menus` every 30 min — Beanz menu sync.
4. Per café: package venue mode + verified connector (existing runbook) → add staff in
   Venue operations → create a package with `included_items = 1` → Admin › Cafés: menu,
   split, enable.

## Beanz

Menu sync only; orders never go to Beanz. `src/integrations/beanz.ts` is written against a
generic categories → items → modifier-groups shape because Beanz has not shared its API.
When it does, change only `mapItem()` / `extractItems()` and the fixture test. Sync never
overwrites Go Watt-owned fields (availability, package upcharge, order) and never deletes
items — removed items become unavailable.

## Verified / not verified

- ✅ `npm run test:packages`: café SQL against isolated PostgreSQL 18 — idempotent orders,
  server-side totals and option rules, single entitlement + balanced ledger on duplicate
  confirmation, duplicate/late payments flagged for refund, staff-only transitions, reject and
  auto-reject refunds, admin-only settlements, Beanz payload mapping.
- ✅ App and backend typecheck; Expo web export bundles all café screens.
- ❌ Not run against live Thawani. **Refunds** (`thawani.refundPayment`) follow Thawani's
  published API but are unverified; failures land in Admin › Cafés › Settlement for a manual
  dashboard refund.
- ❌ Not tested on a device or with real hardware. Staff code entry is typed; there is no
  camera scanner (expo-camera is not installed).
