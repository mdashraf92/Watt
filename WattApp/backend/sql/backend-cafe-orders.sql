-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — Café orders: order coffee ahead, get a charging pass
--
--  Apply after backend-package-venues.sql. Idempotent.
--
--  A driver picks a café on the Coffee map (only Go Watt package venues with a
--  café menu appear), chooses a package such as "Coffee + 60 min — 5.000 OMR",
--  picks the drink(s) the package includes, optionally adds extras, and pays by
--  card. Payment confirmation issues the ordinary package ENTITLEMENT, so the
--  existing charging control, QR code and venue-staff checks all keep working.
--
--  MONEY RULES
--
--  * Go Watt takes 100% of the card payment. The café (and Beanz, when the
--    café's menu comes from Beanz) are paid later from cafe_ledger through
--    cafe_settlements. Every paid order writes exactly one ledger row whose
--    parts sum to the gross — a check constraint, not a convention.
--
--  * Totals are recomputed here from the menu. The app sends what it showed
--    the customer (expected_total + offer_version); any difference is a 409 and
--    nothing is charged. Do NOT compute order totals in TypeScript.
--
--  * Beanz sync owns the source_* view of an item (name, price, options,
--    source_available). Go Watt admin owns is_available, package_upcharge and
--    sort_order. Sync never touches admin columns, so a re-sync cannot undo a
--    local decision, and items missing from Beanz are made unavailable, never
--    deleted (order items snapshot their wording anyway).
--
--  * A café can reject (or the customer cancel) only before the café accepts.
--    That voids the ledger row, refunds the entitlement, and leaves the card
--    refund to the backend (refund_status = 'pending' until the gateway agrees).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ── 1) Café profile and settlement terms on the venue ──────────────────────
alter table public.stations add column if not exists cafe_enabled     boolean not null default false;
alter table public.stations add column if not exists cafe_logo_url    text;
alter table public.stations add column if not exists orders_paused    boolean not null default false;
alter table public.stations add column if not exists prep_minutes     integer not null default 8;
alter table public.stations add column if not exists menu_source      text    not null default 'manual';
alter table public.stations add column if not exists beanz_store_id   text;
alter table public.stations add column if not exists beanz_synced_at  timestamptz;
alter table public.stations add column if not exists beanz_sync_error text;
-- What Go Watt keeps from each package for the charging, before commission.
alter table public.stations add column if not exists charge_share_omr numeric(8,3) not null default 0;
alter table public.stations add column if not exists commission_pct   numeric(5,2) not null default 0;
alter table public.stations add column if not exists beanz_fee_pct    numeric(5,2) not null default 0;

do $$ begin
  alter table public.stations add constraint stations_cafe_terms_check check (
    menu_source in ('manual','beanz') and prep_minutes between 1 and 120
    and charge_share_omr >= 0 and commission_pct between 0 and 100
    and beanz_fee_pct between 0 and 100 and commission_pct + beanz_fee_pct <= 100);
exception when duplicate_object then null; end $$;

-- How many menu drinks a package bundles (the "coffee" in coffee + charging).
alter table public.venue_packages add column if not exists included_items integer not null default 1;
do $$ begin
  alter table public.venue_packages add constraint venue_packages_included_items_check
    check (included_items between 0 and 10);
exception when duplicate_object then null; end $$;


