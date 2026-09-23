-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — Mobile Charging (roadside rescue)
--
--  A customer strands with a low battery, requests a charge, and one of our
--  vans drives out and delivers kWh on the spot. Money works exactly like a
--  station session — snapshot the price, place a wallet hold, settle on
--  completion — so this file deliberately mirrors start_charging_session /
--  _finalize_charging_session rather than inventing a second money model.
--
--  Pricing = a fixed callout fee + per-kWh, both snapshotted onto the request
--  at creation time so a later admin price change never re-prices work already
--  agreed with a customer.
--
--  A NOTE ON ENFORCEMENT. The old Supabase-era tables carry protect_*_columns
--  triggers that bail out unless current_user is 'authenticated'/'anon'. Our
--  Node backend connects as the database owner, so those triggers no-op today —
--  they are legacy. The real gate is (a) these SECURITY DEFINER functions,
--  which check auth.uid() and role themselves, and (b) requireRole in the API.
--  No look-alike trigger is added here; a guard that never fires is worse than
--  no guard, because it reads like protection.
--
--  Run ONCE on the PostgreSQL server, after backend-compat.sql.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1) The operator role ───────────────────────────────────────────────────
-- Van drivers are staff, not customers and not hosts: they see a job queue and
-- nothing else. Additive — no existing row changes value.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer', 'host', 'investor', 'operator', 'admin', 'superadmin'));


-- ── 2) Distance helper ─────────────────────────────────────────────────────
-- PostGIS is not installed and this does not justify installing it. Great-circle
-- distance in km; accurate to well under a percent at Oman's scale.
create or replace function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
  language sql immutable parallel safe
as $function$
  select 6371.0 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$function$;


-- ── 3) The fleet ───────────────────────────────────────────────────────────
-- One van per driver. capacity_kwh is what the van's pack holds; current_kwh is
-- what is left to sell right now, so dispatch never sends a van that cannot
-- fulfil the order.
create table if not exists public.service_vans (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  plate         text not null default '',
  operator_id   uuid references public.profiles(id) on delete set null,
  capacity_kwh  numeric(8,3) not null default 40,
  current_kwh   numeric(8,3) not null default 40,
  status        text not null default 'offline',
  governorate   text,
  -- Last known position. Deliberately a single point, not a history table:
  -- tracking a named employee's movements needs a reason, and "we might want
  -- it later" is not one. Per-transition coordinates live in the event log.
  last_lat      double precision,
  last_lng      double precision,
  last_seen_at  timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint service_vans_status_chk
    check (status in ('offline', 'available', 'on_job', 'maintenance')),
  constraint service_vans_kwh_chk
    check (current_kwh >= 0 and current_kwh <= capacity_kwh)
);

create unique index if not exists idx_service_vans_operator
  on public.service_vans (operator_id) where operator_id is not null;
create index if not exists idx_service_vans_dispatchable
  on public.service_vans (status) where is_active and status = 'available';


-- ── 4) The requests ────────────────────────────────────────────────────────
create table if not exists public.mobile_charge_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  van_id          uuid references public.service_vans(id) on delete set null,
  operator_id     uuid references public.profiles(id) on delete set null,

  pickup_lat      double precision not null,
  pickup_lng      double precision not null,
  address_text    text not null default '',
  governorate     text,
  notes           text,

  -- Snapshot of the customer's car so the driver brings the right cable, and so
  -- a later profile edit does not rewrite history.
  car_make        text,
  car_model       text,
  connector_type  text,

  -- Snapshot of the deal. Never re-read from app_config after this row exists.
  requested_kwh   numeric(8,3) not null,
  callout_fee     numeric(10,3) not null,
  price_per_kwh   numeric(10,3) not null,
  estimated_cost  numeric(10,3) not null,
  held_amount     numeric(10,3) not null default 0,

  kwh_delivered   numeric(8,3),
  cost            numeric(10,3),
  meter_kwh       numeric(8,3),
  battery_end_pct integer,
  flagged_review  boolean not null default false,
  cancel_fee      numeric(10,3) not null default 0,

  status          text not null default 'pending',
  -- Dispatch state: who the job is currently dangled in front of, and until when.
  offered_van_id  uuid references public.service_vans(id) on delete set null,
  offer_expires_at timestamptz,
  declined_van_ids uuid[] not null default '{}',

  eta_at          timestamptz,
  assigned_at     timestamptz,
  en_route_at     timestamptz,
  arrived_at      timestamptz,
  started_at      timestamptz,
  ended_at        timestamptz,
  cancelled_at    timestamptz,
  cancellation_reason text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint mobile_charge_requests_status_chk check (status in (
    'pending', 'offered', 'assigned', 'en_route', 'arrived',
    'charging', 'completed', 'cancelled', 'no_van'
  ))
);

