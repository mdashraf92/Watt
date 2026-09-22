-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — venue packages, entitlements, redemptions
--
--  Phase 1 of the marketplace pivot (docs/planning/pivot-ev-marketplace.md §4).
--
--  WHAT CHANGES CONCEPTUALLY
--
--  Go Watt stops selling electricity. A Go Watt branded venue sells a PACKAGE:
--  a coffee and an hour on the charger, a gym month carrying charging credit, a
--  hotel night that ends with a full battery. Charging is an included amenity,
--  not the thing being priced.
--
--  So the meter changes job. It used to decide how much to bill. It now decides
--  whether the driver has exhausted what they already bought. Three tables:
--
--    venue_packages           what a venue offers
--    entitlements             what one driver currently holds
--    entitlement_redemptions  a single use of an entitlement
--
--  DESIGN DECISIONS, AND WHY
--
--  * Paid up front, no hold. Per-kWh sessions had to reserve money against an
--    unknown final bill (profiles.held_balance). A package has a known price, so
--    it is simply debited at purchase. Nothing about entitlements touches
--    held_balance, and that is deliberate — do not add a hold here later without
--    re-reading why it existed for metered charging.
--
--  * Price and venue are SNAPSHOT onto the entitlement at purchase. A venue that
--    re-prices its coffee package tomorrow, renames it, or deactivates it must
--    not retroactively change what someone already bought or where they can use
--    it. price_paid and station_id on entitlements are the record; the package
--    row is only the current offer.
--
--  * A cap can be minutes, kWh, or both. Whichever runs out first ends the
--    entitlement. At least one must be set — a package with no cap is an open
--    bar on someone else's electricity bill, so the check constraint refuses it.
--
--  * Entitlements expire. validity_hours is not an upsell mechanic; it is what
--    stops an unbounded liability accumulating against venues that have to
--    honour these. Expiry is also the metric that matters most in Phase 1:
--    packages sold but never redeemed look like revenue and are actually a
--    broken promise (see the plan, §12).
--
--  * Redemptions are a separate table rather than a counter on the entitlement.
--    A driver may use an hour-long package across two visits, and venue
--    settlement needs the individual events, not just a remaining balance.
--
--  WHAT THIS MIGRATION DOES NOT DO
--
--  It does not yet wire entitlement consumption into _finalize_charging_session.
--  Sessions still finalize on their per-kWh path; redeem_entitlement() is called
--  explicitly for now. That integration is the next step and is deliberately
--  separate, because _finalize_charging_session carries the overstay and refund
--  logic and should be changed on its own, with its own review.
--
--  Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1) What a venue offers ─────────────────────────────────────────────────
create table if not exists public.venue_packages (
  id                 uuid primary key default gen_random_uuid(),
  station_id         uuid        not null references public.stations(id) on delete cascade,

  -- Both languages are required. A half-translated catalog is the fastest way
  -- to look unfinished, and Arabic is the primary locale, not a translation of
  -- the English.
  name               text        not null,
  name_ar            text        not null,
  description        text        not null default '',
  description_ar     text        not null default '',

  -- What the driver gets that is not electricity: "Regular coffee",
  -- "One month gym access", "One night, full battery". This is the product.
  partner_benefit    text        not null,
  partner_benefit_ar text        not null,

  -- OMR carries three decimals (baisa), matching wallet_balance elsewhere.
  price              numeric(8,3) not null check (price >= 0),

  -- The charging allowance. Null = not capped on this axis.
  included_minutes   integer     check (included_minutes is null or included_minutes > 0),
  included_kwh       numeric(8,3) check (included_kwh     is null or included_kwh     > 0),

  -- How long the entitlement lives once bought. Default 24h suits the
  -- coffee/gym case; hotels and multi-day passes set their own.
  validity_hours     integer     not null default 24 check (validity_hours > 0),

  is_active          boolean     not null default true,
  sort_order         integer     not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- An uncapped package is an open bar. Refuse it at the schema level, because
  -- this table will outlive any one version of the admin UI that also checks.
  constraint venue_packages_has_a_cap check (
    included_minutes is not null or included_kwh is not null
  )
);