-- ── 2) Menu ────────────────────────────────────────────────────────────────
-- options: [{ "id","name","name_ar","required":bool,"max":int,
--             "choices":[{ "id","name","name_ar","price_delta":number }] }]
create table if not exists public.cafe_menu_items (
  id               uuid primary key default gen_random_uuid(),
  station_id       uuid        not null references public.stations(id) on delete cascade,
  category         text        not null default '',
  category_ar      text        not null default '',
  name             text        not null,
  name_ar          text        not null,
  description      text        not null default '',
  description_ar   text        not null default '',
  price            numeric(8,3) not null check (price >= 0),
  image_url        text,
  options          jsonb       not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  -- Source-owned: Beanz says whether it is on the menu at all.
  source_available boolean     not null default true,
  -- Admin-owned: never written by sync.
  is_available     boolean     not null default true,
  package_upcharge numeric(8,3) check (package_upcharge is null or package_upcharge >= 0),
  sort_order       integer     not null default 0,
  source           text        not null default 'manual' check (source in ('manual','csv','beanz')),
  external_id      text,
  synced_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists cafe_menu_items_station_idx on public.cafe_menu_items (station_id, category, sort_order);
create unique index if not exists cafe_menu_items_external_key
  on public.cafe_menu_items (station_id, external_id) where external_id is not null;

comment on column public.cafe_menu_items.package_upcharge is
  'null = cannot be the drink in a package; 0 = included; >0 = extra charged when chosen as the package drink.';


-- ── 3) Orders ──────────────────────────────────────────────────────────────
create table if not exists public.cafe_orders (
  id                 uuid primary key default gen_random_uuid(),
  order_no           bigint generated always as identity,
  user_id            uuid        not null references public.profiles(id) on delete restrict,
  station_id         uuid        not null references public.stations(id) on delete restrict,
  package_id         uuid        not null references public.venue_packages(id) on delete restrict,
  status             text        not null default 'pending_payment' check (status in
                     ('pending_payment','paid','accepted','ready','collected','rejected','cancelled','payment_failed')),
  package_price      numeric(8,3) not null,
  items_total        numeric(8,3) not null,
  total              numeric(8,3) not null check (total > 0),
  request_key        text        not null,
  offer_version      text        not null,
  note               text        not null default '',
  payment_reference  text,
  paid_reference     text,
  entitlement_id     uuid        references public.entitlements(id),
  refund_status      text        check (refund_status in ('pending','refunded','failed','review')),
  refund_reference   text,
  reject_reason      text,
  ready_eta          timestamptz,
  staff_seen_at      timestamptz,
  sms_alerted_at     timestamptz,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz,
  accepted_at        timestamptz,
  ready_at           timestamptz,
  collected_at       timestamptz,
  closed_at          timestamptz,
  constraint cafe_orders_total_sum check (total = package_price + items_total)
);
create unique index if not exists cafe_orders_request_key on public.cafe_orders (user_id, request_key);
create index if not exists cafe_orders_user_idx    on public.cafe_orders (user_id, created_at desc);
create index if not exists cafe_orders_station_idx on public.cafe_orders (station_id, created_at desc)
  where status in ('paid','accepted','ready');
create index if not exists cafe_orders_pending_idx on public.cafe_orders (created_at) where status = 'pending_payment';

create table if not exists public.cafe_order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid        not null references public.cafe_orders(id) on delete cascade,
  menu_item_id  uuid        references public.cafe_menu_items(id) on delete set null,
  name          text        not null,
  name_ar       text        not null,
  options       jsonb       not null default '[]'::jsonb,
  unit_price    numeric(8,3) not null check (unit_price >= 0),
  quantity      integer     not null check (quantity between 1 and 20),
  in_package    boolean     not null default false
);
create index if not exists cafe_order_items_order_idx on public.cafe_order_items (order_id);

alter table public.payment_sessions add column if not exists cafe_order_id uuid references public.cafe_orders(id);
create index if not exists payment_sessions_cafe_order_idx on public.payment_sessions (cafe_order_id) where cafe_order_id is not null;


-- ── 4) Ledger and settlements ──────────────────────────────────────────────
create table if not exists public.cafe_settlements (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid        not null references public.stations(id) on delete restrict,
  period_end    timestamptz not null,
  order_count   integer     not null,
  gross         numeric(10,3) not null,
  cafe_net      numeric(10,3) not null,
  beanz_fee     numeric(10,3) not null,
  status        text        not null default 'open' check (status in ('open','paid')),
  bank_reference text,
  created_by    uuid        references public.profiles(id),
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);

