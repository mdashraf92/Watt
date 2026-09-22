# Go Watt — Pivot Plan: From Charging Network to EV Marketplace

**Status:** Proposal — not yet approved
**Supersedes (in part):** `docs/planning/plan.md` (production launch plan, written for the charging-only product)
**Scope:** `WattApp/` (Expo app), `WattApp/backend/` (Node/Postgres API), and the marketing site

---

## 1. The change, in one paragraph

Go Watt stops being an app for *finding and paying for electricity* and becomes the
platform for *owning an EV in Oman*. The app sells the things EV owners actually need on
a repeating basis — accessories, cables and adapters, home chargers, maintenance, garage
work, installation — and takes the payment for all of it. The map stays, but it narrows:
it shows **only Go Watt branded locations**, and those locations do not sell electricity.
They sell a **bundle** in which charging is an included amenity: a coffee and an hour on
the charger, a gym membership that carries charging credit, a hotel night that ends with
a full battery.

Charging becomes the hook and the habit. The marketplace becomes the business.

---

## 2. Why this is a stronger position

Four arguments, in order of weight.

**The electricity margin was never the business.** This is already written into the
marketing site's own venue page — "the electricity margin alone is modest." A model whose
revenue is the spread on resold kWh competes with the grid tariff on one side and every
other charge point operator on the other. A marketplace earns on basket value and
commission, neither of which is capped by a utility tariff.

**Bundles likely avoid the electricity-resale question entirely.** Selling kWh to the
public is regulated supply. Selling a coffee, a gym month, or a hotel night that
*includes* charging as an amenity is selling hospitality, not power. This is a genuine
structural advantage — but it is a legal conclusion, not a technical one, and it must be
confirmed in writing before it is relied upon. See §10, Decision 1.

**Charging is occasional; ownership is continuous.** A driver charges mostly at home. A
charging-only app is opened rarely and deleted quietly. An owner needs a cable, a wall
mount, a tyre change, a service, a diagnostic, a warranty claim — continuously, for the
life of the car. That is a reason to keep the app installed.

**It is defensible in a way a charger network is not.** Anyone with capital can install
chargers. A trusted directory of vetted garages and suppliers, with payment, warranty and
dispute handling running through one account, compounds and is far harder to copy.

---

## 3. What Go Watt becomes — four surfaces, one account

| Surface | What it is | Revenue |
| --- | --- | --- |
| **Marketplace** | Accessories, cables, adapters, mounts, home chargers | Margin (first-party) + commission (third-party) |
| **Services** | Garages, maintenance, diagnostics, installation, mobile charging | Commission per job + booking fees |
| **Branded map** | Go Watt venues selling charge-inclusive bundles | Bundle sales + venue partnership terms |
| **Wallet & payments** | The rail under all three — Thawani, saved cards, credit | Float, and the reason all of the above is frictionless |

The wallet is the connective tissue, and it already exists. A driver who buys a gym bundle
holds charging credit; the same balance pays for a cable; the same card pays the garage.
One account, one payment history, one support channel.

Stores, shops and garages join as **display-only vendors**: they list their items, Go Watt
takes every payment. That uniformity is the product — one checkout, one receipt, one place
to complain — and it is also an obligation. See §10 Decision 2 for what Go Watt takes on,
and **§14 for the standard the catalog has to meet for any of this to feel professional.**

---

## 4. The single most important reframe: we stop selling kWh

Everything downstream follows from this. Today the data model prices energy —
`price_per_kwh` appears on `Station`, on `ChargerListing`, and on every session and
booking (`WattApp/src/types/index.ts`). Sessions bill by meter reading, with a wallet hold
against estimated consumption.

**That machinery does not get deleted. It changes job.**

| Concept | Today | After the pivot |
| --- | --- | --- |
| What the customer buys | kWh, at a per-kWh price | A package (bundle), at a fixed price |
| What the meter does | Determines the amount billed | Enforces the entitlement cap |
| Wallet hold | Reserves money against estimated kWh | Not needed — the package is paid up front |
| Overstay fee | Penalty on top of energy cost | Still applies — protects bay turnover |
| Session record | A billing document | A redemption record against an entitlement |

So: keep the metering, the Tuya device control, the session lifecycle, the overstay logic
and the reconciliation flags. Re-point them from *"how much do we charge this person"* to
*"has this person exhausted what they already bought."* That is a far smaller change than
a rebuild, and it is the highest-leverage piece of work in the whole plan.

**New objects this requires:**

