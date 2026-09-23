# Package charging setup and verification

This is a development rollout guide. No production settings or hardware were changed
by the implementation. SQL/service tests use an isolated PostgreSQL cluster and fake
hardware, not a live charger.

## Database and backend

Apply these migrations in order with the existing application schema present:

1. `backend/sql/backend-packages.sql`
2. `backend/sql/backend-package-purchase-safety.sql`
3. `backend/sql/backend-package-redemption.sql`

Deploy the matching app and backend. The new routes depend on these columns/tables,
including session recovery. Use the database owner or the established `service_role`
backend connection. New control functions are not executable by PUBLIC.

The following flags default to false:

```dotenv
PACKAGES_MONITOR_ENABLED=false
PACKAGES_CHARGING_ENABLED=false
PACKAGES_PURCHASE_ENABLED=false
```

The monitor runs every 10 seconds while enabled, prevents overlapping ticks within
one process, and uses connector advisory locks across processes. The authenticated
job endpoint `POST /api/jobs/package-charging` (existing `x-job-secret` header) can
also run a tick. Never expose the job secret to the mobile app.

Start requires a successful monitor heartbeat in the last 90 seconds. A failed
charger poll invalidates the heartbeat and prevents new starts/purchases. Stops
remain available even if new charging starts are disabled.

## Configure a development charger

Use administrator authentication for `PUT /api/admin/packages/devices`:

```json
{
  "connector_id": "<existing venue connector UUID>",
  "device_id": "<verified device ID>",
  "switch_code": "<verified boolean switch code>",
  "energy_code": "<verified cumulative energy code>",
  "energy_scale": 0.001,
  "enabled": false
}
```

The scale above is an example, not a universal Tuya unit. Confirm cumulative energy
and scaling on the actual model. Package charging does not use the older heuristic
meter reader. One physical device may be mapped to only one package connector and
must not also be controlled through a private charger listing.

Verify the mapping with a controlled test before setting enabled=true. Device
configuration changes are rejected while a session on that connector is active.
Enable the monitor first, then charging in development. Only enable purchases after
start/stop and benefit redemption work end to end. Purchase additionally checks
that its venue has a mapped, enabled connector and a fresh monitor heartbeat.

## Staff access and benefits

Assign existing user accounts with administrator authentication:

`PUT /api/admin/packages/staff`

```json
{
  "station_id": "<venue UUID>",
  "user_id": "<staff profile UUID>",
  "enabled": true
}
```

Set enabled=false to revoke membership. This does not grant general admin access.
Staff enter through Wallet → My packages → Venue staff, paste the customer's code,
check the venue benefit, and confirm delivery. The customer retains separate
charging allowance. The same benefit cannot be redeemed twice. Expired/refunded
packages are rejected, while an unused benefit can still be redeemed after charging
is exhausted, until expiry.

Customer routes:

| Route | Purpose |
| --- | --- |
| `GET /api/packages/entitlements/:id/charging` | Own package's connectors and latest run |
| `POST /api/packages/entitlements/:id/start` | Body: `connector_id`, persistent `start_key` |
| `POST /api/packages/charging/:id/stop` | Stop own run; no client meter reading accepted |
| `GET /api/packages/staff/venues` | Assigned venues |
| `POST /api/packages/staff/lookup` | Body: `code`; results restricted to assigned venues |
| `POST /api/packages/staff/entitlements/:id/benefit` | Record delivery with actor/time |

## Failure handling and limits

- Starting/active/stopping/completed is persisted separately from legacy sessions.
  After an uncertain start, the server attempts OFF; it never blindly repeats ON.
- A stop command must be acknowledged and OFF confirmed before completing a run.
  Failure leaves it stopping and reserves its connector/entitlement for retry.
- The server records cumulative-meter deltas, not client-supplied consumption.
  Reset/missing/invalid readings cause stop/review handling. Flagged packages cannot
  start another session until operations reconcile them. No automatic allowance
  correction or approval UI is provided yet.
- Time/minute allowance and package expiry become the run deadline. The first
  reached time or energy cap initiates stop. Minutes round up per use.
- Cloud polling is not an instantaneous hardware cutoff. Poll cadence, command
  latency and outages can cause overshoot. Actual measured energy stays recorded,
  allowance deduction is capped, and the package session charges zero extra money.
  Verify a hardware-local time/energy safety cutoff before real deployment; this
  integration does not configure one and cannot guarantee shutdown while offline.
- Do not disable/stop the monitor while active package sessions exist. Complete
  them first and monitor pending stops. Review logged `retry_required` sessions.
- Starting a package is an immediate walk-up flow, not a future bay reservation.
  Coexistence with scheduled bookings at the same venue still needs commissioning
  and a defined reservation policy before opening that venue commercially.
- Old progress/finalization calls cannot mutate/bill package sessions. Current
  customer/admin stop routes redirect to the package device controller.
- Full refunds after any charging start or benefit delivery are refused. Admin
  stop/refund mode stops the hardware but explicitly requests a refund review;
  it does not return the package price automatically.

## Required real-device acceptance checks

Verify start, normal stop, time/energy/expiry stop, app restart, two simultaneous
starts, lost ON acknowledgement, failed OFF, meter reset, server restart and network
loss. Check the physical switch, cumulative meter, wallet ledger, allowance and
benefit history together. Run the app in both Arabic and English.

Local regression command: `cd backend` then `npm run test:packages`.
It starts and cleans its own test database. It does not load application `.env`
or operate hardware.


## Venue operations screen

Apply `backend/sql/backend-package-venues.sql` after the redemption migration before
using the updated backend. No existing venue is automatically marked as a package venue.
Open Admin Profile > Manage venue packages > Venue operations. Select a venue to:

- Set its package-venue mode after resolving pending bookings and active sessions.
- Find staff by their exact registered phone number, then grant or remove venue access.
- Configure each connector's device ID, switch code, cumulative energy code and kWh
  multiplier. Keep charging disabled until the actual hardware has been commissioned.
- Inspect active and flagged runs; open active session controls to stop a running session.

Saving configuration does not test or switch hardware. Flags are read-only in this screen;
reconciliation and partial refunds remain pending. The customer map offers a package-only
filter and package venues open offers instead of creating metered bookings. Database
triggers reject legacy metered booking/session inserts at designated package venues.
