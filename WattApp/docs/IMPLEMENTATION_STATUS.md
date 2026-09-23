# Marketplace implementation

Updated: 23 September 2026

## Built in the first implementation slice

- Venue details → Packages: bilingual offer cards, included benefit, charging allowance,
  validity, three-decimal OMR price, confirmation and loading/error/empty states.
- Wallet → My packages: purchase history, venue, expiry, remaining allowance,
  active redemption QR/code and terminal statuses. Charging allowance is not wallet money.
- Customer and investor navigation both register the new screens.
- Persistent purchase request keys survive lost responses and app restarts. The server
  serializes retries by buyer, debits once and rejects changed prices before payment.
- Purchase descriptions and partner benefits are snapshotted. Existing entitlement
  descriptions are backfilled once from the current offer; historical wording cannot
  be reconstructed if offers were already edited.
- Available funds exclude holds reserved for charging sessions.
- Arbitrary consumption is disabled, including the legacy SQL function. Package charging
  uses server-read cumulative meter deltas and a dedicated device control path.

## Built in the redemption slice

- My packages now opens a dedicated charging screen with connector selection, start,
  live server readings, stop, error recovery and restoration from the active-session banner.
- Server-owned start/active/stopping/completed states persist before device commands.
  A failed OFF keeps the charger reserved until OFF is confirmed; the monitor retries.
- Explicit connector/device mapping, switch code, meter code and scale replace guesses
  about device units. Start requires a recent successful monitor heartbeat.
- Package sessions take no wallet hold or additional energy payment. A database trigger
  rejects old finalizers and customer progress updates on these sessions.
- The monitor stops at the first reached time, expiry or energy limit. Actual energy is
  recorded even if polling overshoots the allowance; only the remaining allowance is
  consumed and no excess is billed. Meter resets flag the package and block reuse.
- Venue staff can look up a code and confirm delivery of its benefit. Membership is
  scoped to a venue, benefits record the staff member/time, and retries are idempotent.
  A coffee remains redeemable after charging is exhausted, until package expiry.
- Full refunds are transactionally blocked after benefit redemption or a charging start.
  Administrator stop uses the device path and explicitly reports that any package refund
  still requires review; it does not silently refund a partly used package.

## Administrator package editor

- Admin Profile now opens **Manage venue packages**. Administrators can create and
  edit bilingual offers, choose a venue, set the fixed OMR price, charging allowances,
  validity and display order, and pause or enable sales.
- New offers start with sales paused. Sold entitlements retain their original terms.
- The backend rejects blank required text, excess price precision and missing caps.
  Edits lock the offer and compare its version to prevent concurrent overwrites.
- A failed save keeps the form visible and requires closing and refreshing before
  resubmission, including when a network failure leaves the save outcome uncertain.
- Venue operations now supports exact-phone staff lookup and assignment/removal,
  connector/device mapping, and a view of active and meter-flagged package sessions.
  Configuration changes are rejected while a connector has an active session.
- Administrators explicitly designate package venues. Conversion is blocked while
  active sessions or pending/confirmed bookings exist. The migration guards legacy
  booking and session inserts, including starts identified only by connector.
- Package venues display package actions instead of per-kWh booking on the map and
  detail page. A package-venue map filter is available; existing stations are retained.
- Review flags remain blocked until a separate reconciliation process is implemented;
  this screen does not silently clear meter flags or issue partial refunds.

## Local verification

- App and backend TypeScript checks passed.
- Expo web production export passed for the package editor. Android production export
  passed with the venue operations screen, resolving the missing-module bundling error.
- `cd backend; npm run test:packages`: twenty-five integration scenarios passed against an
  isolated PostgreSQL 18 cluster, including concurrent retries, held funds, price changes,
  snapshot stability, changed benefit terms, deactivated-offer retries and rejected requests without debit.
  Redemption tests cover device command failures, meter resets, expiry, energy caps,
  staff authorization, refund rollback, concurrent starts and the existing billing
  function (blocked for package sessions; still working for ordinary sessions).
  Admin route tests cover access control, paused creation, price/text validation,
  concurrent edits, cap removal, explicit publishing, venue staff access, device
  configuration, conversion blockers and rejection of legacy starts at package venues.
  Hardware is a deterministic fake; the SQL and service execute against real PostgreSQL.
- The test harness creates its own temporary cluster, never loads `.env`, and never
  connects to the configured application database. Set `PG_BIN` if PostgreSQL binaries
  are installed elsewhere.
- Native device interaction and real hardware redemption have not been tested.

## Migration and rollout

Apply in this order to a development database:

1. `backend/sql/backend-packages.sql`
2. `backend/sql/backend-package-purchase-safety.sql`
3. `backend/sql/backend-package-redemption.sql`
4. `backend/sql/backend-package-venues.sql`

Deploy the matching backend and app together. The legacy one-argument purchase function
is deliberately disabled so older clients cannot bypass retry protection.

All three flags default to `false`: `PACKAGES_PURCHASE_ENABLED`,
`PACKAGES_CHARGING_ENABLED`, `PACKAGES_MONITOR_ENABLED`. Run the monitor before enabling
charging, and configure a verified venue connector before enabling purchases. The purchase
endpoint also requires charging enabled, a configured venue device and a fresh heartbeat.
See [PACKAGE_CHARGING_RUNBOOK.md](PACKAGE_CHARGING_RUNBOOK.md) for setup and limits.
No production migration or setting was changed.

## Remaining Phase 1 work

- Commission and test the actual device mapping, meter scale, switch feedback and
  hardware-local safety cutoff. Cloud polling cannot guarantee a hard cutoff during
  network/server outages. Keep production purchases off until this is verified.
- Test the native screens on device, including app restart and loss of connectivity.
- Complete the audited reconciliation workflow for meter flags and allowance corrections.
- Configure verified venues, staff and devices through Venue operations after migration.
- Finalize commercial cancellation, overstay and partial-refund policies. Current
  package sessions never charge excess energy; full refunds after any start/benefit use
  are refused pending review. Expiry is a stop deadline, not an additional charge.

## Marketplace work after packages

Saved vehicles with verified/unknown compatibility; vendor membership and permissions;
catalog moderation; products and variants; stock reservation; multi-vendor checkout;
fulfilment; refunds and settlement. Services need a separate quotation/appointment flow.
Delivery versus collection remains a product decision, not an assumption in the schema.

Payment-provider support and commercial roles must be confirmed before marketplace
settlement is enabled. Taking payment alone is not sufficient to establish the merchant
of record. Wallet money, promotional credit and charging allowances remain distinct.

The broader marketplace plan is not complete; this file records the implemented slice
and the dependencies for the next one.