- `packages` — what a venue sells. Name, price, what is included (charge minutes or a kWh
  cap), the partner benefit (coffee / gym month / room night), validity window.
- `entitlements` — what a user currently holds. Remaining minutes or kWh, expiry, source
  package, venue scope.
- `redemptions` — a use of an entitlement at a venue, linked to the charging session.

---

## 5. What already exists and carries over

This is the good news, and it is substantial. Verified against the codebase.

### Backend modules (`WattApp/backend/src/modules/`)

| Module | Disposition |
| --- | --- |
| `auth`, `profile` | **Keep.** Add vendor/garage roles (§6). |
| `payments` (Thawani, saved cards, charge, verify) | **Keep — this is the crown jewel.** Extend from session-payments to order-payments. |
| `wallet` | **Keep and expand.** Becomes the marketplace balance, not just charging credit. |
| `payouts` | **Keep and generalise.** Already handles bank/IBAN payout requests — repoint from hosts to vendors and garages. |
| `stations`, `chargers`, `sessions` | **Reframe.** Stations become branded venues; sessions become entitlement redemptions. |
| `bookings` | **Reframe.** Becomes package purchase + slot reservation, and is the template for service appointments. |
| `notifications` | **Keep.** New event types: order shipped, job complete, entitlement expiring. |
| `host` | **Decide.** Built for peer-to-peer charger sharing. Either retire it or repurpose it as the venue-partner portal. See §10, Decision 3. |
| `mobile` (vans, dispatch, live tracking) | **Keep.** Already a *service* rather than an energy sale — it is the model the rest of the services catalog should copy. |
| `admin`, `superadmin`, `reports`, `applications` | **Keep and extend** for orders, vendors and disputes. |
| `favorites`, `routing`, `jobs`, `devices`, `waitlist` | **Keep**, minor adjustment. |

### App screens (`WattApp/src/screens/`)

Of 29 customer screens plus 16 admin screens, roughly two thirds carry over with copy and
pricing changes rather than rewrites. `MapScreen`, `StationDetailsScreen`, `BookingScreen`,
`ChargingScreen`, `ActiveBookingScreen`, `SessionSummaryScreen`, `WalletScreen`,
`ProfileScreen`, `NotificationsScreen`, `FavoritesScreen`, `ReportIssueScreen` and the
whole `MobileCharge*` family all survive the pivot.

The integrations already in place — Thawani, Tuya, SMS, push, email — survive untouched.

**Blunt summary: the payment rail, the identity system, the admin console and the device
layer are done. What is missing is commerce.**

---

## 6. What must be built

### 6.1 Data model (new tables)

```
vendors              merchant accounts: CR number, bank details, commission rate, status
vendor_users         staff logins under a vendor

categories           catalog taxonomy (accessories / chargers / parts / service)
products             vendor_id, kind (physical|service), title ar/en, price, images,
                     vehicle compatibility, warranty terms
product_variants     size / connector type / colour, own SKU and stock
inventory            stock per variant per location

carts, cart_items    persistent basket
orders               user_id, totals, payment_ref, status machine
order_items          per-vendor line items (an order may span vendors)
shipments            fulfilment, courier, tracking
returns              RMA + warranty claims

services             garage/installation offerings: duration, at_centre|mobile, price basis
service_slots        capacity calendar per garage
appointments         booked job: vehicle, slot, status, technician notes

packages             venue bundle definitions (see §4)
entitlements         what a user holds
redemptions          a use of an entitlement, linked to a session

reviews              generalise the existing station reviews to products, vendors, garages
```

### 6.2 New backend modules

`catalog`, `cart`, `orders`, `fulfilment`, `vendors`, `services`, `appointments`,
`packages`. Each follows the existing `*.routes.ts` convention so the shape stays familiar.

### 6.3 New app screens

Shop home, category browse, search and filter, product detail, cart, checkout, order
confirmation, order tracking, order history, returns request, service catalog, garage
detail, appointment booking, appointment tracking, vehicle garage (saved cars — drives
compatibility filtering), and a vendor-facing portal (which may be web rather than app —
see §10, Decision 4).

### 6.4 Roles

`customer | host | investor | operator | admin | superadmin`
→ add `vendor`, `garage`, `venue_partner`. The role enum already lives on `Profile`
(`WattApp/src/types/index.ts`) and in the auth middleware, so this is a contained change.

---

## 7. The map, specifically

Today the map shows a mix: imported third-party stations (an EVO/Audi import shipped in
commit `bf1e3eb`) and peer-to-peer host listings.