create index if not exists venue_packages_station_idx
  on public.venue_packages (station_id, sort_order) where is_active;

comment on table public.venue_packages is
  'What a Go Watt branded venue sells. Charging is an included amenity, never the priced item.';
comment on column public.venue_packages.partner_benefit is
  'The non-electricity half of the bundle — the coffee, the gym month, the room night.';


-- ── 2) What a driver holds ─────────────────────────────────────────────────
create table if not exists public.entitlements (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  package_id       uuid        not null references public.venue_packages(id) on delete restrict,

  -- Snapshots. See the header: the package row is the current offer, these are
  -- the record of what was actually bought.
  station_id       uuid        not null references public.stations(id) on delete restrict,
  price_paid       numeric(8,3) not null check (price_paid >= 0),
  minutes_total    integer,
  kwh_total        numeric(8,3),

  minutes_used     integer      not null default 0 check (minutes_used >= 0),
  kwh_used         numeric(8,3) not null default 0 check (kwh_used     >= 0),

  status           text        not null default 'active'
                   check (status in ('active', 'consumed', 'expired', 'refunded')),

  -- Shown to venue staff at redemption. Reuses the shape bookings already use.
  redeem_code      text        not null,

  purchased_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  refunded_at      timestamptz,

  constraint entitlements_has_a_cap check (
    minutes_total is not null or kwh_total is not null
  )
);

-- The app's main query: "what do I hold right now".
create index if not exists entitlements_user_active_idx
  on public.entitlements (user_id, expires_at) where status = 'active';
-- Venue staff scanning a code.
create unique index if not exists entitlements_redeem_code_key
  on public.entitlements (redeem_code);
-- The expiry sweep (see expire_entitlements below).
create index if not exists entitlements_expiry_idx
  on public.entitlements (expires_at) where status = 'active';

comment on table public.entitlements is
  'A package a driver has bought and not yet exhausted. Paid up front — no wallet hold, unlike metered sessions.';
comment on column public.entitlements.price_paid is
  'What was actually paid. The package may be re-priced later; this must not move.';


-- ── 3) Each use of an entitlement ──────────────────────────────────────────
create table if not exists public.entitlement_redemptions (
  id              uuid primary key default gen_random_uuid(),
  entitlement_id  uuid        not null references public.entitlements(id) on delete cascade,
  session_id      uuid        references public.charging_sessions(id) on delete set null,
  station_id      uuid        not null references public.stations(id) on delete restrict,

  minutes_used    integer      not null default 0 check (minutes_used >= 0),
  kwh_used        numeric(8,3) not null default 0 check (kwh_used     >= 0),

  redeemed_at     timestamptz not null default now()
);

create index if not exists entitlement_redemptions_entitlement_idx
  on public.entitlement_redemptions (entitlement_id, redeemed_at desc);
-- Venue settlement: "what did this venue honour last month".
create index if not exists entitlement_redemptions_station_idx
  on public.entitlement_redemptions (station_id, redeemed_at desc);

comment on table public.entitlement_redemptions is
  'One use of an entitlement. Separate from a counter because venue settlement needs the events, not just a remaining balance.';


-- ── 4) Buy a package ───────────────────────────────────────────────────────
-- Debits the wallet and issues the entitlement in one transaction. Returns the
-- new entitlement plus the resulting balance, so the client needs no follow-up
-- read. Raises if the package is gone, inactive, or the balance is short.
create or replace function public.purchase_package(p_package uuid)
  returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_pkg     venue_packages%rowtype;
  v_balance numeric(10,3);
  v_ent     entitlements%rowtype;
  v_code    text;
  v_try     integer;