create table if not exists public.cafe_ledger (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid        not null unique references public.cafe_orders(id) on delete restrict,
  station_id          uuid        not null references public.stations(id) on delete restrict,
  gross               numeric(8,3) not null,
  gowatt_charge_share numeric(8,3) not null,
  gowatt_commission   numeric(8,3) not null,
  beanz_fee           numeric(8,3) not null,
  cafe_net            numeric(8,3) not null check (cafe_net >= 0),
  settlement_id       uuid        references public.cafe_settlements(id),
  voided_at           timestamptz,
  created_at          timestamptz not null default now(),
  constraint cafe_ledger_sums check (gowatt_charge_share + gowatt_commission + beanz_fee + cafe_net = gross)
);
create index if not exists cafe_ledger_unsettled_idx on public.cafe_ledger (station_id, created_at)
  where settlement_id is null and voided_at is null;


-- ── 5) Create an order (customer) ──────────────────────────────────────────
-- p_items: [{ "item_id": uuid, "quantity": int, "in_package": bool, "options": [choice id, ...] }]
create or replace function public.create_cafe_order(
  p_station uuid, p_package uuid, p_items jsonb, p_key text,
  p_expected_total numeric, p_offer_version text, p_note text default ''
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid     uuid := auth.uid();
  v_order   cafe_orders%rowtype;
  v_station stations%rowtype;
  v_pkg     venue_packages%rowtype;
  v_line    jsonb;
  v_item    cafe_menu_items%rowtype;
  v_group   jsonb;
  v_chosen  text[];
  v_count   integer;
  v_matched integer;
  v_delta   numeric;
  v_gdelta  numeric;
  v_qty     integer;
  v_unit    numeric;
  v_in_pkg  boolean;
  v_pkg_n   integer := 0;
  v_items   numeric := 0;
  v_snap    jsonb := '[]'::jsonb;
  v_opts    jsonb;
  v_picked  jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_key is null or length(p_key) < 16 or length(p_key) > 100 then
    raise exception 'BAD_TRANSITION|Invalid request key';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 30 then
    raise exception 'BAD_TRANSITION|Invalid order items';
  end if;

  -- Retries wait for the original transaction, then return its order.
  perform pg_advisory_xact_lock(hashtext('cafe_order:' || v_uid::text || ':' || p_key));
  select * into v_order from cafe_orders where user_id = v_uid and request_key = p_key;
  if found then
    if v_order.station_id <> p_station or v_order.package_id <> p_package
       or v_order.total <> round(p_expected_total, 3) then
      raise exception 'BAD_TRANSITION|Request key already used for another order';
    end if;
    return to_jsonb(v_order);
  end if;

  select * into v_station from stations where id = p_station for share;
  if not found or not v_station.cafe_enabled or not v_station.is_package_venue then
    raise exception 'Café not found';
  end if;
  if v_station.orders_paused then
    raise exception 'BAD_TRANSITION|This café is not taking orders right now';
  end if;

  select * into v_pkg from venue_packages where id = p_package for share;
  if not found or not v_pkg.is_active or v_pkg.station_id <> p_station then
    raise exception 'Package not found';
  end if;
  if p_offer_version is distinct from v_pkg.updated_at::text then
    raise exception 'BAD_TRANSITION|Package price changed or terms changed; review the offer again';
  end if;

  for v_line in select * from jsonb_array_elements(p_items) loop
    select * into v_item from cafe_menu_items
      where id = (v_line->>'item_id')::uuid and station_id = p_station for share;
    if not found or not v_item.is_available or not v_item.source_available then
      raise exception 'BAD_TRANSITION|An item is no longer available; review your order';
    end if;

    v_qty    := coalesce((v_line->>'quantity')::integer, 1);
    v_in_pkg := coalesce((v_line->>'in_package')::boolean, false);
    if v_qty < 1 or v_qty > 20 then raise exception 'BAD_TRANSITION|Invalid quantity'; end if;

    select coalesce(array_agg(distinct x), '{}') into v_chosen
      from jsonb_array_elements_text(coalesce(v_line->'options', '[]'::jsonb)) x;
    if cardinality(v_chosen) <> jsonb_array_length(coalesce(v_line->'options', '[]'::jsonb)) then
      raise exception 'BAD_TRANSITION|Invalid item options';
    end if;

    -- Each group: required groups need a choice, none may exceed its max.
    v_delta := 0; v_matched := 0; v_opts := '[]'::jsonb;
    for v_group in select * from jsonb_array_elements(v_item.options) loop
      select count(*), coalesce(sum((c->>'price_delta')::numeric), 0),
             coalesce(jsonb_agg(jsonb_build_object(
               'group', v_group->>'name', 'group_ar', v_group->>'name_ar',
               'name', c->>'name', 'name_ar', c->>'name_ar',
               'price_delta', (c->>'price_delta')::numeric)), '[]'::jsonb)
        into v_count, v_gdelta, v_picked
        from jsonb_array_elements(v_group->'choices') c
        where c->>'id' = any(v_chosen);
      v_opts := v_opts || v_picked;
      v_matched := v_matched + v_count;
      v_delta := v_delta + v_gdelta;
    end loop;
    if v_matched <> cardinality(v_chosen) then
      raise exception 'BAD_TRANSITION|Invalid item options';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_item.options) g
       where (coalesce((g->>'required')::boolean, false)
              and not exists (select 1 from jsonb_array_elements(g->'choices') c where c->>'id' = any(v_chosen)))
          or (select count(*) from jsonb_array_elements(g->'choices') c where c->>'id' = any(v_chosen))
             > coalesce((g->>'max')::integer, 1)
    ) then
      raise exception 'BAD_TRANSITION|Choose the required options for each item';
    end if;

    if v_in_pkg then
      if v_qty <> 1 or v_item.package_upcharge is null then
        raise exception 'BAD_TRANSITION|This item cannot be the package drink';
      end if;
      v_unit  := v_item.package_upcharge + v_delta;
      v_pkg_n := v_pkg_n + 1;
    else
      v_unit := v_item.price + v_delta;
    end if;
    v_items := v_items + v_unit * v_qty;
    v_snap := v_snap || jsonb_build_object('item_id', v_item.id, 'name', v_item.name, 'name_ar', v_item.name_ar,
      'options', v_opts, 'unit_price', v_unit, 'quantity', v_qty, 'in_package', v_in_pkg);
  end loop;

  if v_pkg_n <> v_pkg.included_items then
    raise exception 'BAD_TRANSITION|Choose % package drink(s)', v_pkg.included_items;
  end if;
  if round(v_pkg.price + v_items, 3) <> round(p_expected_total, 3) then
    raise exception 'BAD_TRANSITION|Prices changed; review your order again';
  end if;

  insert into cafe_orders (user_id, station_id, package_id, package_price, items_total, total,
                           request_key, offer_version, note)
  values (v_uid, p_station, p_package, v_pkg.price, round(v_items, 3), round(v_pkg.price + v_items, 3),
          p_key, p_offer_version, left(coalesce(p_note, ''), 300))
  returning * into v_order;

  insert into cafe_order_items (order_id, menu_item_id, name, name_ar, options, unit_price, quantity, in_package)
  select v_order.id, (s->>'item_id')::uuid, s->>'name', s->>'name_ar', s->'options',
         (s->>'unit_price')::numeric, (s->>'quantity')::integer, (s->>'in_package')::boolean
    from jsonb_array_elements(v_snap) s;

  return to_jsonb(v_order);