create index if not exists idx_mcr_user      on public.mobile_charge_requests (user_id, created_at desc);
create index if not exists idx_mcr_van       on public.mobile_charge_requests (van_id, created_at desc);
create index if not exists idx_mcr_open      on public.mobile_charge_requests (status)
  where status in ('pending', 'offered', 'assigned', 'en_route', 'arrived', 'charging');

-- One live request per customer. Two vans rolling to the same person is a
-- refund and an apology, so make it impossible rather than merely unlikely.
create unique index if not exists idx_mcr_one_active_per_user
  on public.mobile_charge_requests (user_id)
  where status in ('pending', 'offered', 'assigned', 'en_route', 'arrived', 'charging');


-- ── 5) The audit trail ─────────────────────────────────────────────────────
-- Real money plus a human driver means disputes. Every transition, who caused
-- it, and where they were.
create table if not exists public.mobile_charge_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.mobile_charge_requests(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor_id    uuid references public.profiles(id) on delete set null,
  lat         double precision,
  lng         double precision,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_mce_request on public.mobile_charge_events (request_id, created_at);


-- ── 6) Ratings ─────────────────────────────────────────────────────────────
-- session_ratings is bound to charging_sessions; a mobile job is not one.
create table if not exists public.mobile_charge_ratings (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null unique references public.mobile_charge_requests(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  operator_id uuid references public.profiles(id) on delete set null,
  rating      integer not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);


-- ── 7) updated_at ──────────────────────────────────────────────────────────
drop trigger if exists trg_mcr_updated_at on public.mobile_charge_requests;
create trigger trg_mcr_updated_at before update on public.mobile_charge_requests
  for each row execute function public.set_updated_at();

drop trigger if exists trg_vans_updated_at on public.service_vans;
create trigger trg_vans_updated_at before update on public.service_vans
  for each row execute function public.set_updated_at();

-- NOTE: deliberately NO notify_row_change trigger on either table. That function
-- broadcasts to every connected socket (see src/realtime/socket.ts), which would
-- publish our drivers' live coordinates to the whole user base. Van positions go
-- out over per-job socket rooms instead.


-- ── 8) Configuration ───────────────────────────────────────────────────────
insert into public.app_config (key, value) values
  ('mobile_enabled',            'true'),
  ('mobile_callout_fee',        '5.000'),
  ('mobile_price_per_kwh',      '0.120'),
  ('mobile_hold_buffer',        '1.15'),
  ('mobile_min_kwh',            '5'),
  ('mobile_max_kwh',            '30'),
  ('mobile_cancel_fee',         '2.000'),
  ('mobile_service_radius_km',  '60'),
  ('mobile_offer_timeout_s',    '60'),
  ('mobile_request_expiry_min', '15')
on conflict (key) do nothing;