begin
  -- Messages here are the tagged forms fromPgError() recognises (src/lib/errors.ts).
  -- An untagged message becomes a 500, so the app would show "server error" for
  -- things that are really the user being told no.
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Lock the package row so a deactivation racing this purchase cannot leave us
  -- issuing an entitlement against an offer that just closed.
  select * into v_pkg from venue_packages where id = p_package for share;
  if not found or not v_pkg.is_active then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;

  -- Lock the buyer's row before reading the balance, so two taps cannot both
  -- see enough money and both spend it.
  select wallet_balance into v_balance from profiles where id = v_uid for update;
  if v_balance is null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if v_balance < v_pkg.price then
    raise exception 'INSUFFICIENT_BALANCE|required=%|shortfall=%',
      v_pkg.price, (v_pkg.price - v_balance) using errcode = 'P0001';
  end if;

  -- Short code for venue staff to read across a counter. Derived from a uuid
  -- (core PG — pgcrypto's gen_random_bytes is NOT assumed available) and mapped
  -- onto an alphabet with no 0/O, 1/I or 8/B confusions. 16^8 combinations, and
  -- the unique index is the real guarantee — hence the retry.
  for v_try in 1..5 loop
    v_code := 'GW-' || translate(
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      '0123456789abcdef',
      '23456789ACDEFGHJ'
    );
    exit when not exists (select 1 from entitlements where redeem_code = v_code);
    if v_try = 5 then
      raise exception 'Could not allocate a redeem code' using errcode = 'P0001';
    end if;
  end loop;

  update profiles
     set wallet_balance = wallet_balance - v_pkg.price
   where id = v_uid
  returning wallet_balance into v_balance;

  insert into entitlements
    (user_id, package_id, station_id, price_paid,
     minutes_total, kwh_total, redeem_code, expires_at)
  values
    (v_uid, v_pkg.id, v_pkg.station_id, v_pkg.price,
     v_pkg.included_minutes, v_pkg.included_kwh, v_code,
     now() + make_interval(hours => v_pkg.validity_hours))
  returning * into v_ent;

  insert into wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  values
    (v_uid, 'charge', -v_pkg.price, v_balance, v_pkg.name, v_ent.id::text);

  return jsonb_build_object(
    'entitlement', to_jsonb(v_ent),
    'balance',     v_balance
  );
end $function$;


-- ── 5) Use an entitlement ──────────────────────────────────────────────────
-- Records a redemption and decrements the allowance. Whichever cap runs out
-- first consumes the entitlement.
--
-- Consumption is clamped to what remains: if a session delivered more than the
-- package covered, the excess is NOT silently billed here. Deciding what happens
-- to an overrun (absorb it, or charge it) is a commercial decision, not one to
-- bury in a function — see the plan, §10. Until it is made, the venue absorbs
-- it, which is the safe direction for the driver.
create or replace function public.redeem_entitlement(
  p_entitlement uuid,
  p_session     uuid    default null,
  p_minutes     integer default 0,
  p_kwh         numeric default 0
) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid      uuid := auth.uid();
  v_ent      entitlements%rowtype;
  v_minutes  integer;
  v_kwh      numeric(8,3);
  v_done     boolean := false;