end $$;


-- ── 6) Confirm payment (backend only, after the gateway says succeeded) ────
-- Idempotent. Returns { order, duplicate_payment } — duplicate_payment is true
-- when the order was already paid by a DIFFERENT reference, so the caller must
-- refund that second charge rather than issue anything.
create or replace function public.confirm_cafe_order_payment(p_order uuid, p_reference text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_order   cafe_orders%rowtype;
  v_pkg     venue_packages%rowtype;
  v_station stations%rowtype;
  v_ent     entitlements%rowtype;
  v_benefit text;
  v_benefit_ar text;
  v_share   numeric;
  v_comm    numeric;
  v_beanz   numeric;
begin
  select * into v_order from cafe_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not exists (select 1 from payment_sessions where session_id = p_reference and cafe_order_id = p_order) then
    raise exception 'FORBIDDEN|Payment does not belong to this order';
  end if;
  update payment_sessions set status = 'paid', paid_at = coalesce(paid_at, now())
    where session_id = p_reference and cafe_order_id = p_order;

  if v_order.paid_reference is not null then
    return jsonb_build_object('order', to_jsonb(v_order),
                              'duplicate_payment', v_order.paid_reference <> p_reference);
  end if;
  if v_order.status not in ('pending_payment', 'payment_failed') then
    -- Cancelled before the money arrived: the money must go back.
    return jsonb_build_object('order', to_jsonb(v_order), 'duplicate_payment', true);
  end if;

  select * into v_pkg from venue_packages where id = v_order.package_id;
  select * into v_station from stations where id = v_order.station_id;
  select string_agg(name, ', ' order by name), string_agg(name_ar, '، ' order by name)
    into v_benefit, v_benefit_ar
    from cafe_order_items where order_id = p_order and in_package;

  insert into entitlements (
    user_id, package_id, station_id, price_paid, minutes_total, kwh_total,
    redeem_code, expires_at, purchase_key, offer_version, package_name, package_name_ar,
    partner_benefit, partner_benefit_ar
  ) values (
    v_order.user_id, v_pkg.id, v_order.station_id, v_order.total, v_pkg.included_minutes, v_pkg.included_kwh,
    'GW-' || upper(replace(gen_random_uuid()::text, '-', '')),
    now() + make_interval(hours => v_pkg.validity_hours), 'cafe:' || p_order::text, v_order.offer_version,
    v_pkg.name, v_pkg.name_ar,
    coalesce(v_benefit, v_pkg.partner_benefit), coalesce(v_benefit_ar, v_pkg.partner_benefit_ar)
  ) returning * into v_ent;

  -- Split. Go Watt keeps the charging share, then commission and the Beanz fee
  -- are taken from the café's portion; the café gets the rest.
  v_share := least(v_station.charge_share_omr, v_order.total);
  v_comm  := round((v_order.total - v_share) * v_station.commission_pct / 100, 3);
  v_beanz := case when v_station.menu_source = 'beanz'
                  then round((v_order.total - v_share) * v_station.beanz_fee_pct / 100, 3) else 0 end;
  insert into cafe_ledger (order_id, station_id, gross, gowatt_charge_share, gowatt_commission, beanz_fee, cafe_net)
  values (p_order, v_order.station_id, v_order.total, v_share, v_comm, v_beanz,
          v_order.total - v_share - v_comm - v_beanz);

  update cafe_orders set status = 'paid', paid_reference = p_reference, payment_reference = p_reference,
                         entitlement_id = v_ent.id, paid_at = now()
    where id = p_order returning * into v_order;
  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate_payment', false);
end $$;

-- Gateway said the attempt failed. Only moves an unpaid order.
create or replace function public.fail_cafe_order_payment(p_order uuid, p_reference text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_order cafe_orders%rowtype;
begin
  update payment_sessions set status = 'failed' where session_id = p_reference and cafe_order_id = p_order and status <> 'paid';
  update cafe_orders set status = 'payment_failed'
    where id = p_order and status = 'pending_payment' and payment_reference = p_reference
    returning * into v_order;
  if not found then select * into v_order from cafe_orders where id = p_order; end if;
  return to_jsonb(v_order);
end $$;


-- ── 7) Order actions (café staff and the customer) ─────────────────────────
-- accept | ready | collect | reject  — venue staff (or admin)
-- cancel                             — the customer, before the café accepts
create or replace function public.cafe_order_action(p_order uuid, p_action text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v_order cafe_orders%rowtype;
  v_staff boolean;
  v_prep  integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_order from cafe_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  v_staff := coalesce(is_admin(), false)
          or exists (select 1 from venue_staff where station_id = v_order.station_id and user_id = v_uid);

  if p_action = 'cancel' then
    if v_order.user_id <> v_uid then raise exception 'Order not found'; end if;
  elsif not v_staff then
    raise exception 'FORBIDDEN|Not staff at this café';
  end if;

  if p_action = 'accept' then
    if v_order.status = 'accepted' then return to_jsonb(v_order); end if;
    if v_order.status <> 'paid' then raise exception 'BAD_TRANSITION|Order cannot be accepted'; end if;
    select prep_minutes into v_prep from stations where id = v_order.station_id;
    update cafe_orders set status = 'accepted', accepted_at = now(), staff_seen_at = coalesce(staff_seen_at, now()),
                           ready_eta = now() + make_interval(mins => v_prep)
      where id = p_order returning * into v_order;

  elsif p_action = 'ready' then
    if v_order.status = 'ready' then return to_jsonb(v_order); end if;
    if v_order.status <> 'accepted' then raise exception 'BAD_TRANSITION|Order cannot be marked ready'; end if;
    update cafe_orders set status = 'ready', ready_at = now() where id = p_order returning * into v_order;

  elsif p_action = 'collect' then
    if v_order.status = 'collected' then return to_jsonb(v_order); end if;
    if v_order.status not in ('accepted', 'ready') then raise exception 'BAD_TRANSITION|Order cannot be collected'; end if;
    update entitlements set benefit_redeemed_at = coalesce(benefit_redeemed_at, now()),
                            benefit_redeemed_by = coalesce(benefit_redeemed_by, v_uid)
      where id = v_order.entitlement_id;
    update cafe_orders set status = 'collected', collected_at = now(), closed_at = now()
      where id = p_order returning * into v_order;

  elsif p_action in ('reject', 'cancel') then
    if v_order.status in ('rejected', 'cancelled') then return to_jsonb(v_order); end if;
    if v_order.status = 'pending_payment' or v_order.status = 'payment_failed' then
      -- Nothing was taken yet. A late successful payment is refunded by confirm.
      update cafe_orders set status = 'cancelled', closed_at = now(), reject_reason = p_reason
        where id = p_order returning * into v_order;
      return to_jsonb(v_order);
    end if;
    if v_order.status <> 'paid' then
      raise exception 'BAD_TRANSITION|The café already accepted this order; contact support';
    end if;
    if exists (select 1 from package_charging_runs where entitlement_id = v_order.entitlement_id) then
      raise exception 'BAD_TRANSITION|Charging already started on this order; contact support';
    end if;
    if exists (select 1 from cafe_ledger where order_id = p_order and settlement_id is not null) then
      raise exception 'BAD_TRANSITION|Order already settled; contact support';
    end if;
    update entitlements set status = 'refunded', refunded_at = now() where id = v_order.entitlement_id;
    update cafe_ledger set voided_at = now() where order_id = p_order;
    update cafe_orders set status = case when p_action = 'reject' then 'rejected' else 'cancelled' end,
                           refund_status = 'pending', reject_reason = left(p_reason, 300), closed_at = now()
      where id = p_order returning * into v_order;
  else
    raise exception 'BAD_TRANSITION|Unknown action';
  end if;
  return to_jsonb(v_order);
end $$;

-- Backend: record the outcome of the card refund for a rejected/cancelled order.
create or replace function public.record_cafe_refund(p_order uuid, p_ok boolean, p_reference text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_order cafe_orders%rowtype;
begin
  update cafe_orders set refund_status = case when p_ok then 'refunded' else 'failed' end,
                         refund_reference = coalesce(p_reference, refund_reference)
    where id = p_order and refund_status in ('pending', 'failed')
    returning * into v_order;
  if not found then select * into v_order from cafe_orders where id = p_order; end if;
  return to_jsonb(v_order);
end $$;

-- Backend job: paid orders the café never accepted are rejected so the customer
-- is not left waiting. Returns the rejected order ids for refunding.
create or replace function public.auto_reject_stale_cafe_orders(p_minutes integer)
returns setof uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  for v_id in
    select o.id from cafe_orders o
     where o.status = 'paid' and o.paid_at < now() - make_interval(mins => p_minutes)
       and not exists (select 1 from package_charging_runs r where r.entitlement_id = o.entitlement_id)
     for update skip locked
  loop
    update entitlements set status = 'refunded', refunded_at = now()
      where id = (select entitlement_id from cafe_orders where id = v_id);
    update cafe_ledger set voided_at = now() where order_id = v_id;
    update cafe_orders set status = 'rejected', refund_status = 'pending', closed_at = now(),
                           reject_reason = 'The café did not respond in time'
      where id = v_id;
    return next v_id;
  end loop;
end $$;


-- ── 8) Settlements (admin) ─────────────────────────────────────────────────
create or replace function public.create_cafe_settlement(p_station uuid, p_until timestamptz)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_s cafe_settlements%rowtype;
begin
  if not coalesce(is_admin(), false) then raise exception 'FORBIDDEN|Admins only'; end if;
  perform 1 from stations where id = p_station for update;
  insert into cafe_settlements (station_id, period_end, order_count, gross, cafe_net, beanz_fee, created_by)
  select p_station, p_until, count(*), coalesce(sum(gross), 0), coalesce(sum(cafe_net), 0), coalesce(sum(beanz_fee), 0), auth.uid()
    from cafe_ledger l
   where l.station_id = p_station and l.settlement_id is null and l.voided_at is null and l.created_at < p_until
     -- Settle only orders whose outcome is final.
     and exists (select 1 from cafe_orders o where o.id = l.order_id and o.status in ('collected', 'accepted', 'ready'))
  returning * into v_s;
  if v_s.order_count = 0 then raise exception 'BAD_TRANSITION|Nothing to settle'; end if;
  update cafe_ledger l set settlement_id = v_s.id
   where l.station_id = p_station and l.settlement_id is null and l.voided_at is null and l.created_at < p_until
     and exists (select 1 from cafe_orders o where o.id = l.order_id and o.status in ('collected', 'accepted', 'ready'));
  return to_jsonb(v_s);
end $$;


-- ── 9) Permissions ─────────────────────────────────────────────────────────
revoke all on cafe_menu_items, cafe_orders, cafe_order_items, cafe_ledger, cafe_settlements from public;
revoke execute on function
  create_cafe_order(uuid, uuid, jsonb, text, numeric, text, text),
  confirm_cafe_order_payment(uuid, text), fail_cafe_order_payment(uuid, text),
  cafe_order_action(uuid, text, text), record_cafe_refund(uuid, boolean, text),
  auto_reject_stale_cafe_orders(integer), create_cafe_settlement(uuid, timestamptz)
from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on cafe_menu_items, cafe_orders, cafe_order_items, cafe_ledger, cafe_settlements to service_role;
    grant execute on function
      create_cafe_order(uuid, uuid, jsonb, text, numeric, text, text),
      confirm_cafe_order_payment(uuid, text), fail_cafe_order_payment(uuid, text),
      cafe_order_action(uuid, text, text), record_cafe_refund(uuid, boolean, text),
      auto_reject_stale_cafe_orders(integer), create_cafe_settlement(uuid, timestamptz)
    to service_role;
  end if;
end $$;

commit;
