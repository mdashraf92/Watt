# Manual regression — Mobile Charging & Trip Planner

There is no automated test suite in either project (see `LAUNCH_STATUS_2026-08.md` §6),
so this is the checklist. Run it **verbatim** on each build, in **both English and
Arabic**, checking RTL layout on every new screen.

Backend logic below the UI has already been verified directly against the database and
over HTTP during development: the money path (hold → settle → ledger), both cancellation
paths, no-van expiry, double-complete idempotency, driver kWh over-claim capping, the
planner's state-of-charge walk across six scenarios, corridor projection, trip-save
atomicity, and the book-in-order rule. What remains untested is **the app on a real
device**, which is what this document covers.

## Setup

Local stack: Dockerised `postgres:15` on **55432**, backend on **8090**, Expo on
**8082**, app pointed at the LAN IP.

```bash
psql "$DATABASE_URL" -f backend/sql/backend-mobile-charging.sql
psql "$DATABASE_URL" -f backend/sql/backend-trips.sql
```

You need **two devices** (or a device plus a simulator): one signed in as a customer,
one as an operator. Then:

1. Promote a test account: `update profiles set role='operator' where id='…';`
2. Sign in as an admin → Profile → **Fleet** → add a van, assign that driver.
3. Give the customer a wallet balance and a complete car profile (make, model,
   **battery size** — the trip planner refuses to guess it).

---

## A. Mobile charging — the money path (do this one first)

| # | Step | Expect |
|---|---|---|
| A1 | Customer: Map → the gold roadside button → place the pin, pick kWh | Price breakdown shows callout fee + energy + total, and the hold amount |
| A2 | Confirm with **enough** balance | Lands on the tracking screen; wallet `held_balance` rises by the hold |
| A3 | Driver: go on duty | Offer appears within a second or two, with a live countdown |
| A4 | Driver: Accept | Customer's screen flips to "Driver assigned" and shows name, van, plate, call button |
| A5 | Driver: Start driving → I have arrived → Start charging | Customer's timeline advances at each step; a push arrives each time |
| A6 | Driver: enter kWh, finish and bill | Customer lands on the receipt |
| A7 | Check the wallet | `held_balance` back to its prior value; `wallet_balance` down by exactly `callout + kwh × price`; **one** matching row in Wallet history |
| A8 | Rate the driver, share the receipt | Rating sticks; share sheet opens |

**A9 — shortfall.** Set the wallet 0.5 OMR short and request again.
With a saved card: the card is charged and the request goes through without leaving the
screen. Without one: the same top-up prompt a station session shows.

## B. Mobile charging — the paths that go wrong

| # | Step | Expect |
|---|---|---|
| B1 | Cancel while still "Finding a van" | No fee; hold released in full |
| B2 | Cancel after the driver is en route | Fee warning names the amount; fee charged, remainder released, van freed |
| B3 | Try to cancel once charging has started | Refused — "Charging has already started" |
| B4 | All vans off duty, then request | Refused up front: "No van covers this location" |
| B5 | Request, then take every van off duty and wait out `mobile_request_expiry_min` | Status → "No van available"; hold released; customer notified |
| B6 | Driver declines the offer | Re-offered to the next-nearest van; the decliner is not asked again |
| B7 | Request a second callout while one is live | Refused — one live job per customer |
| B8 | **Privacy check.** Sign a *third*, unrelated account in while a job is running | That account receives **no** van-location updates. This is the one that must not regress. |
| B9 | Driver tries to go off duty mid-job | Refused — finish the job first |
| B10 | Admin → Mobile charges → cancel on the customer's behalf | Cancelled with **no** fee |

## C. Operator app

| # | Step | Expect |
|---|---|---|
| C1 | Sign in as an operator with **no** van assigned | "No van assigned" explainer, no job UI |
| C2 | Let an offer's countdown run out | Offer disappears; job returns to the pool |
| C3 | Try to bill more kWh than were ordered | Capped at the ordered amount — check the customer is billed for the lower figure |
| C4 | Enter a meter reading that disagrees with delivered kWh by >25 % | Job completes normally but is flagged for admin review |
| C5 | Kill and reopen the app mid-job | Current job is restored |
| C6 | Confirm the driver's Profile tab | No customer-only rows (no mobile charging, no trips, no investor banner) |

## D. Trip planner

Requires `OSRM_URL`. Without it the plan button returns "not available yet" — that is
correct behaviour, not a bug.

| # | Step | Expect |
|---|---|---|
| D1 | Profile → Plan a trip, with **no** battery size on the profile | Prompt to complete the car profile; planning is blocked |
| D2 | Muscat → Salalah, 40 kWh car at 80 % | Multi-stop plan; each stop shows arrive % → leave %, kWh, minutes, cost |
| D3 | Same trip, 20 kWh car at 30 % | **Infeasible**, naming where the gap starts, how far is needed, how far is reachable |
| D4 | A short hop well inside range | "No charging stops needed" plus the arrival state of charge |
| D5 | Save the trip → My trips | Appears with distance, stop count, total cost |
| D6 | Open it and try to book the **second** stop first | Refused — stops are booked in order |
| D7 | Book the **first** stop | Booking flow opens; on completion the stop shows "Booked" and appears in Bookings |
| D8 | Mark stops done through to the last one | Trip status becomes "Completed" |
| D9 | Delete a trip | Removed from the list; any booking already made stays booked |

## E. Everything else still works

The new work touches shared surfaces. Re-check:

- **Profile screen** — the two Coming Soon teasers are gone, replaced by real Services
  entries. Nothing else on the screen shifted or broke.
- **Map screen** — the roadside button sits below the locate button and does not cover
  the station cards; a live callout shows a dot on it and reopens tracking.
- **Admin analytics** — station revenue figures are **unchanged**; mobile charging
  appears as its own block.
- **Admin live map** — vans and waiting callouts appear as extra pins without disturbing
  station pins.
- **A normal station booking → charge → bill** — the shared wallet/hold code was
  extended, so run one end to end.