**After the pivot the map shows Go Watt branded venues only.** A pin is a place where you
can buy a bundle. Tapping it shows the packages available there — not a price per kWh.

Two consequences worth deciding deliberately:

1. **The imported third-party stations must go, or be clearly demoted.** Showing
   competitor chargers we do not operate contradicts the new positioning and creates a
   support burden for hardware we cannot fix. The cleanest answer is to remove them from
   the customer map and keep the import as internal competitive data. A softer option — an
   "other chargers" layer, off by default, clearly labelled as not ours — is defensible if
   driver utility matters more than positioning purity. Decide once, in writing.
2. **`MapFilterSheet.tsx` and `SearchablePicker.tsx`** — the two uncommitted components
   currently in the working tree — were built to filter a large station set by connector
   type and power. Under a branded-only map with far fewer pins, the useful filters become
   *bundle type* (coffee / gym / hotel / retail), governorate, and availability. Do not
   discard that work; re-point its filter dimensions.

---

## 8. Phasing

Sequenced so that each phase ships something real and nothing stays half-migrated for long.

### Phase 0 — Decide and de-risk (1–2 weeks, no code)

- Answer every question in §10 in writing.
- Get the legal opinion on bundle-vs-supply (§2) before building pricing on the assumption.
- Turn the committed shops and garages into **signed vendor agreements**. Each must cover:
  commission, who ships, order response time, return and warranty handling, and the
  catalog content standard in §14. These terms are far harder to introduce after a vendor
  is live than before they onboard.
- Pick the launch cohort. Onboard 10–20 vendors properly rather than 100 badly — the first
  cohort sets the quality bar every later vendor is held to.
- Land or explicitly park the in-flight `thawani-sms-admin-fixes` work. Do not start the
  pivot on top of ~1,350 uncommitted lines.

**Exit:** signed-off model decisions; a clean main branch.

### Phase 1 — Narrow the map, reframe charging as packages (3–4 weeks)

Mostly refactor of code that already works, and it makes the new story true in-product
before any commerce exists.

- `packages` / `entitlements` / `redemptions` tables and module.
- Repoint sessions from per-kWh billing to entitlement enforcement (§4).
- Venue-only map; retire or demote imported stations; re-point the filter sheet.
- Rewrite pricing copy in `src/i18n/ar.ts` and `en.ts` — both languages, same commit.
- Admin: create and manage packages per venue.

**Exit:** a driver can buy a "coffee + 1 hour" package and redeem it at a Go Watt venue.
No kWh price is displayed anywhere in the app.

### Phase 2 — Vendors and catalog (5–6 weeks)

Supply is already committed, so this comes early. The goal of this phase is a catalog that
looks like it belongs to one company, not a classifieds board.

- `vendors` module: onboarding, CR verification, commission config, status.
- **Vendor portal (web)**: listings, images, stock, and later their orders and earnings.
- `catalog` module: Go Watt-owned category tree, structured vehicle compatibility.
- **Moderation queue — not optional.** Nothing reaches the customer app unreviewed. See §14.
- Customer side: shop home, category browse, search and filter, product detail.
- Content standards enforced in the portal itself, so bad listings cannot be submitted.

**Exit:** real vendors have loaded real inventory, every listing meets the §14 standard,
and a driver can browse it. Buying comes next.

### Phase 3 — Commerce (5–6 weeks)

Phases 2 and 3 are one release to the customer if the timing allows — run them as two
workstreams rather than two launches. There is little value in a catalog nobody can buy
from, beyond proving the content pipeline works.

- `cart`, `orders`, `fulfilment` modules.
- Checkout on the existing Thawani rail; wallet as an alternative tender.
- Multi-vendor order splitting — one basket, several shops, one payment.
- Order tracking, order history, returns and warranty requests.
- Per-vendor payouts on the existing `payouts` rail; commission applied at settlement.
- Admin: order operations, refunds, dispute handling.

**Exit:** a driver buys from two different shops in one basket, pays once, tracks both,
and each vendor is paid the right amount automatically.

### Phase 4 — Services and garages (4–5 weeks)

- `services`, `appointments` modules; garage partner accounts on the same vendor rail.
- Service catalog, garage detail, slot booking, job status, pay-in-app.
- Saved vehicles drive compatibility and service history.
- Reuse the `mobile` dispatch module's patterns — it already solves the "a job moves
  through states with a live customer watching" problem.

**Exit:** a driver books and pays for a service; the garage sees and completes the job.

