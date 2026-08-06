# GO WATT — Phase 2

**Written:** 6 August 2026
**Covers:** Part A, the integration work of 2–6 August and its open items. Part B, the
Automatic Investor Settlement work that ROADMAP.md calls Phase 2.

Read Part A as the current state of the system. Read Part B as the next build.

---

# Part A — Where we are

## A1. What now works, verified end to end

| Area | State | How it was verified |
|---|---|---|
| **Thawani payments** | Working on **live production keys** | `POST /api/payments/create` returned a real `checkout_…` session and a working `pay_url` |
| **Saved cards** | Tables created, endpoints reachable | `GET /api/payments/methods` returns `{method, cards, available:true}` |
| **Phone OTP over real SMS** | Working | Real SMS delivered to `+968 92421050`; provider returned code `1` |
| **Superadmin application review** | Fixed | Accept / Reject / On-Review all succeed as superadmin; a `customer` is still refused |
| **Website brand alignment** | Done | Rendered headless at 1440px in both RTL and LTR |
| **Local stack** | Runs | Postgres 55432, backend 8090, Metro 8081 |

## A2. Verified configuration

Values that are known-good. Secrets live only in `WattApp/backend/.env`, which is
gitignored — never put real values in `.env.example`, which is committed to a **public**
repository.

| Service | Key | Value |
|---|---|---|
| Thawani | `THAWANI_BASE_URL` | `https://checkout.thawani.om` (**production**) |
| Thawani | keys | Production only. The UAT host rejects them with 401 — there are no UAT keys for this account |
| iSmartSMS | `ISMARTSMS_USER_ID` | `ashrafweb` |
| iSmartSMS | `ISMARTSMS_HEADER` | `Go-Watt` — capital W, as registered. `Go-watt` is wrong |
| iSmartSMS | `ISMARTSMS_URL` | `…/HttpWS/SMSDynamicAPI.aspx` — the working endpoint. Their PDF documents `SMSDynamicRefIntlAPI.aspx`; still unconfirmed which is official |
| iSmartSMS | number format | Digits only, country code, no `+`. `98568885` → `96898568885` |
| Backend | `PUBLIC_URL` | Must be a public HTTPS host. Thawani rejects custom schemes and needs to reach `/pay/success` |
| App | `EXPO_PUBLIC_API_URL` | The PC's current LAN IP, port 8090 |

**Infocomm outbound IP:** `96.9.129.63` (`static-host-96-9-129-63.awasr.om`, Awasr
AS204170). Traceroute to their `206.167.33.29` completes in 7 hops. This is the **dev**
machine — the production server IP must be whitelisted separately before launch.

## A3. Bugs found and fixed

**Superadmin could not action investor applications.** `accept_investor_application`,
`reject_investor_application` and `set_application_under_review` each guarded on
`role = 'admin'` *exactly*, while `is_admin()` and the API's `requireAdmin` both accept
admin **or** superadmin. The request passed Express and died in Postgres with a bare
"Unauthorized", which looked like a login problem. All three now call `is_admin()`, so
there is one definition of admin instead of three that can drift.
→ `backend/sql/backend-superadmin-application-actions.sql`

**Payment screen crashed with `relation "public.payment_customers" does not exist`.** The
saved-cards migration had been written months earlier and never run.
→ `backend/sql/backend-saved-cards.sql`

**Website was on a palette that is not the brand.** Generic Tailwind greens and Inter.
Moved onto the four colours the brand deck specifies. The `rgba()` values carried the old
palette independently of the hex literals — 71 instances — so a hex-only migration would
have left every glow and border on the old green.

**Hero scrim ignored reading direction.** The copy column swaps sides between Arabic and
English; the scrim did not, so the Arabic headline sat on the bright amber lobe. Both the
mesh lobes and the scrim now follow `dir`.

**`referenceIds` was never sent to iSmartSMS.** The `SMSDynamicRef*` endpoints reject a
request without it with code 15. Harmless on the plain endpoints, so it is now always sent.

## A4. Diagnostic lessons — the expensive ones

These each cost real time. They are written down so they cost nothing next time.