-- ── 9) Request a mobile charge ─────────────────────────────────────────────
-- Mirrors start_charging_session: snapshot the price, size the hold, refuse
-- politely (and machine-readably) when the wallet cannot cover it.
create or replace function public.request_mobile_charge(
  p_lat   double precision,
  p_lng   double precision,
  p_kwh   numeric,
  p_notes text default null,
  p_address text default null
) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid       uuid := auth.uid();
  v_p         profiles%rowtype;
  v_enabled   text;
  v_fee       numeric;
  v_price     numeric;
  v_buffer    numeric;
  v_min_kwh   numeric;
  v_max_kwh   numeric;
  v_radius    numeric;
  v_est       numeric;
  v_hold      numeric;
  v_available numeric;
  v_id        uuid;
  v_near      boolean;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;

  select coalesce((select value from app_config where key = 'mobile_enabled'), 'false') into v_enabled;
  if lower(v_enabled) <> 'true' then
    raise exception 'DISABLED|Mobile charging is not available right now' using errcode = 'P0001';
  end if;

  select * into v_p from profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found' using errcode = 'P0001'; end if;

  -- Oman, generously padded — the same box the routing proxy enforces.
  if p_lat < 16.0 or p_lat > 27.0 or p_lng < 51.0 or p_lng > 60.5 then
    raise exception 'OUT_OF_AREA|Location is outside the service area' using errcode = 'P0001';
  end if;

  select coalesce((select value::numeric from app_config where key = 'mobile_callout_fee'),       5.000),
         coalesce((select value::numeric from app_config where key = 'mobile_price_per_kwh'),     0.120),
         coalesce((select value::numeric from app_config where key = 'mobile_hold_buffer'),       1.15),
         coalesce((select value::numeric from app_config where key = 'mobile_min_kwh'),           5),
         coalesce((select value::numeric from app_config where key = 'mobile_max_kwh'),           30),
         coalesce((select value::numeric from app_config where key = 'mobile_service_radius_km'), 60)
    into v_fee, v_price, v_buffer, v_min_kwh, v_max_kwh, v_radius;

  if p_kwh < v_min_kwh or p_kwh > v_max_kwh then
    raise exception 'BAD_KWH|min=%|max=%', v_min_kwh, v_max_kwh using errcode = 'P0001';
  end if;

  -- Refuse up front if no van could ever reach this pin, rather than taking the
  -- money and timing out fifteen minutes later.
  select exists (
    select 1 from service_vans v
     where v.is_active and v.last_lat is not null
       and public.haversine_km(v.last_lat, v.last_lng, p_lat, p_lng) <= v_radius
  ) into v_near;
  if not v_near then
    raise exception 'OUT_OF_RANGE|No van covers this location' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from mobile_charge_requests
     where user_id = v_uid
       and status in ('pending','offered','assigned','en_route','arrived','charging')
  ) then
    raise exception 'ALREADY_ACTIVE|You already have a mobile charge in progress' using errcode = 'P0001';
  end if;

  v_est  := round(v_fee + (p_kwh * v_price), 3);
  v_hold := round(v_est * v_buffer, 3);

  v_available := coalesce(v_p.wallet_balance, 0) - coalesce(v_p.held_balance, 0);
  if v_available < v_hold then
    -- Same shape as start_charging_session, so the app's existing shortfall →
    -- card top-up flow handles it without a second code path.
    raise exception 'INSUFFICIENT_BALANCE|required=%|available=%|shortfall=%',
      v_hold, v_available, round(v_hold - v_available, 3)
      using errcode = 'P0001';
  end if;

  update profiles set held_balance = held_balance + v_hold where id = v_uid;

  insert into mobile_charge_requests (
    user_id, pickup_lat, pickup_lng, address_text, notes,
    car_make, car_model, connector_type,
    requested_kwh, callout_fee, price_per_kwh, estimated_cost, held_amount, status
  ) values (
    v_uid, p_lat, p_lng, coalesce(p_address, ''), p_notes,
    v_p.car_make, v_p.car_model, v_p.connector_type,
    p_kwh, v_fee, v_price, v_est, v_hold, 'pending'
  ) returning id into v_id;

  insert into mobile_charge_events (request_id, to_status, actor_id, lat, lng)
  values (v_id, 'pending', v_uid, p_lat, p_lng);

  return jsonb_build_object(
    'request_id', v_id, 'held_amount', v_hold, 'estimated_cost', v_est,
    'callout_fee', v_fee, 'price_per_kwh', v_price
  );
end $function$;


-- ── 10) Dispatch ───────────────────────────────────────────────────────────
-- Nearest available van gets first refusal. Called on a cron tick and again
-- immediately after a request is created, so the first offer goes out at once
-- instead of waiting up to a minute.
--
-- Returns the work the caller must do out-of-band (pushes), because sending a
-- notification is not the database's job.
create or replace function public.mobile_dispatch_tick()
returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_timeout  integer;
  v_expiry   integer;
  v_radius   numeric;
  v_r        mobile_charge_requests%rowtype;
  v_van      service_vans%rowtype;
  v_offers   jsonb := '[]'::jsonb;
  v_expired  jsonb := '[]'::jsonb;