### Phase 5 — Retire the legacy (2–3 weeks)

- Resolve the peer-to-peer `host` model (§10, Decision 3).
- Remove dead per-kWh billing paths, `price_per_kwh` columns, and unused host screens.
- Resolve the investor module's place in the new model.
- Update `docs/planning/plan.md` or replace it — a launch plan for a product that no
  longer exists is a liability.

**Total: roughly 19–24 weeks of sequenced work**, excluding Phase 0, at current team size —
less if Phases 2 and 3 genuinely run in parallel. This is a programme, not a sprint.
Phases 2 and 3 are what change the business.

A note on why Phase 1 still comes first even though the marketplace is the priority: the
app currently displays per-kWh prices, which under the new model is simply untrue. Leaving
a contradicted story live for five months while building the shop is worse than spending
three weeks correcting it. Phase 1 is also almost entirely refactor of code that already
works, so it is the cheapest phase in the plan.

---

## 9. What we retire, and when

| Thing | When | Note |
| --- | --- | --- |
| Per-kWh pricing UI | Phase 1 | Copy change in both locales |
| Imported third-party stations on the customer map | Phase 1 | Keep the data internally |
| Wallet holds against estimated kWh | Phase 1 | Packages are paid up front |
| Per-kWh billing code paths | Phase 5 | Only after packages are proven in production |
| Peer-to-peer host listings | Phase 5 | Pending Decision 3 |

Nothing is deleted in the phase where it is replaced. Delete a phase later, once the
replacement has carried real traffic.

---

## 10. Decisions needed before Phase 1

These are genuine forks. Each changes the data model or the legal footing, and guessing
wrong is expensive.

**Decision 1 — Is the bundle model legally clear of electricity-supply regulation in
Oman?** Everything in §4 rests on this. Needs a written opinion, not an assumption.

**Decision 2 — RESOLVED: third-party vendors from day one.** Stores, shops and garages are
already lined up to join. That removes the cold-start problem this plan was originally
sequenced around, so vendor onboarding moves onto the critical path rather than waiting
until Phase 4. Go Watt still sells chargers first-party alongside them.

The vendor's role is deliberately narrow: **vendors display their items; Go Watt takes the
payment.** Vendors do not run their own checkout, hold customer payment details, or set
payment terms. This is the right split — it is what makes the buying experience uniform
across hundreds of shops — but be clear about what Go Watt is taking on by choosing it:

| Go Watt owns | The vendor owns |
| --- | --- |
| Payment, refunds, chargebacks | Listing content and images (to Go Watt's spec) |
| The customer relationship and support | Stock truth |
| Pricing display accuracy | Having the item and handing it over |
| Returns, warranty mediation, disputes | Honouring the warranty behind the item |
| Catalog quality and moderation | Responding when an order comes in |

Go Watt becomes the merchant of record. Every complaint about a part a shop sold is now a
complaint about Go Watt. §14 is about earning the right to that position.

**Decision 3 — Does peer-to-peer host charging survive?** The `host` module,
`ChargerListing` and the host payout flow were built for drivers sharing home chargers —
the *old* B2C concept. Options: retire it, or repurpose the plumbing as the venue-partner
portal. Repurposing is cheaper than deleting and rebuilding.

**Decision 4 — Is the vendor portal a mobile app or a web console?** Now on the critical
path in Phase 2, not Phase 4. Merchants managing stock, images and orders want a keyboard
and a big screen. Recommendation: web, reusing the existing admin patterns. Bulk
spreadsheet upload matters more here than polish — see §14.3.

**Decision 5 — Who ships?** Vendors hold their own stock, so Go Watt avoids the working
capital question for third-party goods. What remains open is fulfilment: the vendor ships
directly, Go Watt collects and delivers, or a courier is contracted centrally. This
decides whether Go Watt can promise a consistent delivery experience or inherits a
different one from every shop — and customers will judge Go Watt for all of them, since
Go Watt took the payment. Decide before Phase 3 designs the order status machine.

**Decision 6 — Commission rate and payment terms for vendors and garages.** Must exist
before Phase 4 design, not after.

---

## 11. Risks, honestly

**The marketplace may be too thin in Oman.** The EV parc is small. Accessory basket value
is small. Do not assume marketplace GMV carries the company — it is plausible the *venue
bundles* remain the revenue and the marketplace is the retention mechanism. Model both
cases before committing capital to inventory.

**Catalog quality is now the top risk, and it replaces the cold-start risk.** With supply
committed, the danger is no longer an empty shop — it is a full one that looks cheap.
Hundreds of listings uploaded by hundreds of shops, each with its own photo style, its own
idea of a product title, and its own spelling, will make a well-built app feel like a
classifieds site. This is the single most likely way the marketplace fails while every
line of code works correctly. §14 exists for this reason.

**Vendor responsiveness.** A shop that lists and then takes three days to acknowledge an
order damages Go Watt, not the shop — because Go Watt took the money. Response-time
expectations belong in the vendor agreement signed in Phase 0, with a measurable
consequence, not in a support conversation after the first complaint.

**Scope explosion on a codebase with unfinished work.** The app has 45 screens, 21 backend
modules, and uncommitted work in flight right now. Commerce adds cart, orders, fulfilment,
returns, vendors and disputes — each with its own edge cases. The realistic risk is not
that the pivot is wrong; it is that it is attempted all at once and nothing reaches
production.

**Support and trust become the product.** The moment Go Watt takes payment for a third
party's part or a garage's labour, Go Watt owns the complaint. Warranty, returns and
dispute policy need to exist before the first third-party sale, not after the first
argument.

**Operational load on venues.** A "coffee + 1 hour" bundle requires the café to honour it.
That is staff training, POS reconciliation and a settlement process per venue — cost that
sits outside the app and is easy to omit from a technical plan.

---

## 12. Success metrics per phase

| Phase | The number that matters |
| --- | --- |
| 1 | Packages sold per week; redemption rate (bought vs actually used) |
| 2 | Listings passing moderation first time; vendors with a complete, live catalog |
| 3 | Orders per week; repeat purchase rate at 60 days; vendor order response time |
| 4 | Appointments completed; garage-side acceptance rate |
| All | Monthly active EV owners — the one metric a charging-only app could never grow |

**Listings passing moderation first time** is the leading indicator for Phase 2. If it is
low, the content standard is not reaching vendors and every later phase inherits a catalog
that has to be cleaned by hand.

Redemption rate in Phase 1 deserves particular attention. Bundles sold but never redeemed
look like revenue and are actually a broken promise that shows up later as churn.

---

## 13. Impact on the marketing site

The Go Watt marketing site (separate repo) currently tells the venue-owner and supplier
story, which **survives the pivot intact** — venues still host branded chargers, suppliers
still join a directory. Two things change:

- The driver-facing promise moves from "find a charger" to "everything your EV needs, plus
  charging where you already spend time." The waitlist copy needs rewriting.
- The supplier funnel becomes materially more valuable: a supplier registering is now a
  prospective *marketplace vendor* with a revenue path, not just a directory listing. That
  form should capture what they sell and whether they can fulfil orders.

That site enforces content rules via `scripts/check-content.mjs` — no unproven claims, no
invented figures. Those rules apply to marketplace copy too: no vendor counts, no catalog
size claims, no delivery-time promises until they are real.

---

## 14. The professional bar

The instruction is that the app must be as professional as possible. With third-party
vendors loading their own listings, that goal has an uncomfortable implication worth
stating directly:

> **The app's professionalism will be decided by other people's content, not by our code.**

A flawless React Native build filled with phone-camera photos on shop counters, titles in
ALL CAPS with emoji, and half the catalog in only one language will read as amateur. A
plainer app with a disciplined catalog will read as a real company. Engineering craft is
necessary and it is not sufficient. Both halves below are required.

### 14.1 Catalog standard — the half most companies skip

This is a published standard, attached to the vendor agreement in Phase 0, enforced by
validation in the vendor portal, and checked by a human before anything goes live.

**Images**
- Primary image: square (1:1), minimum 1200×1200, plain white or neutral background.
- Product fills 80–85% of the frame, in focus, evenly lit, shot straight on.
- No watermarks, no vendor logos, no price stickers, no text overlays, no collages, no
  borders, no screenshots of other listings.
- Additional images: up to 6, may show detail, scale and what is in the box.
- **If a vendor cannot meet this, Go Watt shoots the product.** Budget for a simple
  lightbox and a half-day per cohort. This is cheaper than a catalog that looks cheap, and
  it is the single highest-return non-engineering investment in the whole programme.

**Titles and copy**
- Format: `Brand — Product — key specification`. No ALL CAPS, no emoji, no promotional
  language in the title, no vendor name stuffed in.
- Description is structured fields first, prose second. Nobody reads a paragraph to find a
  cable length.

**Bilingual parity — non-negotiable**
- Every listing exists in both Arabic and English before it publishes. A half-translated
  catalog is the fastest way to look unfinished.
- If a vendor supplies one language, Go Watt translates before publish. Machine
  translation may draft, but a human approves — a mistranslated amperage, connector type
  or torque figure is a safety problem, not a copy problem.
- Latin brand names inside Arabic titles need explicit bidirectional isolation. The
  marketing site already solved exactly this with its `BrandName` / `CopyText` components;
  the app needs the same treatment rather than discovering the bug in production.

**Structured data, not prose**
- Connector type, power rating, cable length, amperage, vehicle compatibility and warranty
  period are enumerated fields the vendor picks from — never free text. Free text cannot
  be filtered, compared, or trusted, and it is what turns a catalog into a junk drawer.
- Go Watt owns the category tree. Vendors choose from it; they do not extend it.

**Price and stock truth**
- An in-stock item that turns out not to exist is worse than never listing it, because the
  customer has already paid Go Watt.
- Listings untouched for a set period are auto-hidden pending vendor confirmation.
- Repeated out-of-stock is a vendor quality metric with a consequence, not an annoyance.

### 14.2 App craft — the half that is ours

**One app, not two.** The largest visual risk in this pivot is that the shop feels like a
different product bolted onto the charging app. One component library, one type scale, one
spacing system, one set of buttons across charging, shop and services. If the shop needs a
new component, it goes into the shared library.

**Every state is designed, not defaulted.** Empty, loading, error, offline, partial,
end-of-list. Skeletons that match the real layout, never a centred spinner on a blank
screen. An empty cart and a zero-result search are design work, not fallbacks.

**Performance budget, enforced.**
- Vendor images are never served to the device as uploaded — resize and convert server
  side, deliver through a CDN, ship WebP with a JPEG fallback.
- Catalog lists virtualize from day one. A shop that stutters reads as broken regardless
  of how it looks.
- Set numeric targets (cold start, time to first catalog paint, search response) in
  Phase 2 and hold them; performance defended late is performance lost.

**Arabic is primary, not mirrored.** RTL layout, Arabic-Indic vs Latin numeral policy
decided once and applied everywhere, currency formatting (OMR carries three decimals —
getting this wrong looks unserious immediately), correct directional icons, and typography
that respects both Tajawal and Montserrat rather than forcing one metric onto the other.
Both are already in the project.

**The trust surface.** Before purchase, a customer can see: who the vendor is, the return
window, the warranty terms, who fulfils, and a realistic delivery expectation. Never
display a delivery promise the operation cannot keep — one missed date costs more trust
than ten accurate slow ones.

**Accessibility as a floor.** Tap targets, contrast, dynamic type, screen-reader labels on
icon-only controls. This is also the cheapest quality signal available, and it is far
cheaper before 40 new screens exist than after.

### 14.3 The vendor portal counts too

Vendors are users. A portal that is painful to use produces bad listings — not because
vendors are careless, but because the tool made the correct path expensive. Bulk upload
via spreadsheet, inline image validation with immediate feedback, clear rejection reasons,
and a visible listing status. A good portal is how the §14.1 standard actually gets met.

---

## Appendix — File-level impact map

| Area | Files |
| --- | --- |
| Pricing model | `WattApp/src/types/index.ts` (`price_per_kwh` on `Station`, `ChargerListing`, `ChargingSession`) |
| Session billing | `backend/src/modules/sessions/`, `backend/sql/backend-billing-overrun-fix.sql`, `backend-overstay-and-refund.sql` |
| Map | `WattApp/src/screens/MapScreen.tsx`, `src/components/MapFilterSheet.tsx` *(uncommitted)*, `src/lib/listingToStation.ts` |
| Booking → packages | `WattApp/src/screens/BookingScreen.tsx`, `backend/src/modules/bookings/bookings.routes.ts` |
| Payments (extend, don't replace) | `backend/src/modules/payments/`, `backend/src/integrations/thawani.ts`, `src/lib/cardPay.ts` |
| Payouts (generalise to vendors) | `backend/src/modules/payouts/`, `src/screens/admin/AdminPayoutsScreen.tsx` |
| Roles | `WattApp/src/types/index.ts` (`Profile.role`), auth middleware |
| Copy | `WattApp/src/i18n/ar.ts`, `WattApp/src/i18n/en.ts` — always in the same commit |

---

**A note for whoever implements this:** `AGENTS.md` at the app root requires reading the
exact Expo v56 docs (https://docs.expo.dev/versions/v56.0.0/) before writing app code.
That applies to every phase here.