**iSmartSMS return codes do not mean what they say.** The same credentials returned `3`
(user/password wrong), `7` (account inactive), `9` (invalid mobile) and `12` (account
blocked) depending only on which endpoint was called and what `MobileNo` was sent — the
endpoints validate fields in a different order. A code naming one cause can be reporting
another.

Two consequences:

- An early conclusion that the *endpoint* was the fix was **wrong**. It was the password.
  The endpoint question is still genuinely open.
- Repeated probing **got the account blocked** (code 12). Probe sparingly. To test auth
  for free, send `MobileNo=1`: it is rejected before dispatch, so no credit is spent, and
  code `9` means auth passed.

The decisive test is not in the code at all: **send from the web portal.** If the portal
sends and the API refuses, it is an API-permission problem at Infocomm and nothing in
this repo will fix it.

**A failed restart looks identical to a broken fix.** `.env` was changed, the backend
"restarted", and the behaviour did not change — because the old process never released
port 8090, the new one died with `EADDRINUSE`, and every subsequent test hit the stale
process. Hours went into debugging Thawani against configuration that was never loaded.

Always confirm the port actually freed:

```powershell
Get-NetTCPConnection -LocalPort 8090 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**`ts-node-dev` watches source files, not `.env`.** Any credential or URL change needs a
full process restart, and `Ctrl+C` does not always kill the child.

**`EXPO_PUBLIC_*` is baked into the bundle at build time.** Changing the API URL requires
`npx expo start -c`; a plain reload keeps the old value.

**The LAN IP changed six times in four days.** Every change breaks the app with
`java.net.NoRouteToHostException`, which reads like a code fault. First check on any
"host unreachable": compare `ipconfig` against `WattApp/.env`. A **static DHCP
reservation** on the router ends this permanently; `expo start --tunnel` also works.

## A5. Money and credits — current state

**Thawani is on live keys. Every top-up spends real money.** Test at the 0.100 OMR
minimum and refund from their dashboard. There are no UAT keys for this account.

**SMS credits: 4 used, 6 remaining.** Three verification sends to Infocomm plus one OTP.
The OTP flow allows 5 sends per number per 15 minutes, so a few retries drain the balance
fast. Note that one of those four was an accidental send: a recipient-format guard was
written as "8 to 15 digits", and an Omani local number is 8 digits, so it let through the
exact case it existed to catch. The check now requires 10+.

**The iSmartSMS account expires 13 August 2026** — one week out. Renewal is unresolved.

## A6. Open items

| # | Item | Owner | Blocked on |
|---|---|---|---|
| 1 | Run both SQL files against **production** Postgres | Ashraf | Nothing. Both bugs return on the server otherwise |
| 2 | Renew the iSmartSMS account before **13 Aug** | Infocomm | Their renewal details |
| 3 | Confirm the official SMS endpoint | Infocomm | Their answer. `env.ts` comment is marked unverified |
| 4 | Whitelist the **production** server IP | Infocomm | Server being deployed |
| 5 | Static DHCP reservation for the dev PC | Ashraf | Nothing. 2 minutes on the router |
| 6 | Decide `host_commission_rate` — see A7 | Ashraf | A business decision |
| 7 | Arabic webfont licence, or keep the substitute | Ashraf | Budget. See A8 |
| 8 | Normalise the brand name spelling | Ashraf | Pick one: `GoWatt`, `Go Watt`, `Gowatt` |
| 9 | Merge `thawani-sms-admin-fixes` into `main` | Ashraf | Review |
| 10 | Change the iSmartSMS portal password | Ashraf | It was shared over chat |
| 11 | Harden the hero against a GSAP CDN failure | Dev | `.gsap-hidden` leaves the hero invisible if the CDN fails |

## A7. ⚠️ `host_commission_rate` is `0` — GO WATT currently earns nothing

`app_config.host_commission_rate = 0`, and `credit_host_earning` computes:

```sql
v_net := round(p_gross * (1 - v_rate), 3);
```

With a rate of `0`, `v_net` equals the full gross, so **the host receives 100% of every
charging session and the platform takes no commission.** Sessions bill correctly and
money reaches the host; the platform's share is simply zero.

If that is a deliberate launch incentive, fine — but it must be a decision, not an
oversight. The roadmap assumes 20%. Change it with no deploy:

```sql
update public.app_config set value = '0.20' where key = 'host_commission_rate';
```

## A8. Website — the one unresolved design constraint

The brand deck specifies **Helvetica Neue LT Arabic**, a licensed Monotype family with no
free webfont. It cannot be served from a public site without a web licence. **IBM Plex
Sans Arabic** stands in — same neo-grotesque skeleton, real 300–700 range. Swapping to the
licensed family later changes only the font link in `index.html`.

Two further deviations, both deliberate:

- The deck says *"Montserrat **Bold** for paragraphs"*. Taken literally every paragraph
  sets at 700, which is hard to read and leaves nothing for emphasis — and the deck's own
  body copy is regular weight. Body is 400, emphasis 700.
- The deck says Light for titles, but its own slides use bold display type. Strong weights
  were kept.

Arabic is not mirrored Latin. It gets: tracking reset to zero (negative tracking collapses
joined letterforms), looser leading for diacritics, `uppercase` neutralised, display
weight capped at 700 because IBM Plex Sans Arabic has no 800/900 and the browser would
smear a synthetic bold across the joins, and Montserrat first in the stack so Latin runs
inside Arabic — the wordmark, `24/7`, `OMR` — use the brand's Latin face.

---

# Part B — Automatic Investor Settlement

## B1. What the roadmap asked for

From `ROADMAP.md` Phase 2, "remove the manual payout-request/approval flow completely":

1. On session completion, commission to GO WATT and the host share credited to the
   investor **instantly**, with no admin action.
2. Investor withdraws on their own schedule. The admin page becomes a **read-only
   settlement report** rather than an approval queue.
3. Commission percentage lives in a settings table, changeable by superadmin without a
   deploy.

## B2. Most of this is already built

This is the important finding. The roadmap describes it as unstarted; the database
disagrees.

| Roadmap item | Status | Evidence |
|---|---|---|
| Instant automatic host credit | **Done** | `credit_host_earning()` is called from `_finalize_charging_session()` — verified |
| Idempotent on retries | **Done** | Returns early if a `wallet_transactions` row of type `earning` already exists for the session |
| Commission in a settings table | **Done** | Reads `app_config.host_commission_rate`; `sa_get_settings` / `sa_set_setting` expose it to superadmin |
| Rate clamped to sane bounds | **Done** | `least(greatest(rate,0),1)` |
| Automatic payout queue | **Partly** | `enqueue_auto_payouts()` and `settle_auto_payout()` exist but are gated off |
| Manual approval flow removed | **Not done** | `request_payout()` and `process_payout()` are still the live path |
| Admin screen is read-only report | **Not done** | Still an approval queue |

Relevant `app_config`:

| Key | Value | Meaning |
|---|---|---|
| `host_commission_rate` | `0` | See A7 — platform takes nothing |
| `payout_auto_enabled` | `false` | Automatic payouts disabled |
| `payout_provider` | *(empty)* | No provider configured |
| `payout_threshold` | `20.000` | Minimum OMR before a payout |

**So Phase 2 is not a build-from-scratch. It is: set the commission rate, switch the
payout path from manual to automatic, and turn the admin screen into a report.**

## B3. The real blocker: there is no Oman payout provider

The pay-**in** side is solved — Thawani takes card payments. The pay-**out** side is not:
Thawani is pay-in only, so there is no API to push money to an investor's bank account.

This is why `payout_auto_enabled` is `false` and `payout_provider` is empty. The code is
ready; the rail does not exist.

Until a provider is contracted, "automatic settlement" can only mean:

- Earnings credit to the investor's balance automatically — **this already works**.
- Withdrawal to bank stays a **manual bank transfer** by finance, with the app recording
  intent and status.

Attempting to present withdrawals as automatic before a rail exists would be dishonest to
investors. Options to pursue, in rough order of likelihood:

1. A local bank's corporate payment API (Bank Muscat, NBO) — a corporate banking
   conversation, not a signup.
2. A regional PSP with GCC payout support.
3. Batch file transfer: generate a bank-format file, finance uploads it. Semi-automatic
   and realistic in the short term.

## B4. What to build

**Step 1 — set the commission rate.** A config update, no deploy. Blocked only on the
business decision in A7. Without this the rest is moot: settlement of 100% to the host
needs no platform at all.

**Step 2 — an earnings ledger.** Host credits currently land in `profiles.wallet_balance`
with a `wallet_transactions` row of type `earning`. That is enough to pay people but not
to *report*: there is no per-session breakdown of gross, commission, and net. Add a
`host_earnings` table written by `credit_host_earning` in the same transaction:

```
host_earnings(
  id, session_id unique, listing_id, host_id,
  gross numeric, commission_rate numeric, commission numeric, net numeric,
  created_at
)
```

Recording `commission_rate` **per row** matters: the rate will change, and historical rows
must not be re-derived from today's setting.

**Step 3 — switch the withdrawal path.** Keep `payout_requests` as the record, but stop
requiring admin approval per request. With `payout_auto_enabled = true`, the daily
`/api/jobs/disburse` job calls `enqueue_auto_payouts()` for balances over
`payout_threshold` with bank details present. `process_payout()` stays for exceptions
only. While there is no payout rail, the "settlement" step is finance confirming a manual
transfer — the status flow is identical, only the execution is human.

**Step 4 — AdminPayoutsScreen becomes AdminSettlementsScreen.** Read-only: who earned
what over a period, commission collected, what has been transferred, what is outstanding.
Backed by `host_earnings` joined to `payout_requests`.

**Step 5 — InvestorEarningsScreen shows the breakdown.** Per session: gross, commission,
net. Investors will ask why a number is not what they expected, and the honest answer is a
visible commission line.

## B5. Edge cases that must be covered

Each of these has bitten a settlement system somewhere:

- **A session that never completes.** Auto-shutoff finalises it; the credit must fire
  exactly once. `credit_host_earning` is already idempotent — keep a test on it.
- **A refunded or disputed session.** There is currently no reversal path. A refund after
  the host has been credited leaves the platform short. Needs a negative ledger entry.
- **Commission changed mid-month.** Per-row `commission_rate` handles this. Never
  recompute history from the live setting.
- **Host deleted or listing transferred.** `credit_host_earning` returns silently if the
  listing has no host, so revenue is silently dropped. It should be recorded and flagged
  instead.
- **Rounding.** `round(…, 3)` at 3 decimals for OMR baisa. Commission plus net must equal
  gross exactly; assert it in a test rather than trusting the arithmetic.
- **A payout that fails at the bank.** The balance must return to the investor, not
  vanish. `settle_auto_payout` already credits back on failure — test it.

## B6. Definition of done

- [ ] `host_commission_rate` set to an agreed non-zero value
- [ ] `host_earnings` written for every completed private-charger session, exactly once
- [ ] Commission plus net equals gross for every row, verified by test
- [ ] Investor sees gross, commission and net per session
- [ ] Admin settlement screen is read-only and reconciles against `wallet_transactions`
- [ ] Payouts over threshold enqueue without per-request admin approval
- [ ] Failed payout returns the balance, proven by test
- [ ] Refund reversal path exists, or is a documented accepted risk
- [ ] Payout provider contracted, **or** the batch-file route documented and agreed

## B7. Files this will touch

| File | Change |
|---|---|
| `backend/sql/` new migration | `host_earnings` table; `credit_host_earning` writes it |
| `backend/src/modules/payouts/payouts.routes.ts` | Settlement report endpoint; demote manual approval |
| `backend/src/modules/jobs/jobs.routes.ts` | `/disburse` becomes the live path |
| `src/screens/AdminPayoutsScreen.tsx` | → `AdminSettlementsScreen`, read-only |
| `src/screens/InvestorEarningsScreen.tsx` | Per-session gross / commission / net |
| `app_config` | `host_commission_rate`, `payout_auto_enabled`, `payout_provider` |

---

## Related documents

- `ROADMAP.md` — all ten phases and their order
- `LAUNCH_STATUS_2026-08.md` — launch blockers and dates
- `SELF_HOSTING.md` — production Postgres and deployment
- `mapchossing.md` — map provider decision
- `backend/src/config/env.ts` — every environment variable, with the iSmartSMS
  return-code warning from A4