begin
  select coalesce((select value::integer from app_config where key = 'mobile_offer_timeout_s'),    60),
         coalesce((select value::integer from app_config where key = 'mobile_request_expiry_min'), 15),
         coalesce((select value::numeric from app_config where key = 'mobile_service_radius_km'),  60)
    into v_timeout, v_expiry, v_radius;

  -- a) Offers nobody answered: remember the silence as a decline so the same van
  --    is not asked twice, and fall through to re-offer below.
  update mobile_charge_requests
     set status = 'pending',
         declined_van_ids = declined_van_ids || offered_van_id,
         offered_van_id = null,
         offer_expires_at = null
   where status = 'offered' and offer_expires_at < now() and offered_van_id is not null;

  -- b) Anything still unclaimed past the expiry window is given up on, and the
  --    customer's money is released. Reuses cancel so there is one refund path.
  for v_r in
    select * from mobile_charge_requests
     where status in ('pending', 'offered')
       and created_at < now() - make_interval(mins => v_expiry)
     for update
  loop
    update profiles set held_balance = greatest(held_balance - v_r.held_amount, 0)
      where id = v_r.user_id;
    update mobile_charge_requests
       set status = 'no_van', cancelled_at = now(),
           cancellation_reason = 'No van available', offered_van_id = null, offer_expires_at = null
     where id = v_r.id;
    insert into mobile_charge_events (request_id, from_status, to_status, note)
    values (v_r.id, v_r.status, 'no_van', 'expired without a taker');
    v_expired := v_expired || jsonb_build_object('request_id', v_r.id, 'user_id', v_r.user_id);
  end loop;

  -- c) Offer each waiting request to its nearest untried van.
  for v_r in
    select * from mobile_charge_requests
     where status = 'pending'
     order by created_at
     for update
  loop
    select v.* into v_van
      from service_vans v
     where v.is_active
       and v.status = 'available'
       and v.operator_id is not null
       and v.last_lat is not null
       and v.current_kwh >= v_r.requested_kwh
       and not (v.id = any (v_r.declined_van_ids))
       and public.haversine_km(v.last_lat, v.last_lng, v_r.pickup_lat, v_r.pickup_lng) <= v_radius
     order by public.haversine_km(v.last_lat, v.last_lng, v_r.pickup_lat, v_r.pickup_lng)
     limit 1;

    if found then
      update mobile_charge_requests
         set status = 'offered',
             offered_van_id = v_van.id,
             offer_expires_at = now() + make_interval(secs => v_timeout)
       where id = v_r.id;

      insert into mobile_charge_events (request_id, from_status, to_status, note)
      values (v_r.id, v_r.status, 'offered', 'offered to ' || v_van.label);

      v_offers := v_offers || jsonb_build_object(
        'request_id',  v_r.id,
        'van_id',      v_van.id,
        'operator_id', v_van.operator_id,
        'expires_in_s', v_timeout,
        'distance_km', round(public.haversine_km(
                         v_van.last_lat, v_van.last_lng, v_r.pickup_lat, v_r.pickup_lng)::numeric, 1)
      );
    end if;
  end loop;

  return jsonb_build_object('offers', v_offers, 'expired', v_expired);
end $function$;


-- ── 11) Operator accepts / declines an offer ───────────────────────────────
create or replace function public.accept_mobile_charge(p_request uuid)
returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_van service_vans%rowtype;
  v_r   mobile_charge_requests%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;

  select * into v_van from service_vans where operator_id = v_uid for update;
  if not found then raise exception 'NO_VAN|No van is assigned to you' using errcode = 'P0001'; end if;

  select * into v_r from mobile_charge_requests where id = p_request for update;
  if not found then raise exception 'Request not found' using errcode = 'P0001'; end if;

  -- Losing the race to another van is normal, not an error worth alarming about.
  if v_r.status <> 'offered' or v_r.offered_van_id is distinct from v_van.id then
    return jsonb_build_object('taken', true, 'status', v_r.status);
  end if;
  if v_r.offer_expires_at < now() then
    return jsonb_build_object('taken', true, 'status', 'expired');
  end if;

  update mobile_charge_requests
     set status = 'assigned', van_id = v_van.id, operator_id = v_uid,
         assigned_at = now(), offered_van_id = null, offer_expires_at = null
   where id = p_request;

  update service_vans set status = 'on_job' where id = v_van.id;

  insert into mobile_charge_events (request_id, from_status, to_status, actor_id, lat, lng)
  values (p_request, 'offered', 'assigned', v_uid, v_van.last_lat, v_van.last_lng);

  return jsonb_build_object('taken', false, 'status', 'assigned',
    'request_id', p_request, 'user_id', v_r.user_id);
end $function$;