begin
  select * into v_ent from entitlements where id = p_entitlement for update;
  if not found then
    raise exception 'Entitlement not found' using errcode = 'P0002';
  end if;

  -- The holder, or staff acting for the venue. is_admin() mirrors the guard the
  -- rest of the money functions use.
  if v_ent.user_id <> v_uid and not is_admin() then
    raise exception 'FORBIDDEN|not your entitlement' using errcode = '42501';
  end if;

  if v_ent.status <> 'active' then
    raise exception 'BAD_TRANSITION|entitlement is %', v_ent.status using errcode = 'P0001';
  end if;
  if v_ent.expires_at <= now() then
    -- Settle the status on the way past, so the sweep is not the only thing
    -- that can correct it and reporting stays honest.
    update entitlements set status = 'expired' where id = v_ent.id;
    raise exception 'BAD_TRANSITION|entitlement expired' using errcode = 'P0001';
  end if;

  -- Clamp to what is left on each axis that is capped.
  v_minutes := greatest(coalesce(p_minutes, 0), 0);
  v_kwh     := greatest(coalesce(p_kwh,     0), 0);
  if v_ent.minutes_total is not null then
    v_minutes := least(v_minutes, v_ent.minutes_total - v_ent.minutes_used);
  end if;
  if v_ent.kwh_total is not null then
    v_kwh := least(v_kwh, v_ent.kwh_total - v_ent.kwh_used);
  end if;

  insert into entitlement_redemptions
    (entitlement_id, session_id, station_id, minutes_used, kwh_used)
  values
    (v_ent.id, p_session, v_ent.station_id, v_minutes, v_kwh);

  update entitlements
     set minutes_used = minutes_used + v_minutes,
         kwh_used     = kwh_used     + v_kwh
   where id = v_ent.id
  returning * into v_ent;

  -- Exhausted on either capped axis ends it.
  v_done := (v_ent.minutes_total is not null and v_ent.minutes_used >= v_ent.minutes_total)
         or (v_ent.kwh_total     is not null and v_ent.kwh_used     >= v_ent.kwh_total);

  if v_done then
    update entitlements
       set status = 'consumed', consumed_at = now()
     where id = v_ent.id
    returning * into v_ent;
  end if;

  return jsonb_build_object(
    'entitlement',      to_jsonb(v_ent),
    'minutes_redeemed', v_minutes,
    'kwh_redeemed',     v_kwh,
    'consumed',         v_done
  );
end $function$;


-- ── 6) Refund an unused package ────────────────────────────────────────────
-- Admin action. Refunds what was paid, less nothing — a partial-refund policy
-- for partly-used packages does not exist yet and should not be invented here.
-- Refuses once any redemption has happened, so the policy gap cannot be papered
-- over by accident.
create or replace function public.refund_entitlement(
  p_entitlement uuid,
  p_reason      text default null
) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_ent     entitlements%rowtype;
  v_balance numeric(10,3);
  v_uses    integer;
begin
  if not is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  select * into v_ent from entitlements where id = p_entitlement for update;
  if not found then
    raise exception 'Entitlement not found' using errcode = 'P0002';
  end if;
  if v_ent.status = 'refunded' then
    return jsonb_build_object('already', true, 'entitlement', to_jsonb(v_ent));
  end if;

  select count(*) into v_uses from entitlement_redemptions where entitlement_id = v_ent.id;
  if v_uses > 0 then
    raise exception 'BAD_TRANSITION|entitlement has been used — no partial-refund policy exists yet'
      using errcode = 'P0001';
  end if;

  update profiles
     set wallet_balance = wallet_balance + v_ent.price_paid
   where id = v_ent.user_id
  returning wallet_balance into v_balance;

  insert into wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  values
    (v_ent.user_id, 'refund', v_ent.price_paid, v_balance,
     coalesce(p_reason, 'Package refund'), v_ent.id::text);

  update entitlements
     set status = 'refunded', refunded_at = now()
   where id = v_ent.id
  returning * into v_ent;

  return jsonb_build_object('already', false, 'entitlement', to_jsonb(v_ent), 'balance', v_balance);
end $function$;


-- ── 7) Expiry sweep ────────────────────────────────────────────────────────
-- Called from the jobs tick. Expiry is also readable live (expires_at <= now()),
-- so this is bookkeeping rather than correctness — but reporting on "sold and
-- never used" needs the status settled, not inferred.
create or replace function public.expire_entitlements()
  returns integer
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  update entitlements
     set status = 'expired'
   where status = 'active'
     and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end $function$;