create or replace function public.decline_mobile_charge(p_request uuid)
returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_van service_vans%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  select * into v_van from service_vans where operator_id = v_uid;
  if not found then raise exception 'NO_VAN|No van is assigned to you' using errcode = 'P0001'; end if;

  update mobile_charge_requests
     set status = 'pending',
         declined_van_ids = declined_van_ids || v_van.id,
         offered_van_id = null, offer_expires_at = null
   where id = p_request and status = 'offered' and offered_van_id = v_van.id;

  insert into mobile_charge_events (request_id, from_status, to_status, actor_id, note)
  select p_request, 'offered', 'pending', v_uid, 'declined by ' || v_van.label
   where exists (select 1 from mobile_charge_requests where id = p_request);

  return jsonb_build_object('declined', true);
end $function$;


-- ── 12) Driving the job forward ────────────────────────────────────────────
-- en_route → arrived → charging. Strictly forward, one step at a time, so a
-- fat-fingered tap cannot reopen a job or skip the arrival record.
create or replace function public.set_mobile_charge_status(
  p_request uuid,
  p_status  text,
  p_lat     double precision default null,
  p_lng     double precision default null,
  p_eta_min integer default null
) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_r    mobile_charge_requests%rowtype;
  v_ok   boolean;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  select role into v_role from profiles where id = v_uid;

  select * into v_r from mobile_charge_requests where id = p_request for update;
  if not found then raise exception 'Request not found' using errcode = 'P0001'; end if;

  if v_r.operator_id is distinct from v_uid and v_role not in ('admin', 'superadmin') then
    raise exception 'FORBIDDEN|not your job' using errcode = 'P0001';
  end if;

  v_ok := (p_status = 'en_route' and v_r.status = 'assigned')
       or (p_status = 'arrived'  and v_r.status = 'en_route')
       or (p_status = 'charging' and v_r.status = 'arrived');
  if not v_ok then
    raise exception 'BAD_TRANSITION|%|%', v_r.status, p_status using errcode = 'P0001';
  end if;

  update mobile_charge_requests
     set status      = p_status,
         en_route_at = case when p_status = 'en_route' then now() else en_route_at end,
         arrived_at  = case when p_status = 'arrived'  then now() else arrived_at  end,
         started_at  = case when p_status = 'charging' then now() else started_at  end,
         eta_at      = case when p_eta_min is not null
                            then now() + make_interval(mins => p_eta_min) else eta_at end
   where id = p_request;

  insert into mobile_charge_events (request_id, from_status, to_status, actor_id, lat, lng)
  values (p_request, v_r.status, p_status, v_uid, p_lat, p_lng);

  return jsonb_build_object('status', p_status, 'user_id', v_r.user_id);
end $function$;


-- ── 13) Complete and bill ──────────────────────────────────────────────────
-- Mirrors _finalize_charging_session: cost capped at the hold, hold released,
-- wallet debited, one ledger row. No host split — the van is ours.
create or replace function public.complete_mobile_charge(
  p_request     uuid,
  p_kwh         numeric,
  p_battery_end integer default null,
  p_meter_kwh   numeric default null
) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_role    text;
  v_r       mobile_charge_requests%rowtype;
  v_kwh     numeric;
  v_cost    numeric;
  v_flag    boolean := false;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  select role into v_role from profiles where id = v_uid;

  select * into v_r from mobile_charge_requests where id = p_request for update;
  if not found then raise exception 'Request not found' using errcode = 'P0001'; end if;

  if v_r.operator_id is distinct from v_uid and v_role not in ('admin', 'superadmin') then
    raise exception 'FORBIDDEN|not your job' using errcode = 'P0001';
  end if;

  -- Idempotent: a retried "complete" from a van with a flaky signal must not
  -- bill twice.
  if v_r.status = 'completed' then
    select wallet_balance into v_balance from profiles where id = v_r.user_id;
    return jsonb_build_object('already', true, 'cost', v_r.cost,
      'kwh', v_r.kwh_delivered, 'balance', v_balance);
  end if;
  if v_r.status <> 'charging' then
    raise exception 'BAD_TRANSITION|%|completed', v_r.status using errcode = 'P0001';
  end if;

  -- A driver cannot invent kWh beyond what was ordered, and the total can never
  -- exceed what the customer's hold authorised.
  v_kwh  := least(greatest(coalesce(p_kwh, 0), 0), v_r.requested_kwh);
  v_cost := round(v_r.callout_fee + (v_kwh * v_r.price_per_kwh), 3);
  if v_cost > v_r.held_amount then
    v_cost := v_r.held_amount;
  end if;

  -- Same divergence rule as station sessions: flag rather than block, so the
  -- customer is not held up while someone investigates.
  if p_meter_kwh is not null
     and abs(p_meter_kwh - v_kwh) > greatest(v_kwh * 0.25, 0.5) then
    v_flag := true;
  end if;

  update mobile_charge_requests set
    status          = 'completed',
    ended_at        = now(),
    kwh_delivered   = v_kwh,
    cost            = v_cost,
    meter_kwh       = p_meter_kwh,
    battery_end_pct = coalesce(p_battery_end, battery_end_pct),
    flagged_review  = v_flag
  where id = p_request;

  update profiles set
    held_balance   = greatest(held_balance - v_r.held_amount, 0),
    wallet_balance = wallet_balance - v_cost,
    total_sessions = total_sessions + 1,
    total_kwh      = total_kwh + v_kwh
  where id = v_r.user_id
  returning wallet_balance into v_balance;

  insert into wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  values
    (v_r.user_id, 'charge', -v_cost, v_balance, 'Mobile charging', p_request::text);

  -- The van sold what it delivered; free it for the next job.
  if v_r.van_id is not null then
    update service_vans
       set current_kwh = greatest(current_kwh - v_kwh, 0),
           status = case when status = 'on_job' then 'available' else status end
     where id = v_r.van_id;
  end if;

  insert into mobile_charge_events (request_id, from_status, to_status, actor_id, note)
  values (p_request, 'charging', 'completed', v_uid, v_kwh || ' kWh delivered');

  return jsonb_build_object('already', false, 'cost', v_cost, 'kwh', v_kwh,
    'balance', v_balance, 'released', v_r.held_amount, 'flagged', v_flag,
    'user_id', v_r.user_id);
end $function$;


-- ── 14) Cancel ─────────────────────────────────────────────────────────────
-- Free before a van moves. Once one is on the road someone's time and diesel
-- have been spent, so a fee applies — charged from the hold, remainder released.
create or replace function public.cancel_mobile_charge(
  p_request uuid,
  p_reason  text default null
) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_role    text;
  v_r       mobile_charge_requests%rowtype;
  v_fee     numeric := 0;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  select role into v_role from profiles where id = v_uid;

  select * into v_r from mobile_charge_requests where id = p_request for update;
  if not found then raise exception 'Request not found' using errcode = 'P0001'; end if;

  if v_r.user_id <> v_uid and v_role not in ('admin', 'superadmin') then
    raise exception 'FORBIDDEN|not your request' using errcode = 'P0001';
  end if;

  if v_r.status in ('completed', 'cancelled', 'no_van') then
    return jsonb_build_object('already', true, 'status', v_r.status);
  end if;

  -- Once the charge itself has begun, cancelling is meaningless — the driver
  -- must complete it so the delivered kWh are billed.
  if v_r.status = 'charging' then
    raise exception 'TOO_LATE|Charging has already started' using errcode = 'P0001';
  end if;

  if v_r.status in ('en_route', 'arrived') and v_role not in ('admin', 'superadmin') then
    select coalesce((select value::numeric from app_config where key = 'mobile_cancel_fee'), 0)
      into v_fee;
    v_fee := least(v_fee, v_r.held_amount);
  end if;

  update profiles set
    held_balance   = greatest(held_balance - v_r.held_amount, 0),
    wallet_balance = wallet_balance - v_fee
  where id = v_r.user_id
  returning wallet_balance into v_balance;

  if v_fee > 0 then
    insert into wallet_transactions
      (user_id, type, amount, balance_after, description, reference_id)
    values
      (v_r.user_id, 'charge', -v_fee, v_balance, 'Mobile charging — cancellation fee', p_request::text);
  end if;

  update mobile_charge_requests
     set status = 'cancelled', cancelled_at = now(), cancel_fee = v_fee,
         cancellation_reason = p_reason, offered_van_id = null, offer_expires_at = null
   where id = p_request;

  if v_r.van_id is not null then
    update service_vans set status = 'available' where id = v_r.van_id and status = 'on_job';
  end if;

  insert into mobile_charge_events (request_id, from_status, to_status, actor_id, note)
  values (p_request, v_r.status, 'cancelled', v_uid, p_reason);

  return jsonb_build_object('already', false, 'status', 'cancelled',
    'fee', v_fee, 'released', v_r.held_amount, 'balance', v_balance,
    'operator_id', v_r.operator_id);
end $function$;


-- ── 15) Rate the job ───────────────────────────────────────────────────────
create or replace function public.rate_mobile_charge(
  p_request uuid,
  p_rating  integer,
  p_comment text default null
) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_r   mobile_charge_requests%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'BAD_RATING|%', p_rating using errcode = 'P0001';
  end if;

  select * into v_r from mobile_charge_requests where id = p_request and user_id = v_uid;
  if not found then raise exception 'Request not found' using errcode = 'P0001'; end if;
  if v_r.status <> 'completed' then
    raise exception 'NOT_COMPLETED|%', v_r.status using errcode = 'P0001';
  end if;

  insert into mobile_charge_ratings (request_id, user_id, operator_id, rating, comment)
  values (p_request, v_uid, v_r.operator_id, p_rating, p_comment)
  on conflict (request_id) do update
    set rating = excluded.rating, comment = excluded.comment;

  return jsonb_build_object('rated', true);
end $function$;


-- ── 16) Mobile charging in the admin dashboard ─────────────────────────────
-- Added as its own 'mobile' key rather than folded into the existing revenue
-- totals. Those figures have always meant "station and private-charger
-- sessions"; quietly widening them would rewrite every past number on the
-- dashboard overnight and nobody would know why the trend jumped.
create or replace function public.get_admin_analytics() returns jsonb
    language plpgsql stable security definer
    set search_path to 'public'
as $function$
declare
  v_today timestamptz := date_trunc('day', now());
  v_month timestamptz := date_trunc('month', now());
  v_result jsonb;
begin
  if not (select public.is_admin()) then
    raise exception 'Permission denied: admin only';
  end if;

  select jsonb_build_object(
    'today', (
      select jsonb_build_object(
        'revenue',  coalesce(sum(cost), 0),
        'sessions', count(*),
        'kwh',      coalesce(sum(kwh_delivered), 0))
      from charging_sessions
      where status = 'completed' and ended_at >= v_today),
    'month', (
      select jsonb_build_object(
        'revenue',  coalesce(sum(cost), 0),
        'sessions', count(*),
        'kwh',      coalesce(sum(kwh_delivered), 0))
      from charging_sessions
      where status = 'completed' and ended_at >= v_month),
    'all_time', (
      select jsonb_build_object(
        'revenue',  coalesce(sum(cost), 0),
        'sessions', count(*),
        'kwh',      coalesce(sum(kwh_delivered), 0))
      from charging_sessions
      where status = 'completed'),
    'flagged', (
      select count(*) from charging_sessions where flagged_review = true),
    'top_chargers', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select coalesce(st.name, cl.station_name, cl.address, 'Charger') as name,
               count(*)                as sessions,
               coalesce(sum(cs.cost),0) as revenue
        from charging_sessions cs
        left join stations st        on st.id = cs.station_id
        left join charger_listings cl on cl.id = cs.listing_id
        where cs.status = 'completed' and cs.ended_at >= v_month
        group by 1
        order by revenue desc
        limit 5
      ) t),
    'mobile', jsonb_build_object(
      'today', (
        select jsonb_build_object(
          'revenue', coalesce(sum(cost), 0),
          'jobs',    count(*),
          'kwh',     coalesce(sum(kwh_delivered), 0))
        from mobile_charge_requests
        where status = 'completed' and ended_at >= v_today),
      'month', (
        select jsonb_build_object(
          'revenue', coalesce(sum(cost), 0),
          'jobs',    count(*),
          'kwh',     coalesce(sum(kwh_delivered), 0))
        from mobile_charge_requests
        where status = 'completed' and ended_at >= v_month),
      'all_time', (
        select jsonb_build_object(
          'revenue', coalesce(sum(cost), 0),
          'jobs',    count(*),
          'kwh',     coalesce(sum(kwh_delivered), 0))
        from mobile_charge_requests
        where status = 'completed'),
      'flagged',   (select count(*) from mobile_charge_requests where flagged_review),
      -- Requests nobody could serve. The clearest signal that the fleet is too
      -- small or badly placed, so it belongs on the dashboard, not in a log.
      'unserved',  (select count(*) from mobile_charge_requests
                     where status = 'no_van' and created_at >= v_month),
      'vans_active', (select count(*) from service_vans where is_active and status <> 'offline'))
  ) into v_result;

  return v_result;
end $function$;
