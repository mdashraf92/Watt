-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — overstay handling + admin force-stop/refund
--
--  From the 4 Aug 2026 meeting (section 3, financial/commercial points):
--    - "Grace period: define the grace period allowed before a booking is
--       automatically cancelled."
--    - "Overstay detection: establish a mechanism to detect whether a user
--       remains in the parking space beyond the reserved time."
--    - "Overstay charge: consider an additional fee ... per minute of overstay."
--    - "Reset function for the charger session" / "Refund handling for
--       cancelled charging bookings" (section 2.2).
--
--  Design notes (read before deploying):
--
--  1. The overstay fee rate ships at 0 (see the app_config seed below) — no
--     customer is charged anything until Ashraf sets a real rate from the
--     Superadmin settings screen. Deliberately NOT added to the existing
--     sa_set_setting()/sa_get_settings() whitelist, because that function's
--     current body isn't tracked in this repo (carried over from the old
--     Supabase project) — blindly replacing it risks silently dropping the
--     commission/payout keys it already accepts. Instead this file adds its
--     own small, fully-owned getter/setter pair
--     (sa_get_overstay_settings / sa_set_overstay_settings), so nothing
--     already working can regress.
--
--  2. _finalize_charging_session is extended (create or replace, same
--     signature) rather than duplicated — every path that ends a session
--     (customer stop, auto-shutoff, force-stop) goes through one place, per
--     the "MONEY-CRITICAL — do not reimplement" rule already documented in
--     sessions.routes.ts.
--
--  3. "Refund" here means "release the hold, charge nothing" — not literally
--     reversing a wallet debit. In this schema, held_amount is reserved from
--     held_balance at session START; wallet_balance is only ever debited at
--     FINALIZE time (inside _finalize_charging_session). So an admin refund
--     before finalize has nothing to reverse in wallet_balance — it just
--     needs to finalize at cost=0 and release the hold. No wallet_transactions
--     row is inserted for a zero-amount event; the customer is notified
--     instead (a 0.000 OMR ledger entry would be confusing, not informative).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Schema additions ─────────────────────────────────────────────────────

alter table public.charging_sessions
  add column if not exists overstay_minutes integer not null default 0,
  add column if not exists overstay_fee     numeric(8,3) not null default 0,
  add column if not exists admin_action     text,
  add column if not exists admin_note       text;

comment on column public.charging_sessions.overstay_fee is
  'Per-minute overstay fee actually billed on this session, computed by '
  '_finalize_charging_session from app_config.overstay_fee_per_minute.';
comment on column public.charging_sessions.admin_action is
  'Set when an admin ended this session directly: force_stop or refund.';

create index if not exists idx_charging_sessions_admin_action
  on public.charging_sessions (admin_action)
  where admin_action is not null;

-- ── Settings (app_config), safe defaults ────────────────────────────────

insert into public.app_config (key, value) values
  ('overstay_grace_minutes',   '10'),
  ('overstay_fee_per_minute',  '0'),
  ('overstay_max_minutes',     '60')
on conflict (key) do nothing;

-- Superadmin-only getter/setter for just these three keys — deliberately
-- separate from sa_get_settings()/sa_set_setting() (see design note 1 above).
create or replace function public.sa_get_overstay_settings()
returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'superadmin only';
  end if;
  return jsonb_build_object(
    'overstay_grace_minutes',  (select value::int     from app_config where key = 'overstay_grace_minutes'),
    'overstay_fee_per_minute', (select value::numeric from app_config where key = 'overstay_fee_per_minute'),
    'overstay_max_minutes',    (select value::int     from app_config where key = 'overstay_max_minutes')
  );
end $function$;

create or replace function public.sa_set_overstay_settings(
  p_grace_minutes  integer,
  p_fee_per_minute numeric,
  p_max_minutes    integer
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'superadmin only';
  end if;
  if p_grace_minutes < 0 or p_max_minutes < 0 or p_fee_per_minute < 0 then
    raise exception 'settings cannot be negative';
  end if;

  update app_config set value = p_grace_minutes::text,  updated_at = now() where key = 'overstay_grace_minutes';
  update app_config set value = p_fee_per_minute::text, updated_at = now() where key = 'overstay_fee_per_minute';
  update app_config set value = p_max_minutes::text,    updated_at = now() where key = 'overstay_max_minutes';

  return public.sa_get_overstay_settings();
end $function$;

-- ── Billing: overstay fee inside the one shared finalize function ───────
-- Same as backend-billing-overrun-fix.sql's version, plus the overstay block
-- (marked ADDED below) inserted before the existing shortfall-as-debt logic,
-- so an overstay fee that exceeds the hold correctly becomes debt too.

create or replace function public._finalize_charging_session(
  p_session      uuid,
  p_kwh          numeric,
  p_battery_end  integer     default null,
  p_description  text        default null,
  p_ended_at     timestamptz default null,
  p_meter_kwh    numeric     default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_s          charging_sessions%rowtype;
  v_uid        uuid;
  v_listing    uuid;
  v_price      numeric;
  v_power      numeric;
  v_hours      numeric;
  v_kwh        numeric;
  v_cost       numeric;
  v_hold       numeric;
  v_est        numeric;
  v_shortfall  numeric := 0;
  v_flag       boolean := false;
  v_balance    numeric;
  v_ended_at   timestamptz;
  -- ADDED: overstay
  v_booked_end        timestamptz;
  v_grace_minutes     integer;
  v_fee_per_minute    numeric;
  v_max_minutes       integer;
  v_overstay_minutes  integer := 0;
  v_overstay_fee      numeric := 0;
begin
  select * into v_s from charging_sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  v_uid  := v_s.user_id;
  v_hold := coalesce(v_s.held_amount, 0);

  if v_s.status <> 'active' then
    select wallet_balance into v_balance from profiles where id = v_uid;
    return jsonb_build_object('already', true,
      'cost', v_s.cost, 'kwh', v_s.kwh_delivered, 'balance', v_balance);
  end if;

  v_listing := v_s.listing_id;
  if v_listing is null and v_s.booking_id is not null then
    select listing_id into v_listing from bookings where id = v_s.booking_id;
  end if;

  if v_listing is not null then
    select cl.price_per_kwh, cl.power_kw into v_price, v_power
      from charger_listings cl where cl.id = v_listing;
  end if;
  if v_price is null and v_s.station_id is not null then
    select s.price_per_kwh, s.power_kw into v_price, v_power
      from stations s where s.id = v_s.station_id;
  end if;
  v_price := coalesce(v_price, 0.028);
  v_power := coalesce(v_power, 22);

  v_ended_at := coalesce(p_ended_at, now());

  v_hours := greatest(extract(epoch from (v_ended_at - v_s.started_at)) / 3600.0, 0);
  v_est   := round(v_hours * v_power, 4);
  -- Meter sanity cap (unchanged): never bill more than 125% of what this
  -- charger could physically have delivered in the elapsed time.
  v_kwh   := least(greatest(coalesce(p_kwh, 0), 0), round(v_hours * v_power * 1.25, 4));
  v_cost  := round(v_kwh * v_price, 3);

  -- ADDED: overstay fee. Only applies when this session is tied to a booking
  -- with a known end time, and the session actually ran past that end time
  -- plus the configured grace period. Silently skipped for self-charge
  -- sessions (no booking_id) — there's nothing to overstay against.
  if v_s.booking_id is not null then
    select booked_end into v_booked_end from bookings where id = v_s.booking_id;
  end if;
  if v_booked_end is not null then
    v_grace_minutes  := coalesce((select value::int     from app_config where key = 'overstay_grace_minutes'), 10);
    v_fee_per_minute := coalesce((select value::numeric from app_config where key = 'overstay_fee_per_minute'), 0);
    v_max_minutes    := coalesce((select value::int     from app_config where key = 'overstay_max_minutes'), 60);
    if v_ended_at > v_booked_end + make_interval(mins => v_grace_minutes) then
      v_overstay_minutes := least(
        ceil(extract(epoch from (v_ended_at - v_booked_end - make_interval(mins => v_grace_minutes))) / 60.0)::int,
        v_max_minutes
      );
      v_overstay_fee := round(v_overstay_minutes * v_fee_per_minute, 3);
      v_cost := v_cost + v_overstay_fee;
    end if;
  end if;

  -- Overrun handling (unchanged from backend-billing-overrun-fix.sql): record
  -- the shortfall instead of capping cost and falsifying kWh. Now also covers
  -- an overstay fee that pushes the total past the hold.
  if v_hold > 0 and v_cost > v_hold then
    v_shortfall := round(v_cost - v_hold, 3);
  end if;

  if p_meter_kwh is not null and abs(p_meter_kwh - v_est) > greatest(v_est * 0.25, 0.5) then
    v_flag := true;
  end if;

  update charging_sessions set
    status            = 'completed',
    ended_at          = v_ended_at,
    kwh_delivered     = v_kwh,
    cost              = v_cost,
    hold_shortfall    = v_shortfall,
    meter_kwh         = p_meter_kwh,
    flagged_review    = v_flag,
    battery_end_pct   = coalesce(p_battery_end, battery_end_pct),
    overstay_minutes  = v_overstay_minutes,
    overstay_fee      = v_overstay_fee
  where id = p_session;

  update bookings set status = 'completed'
    where id = v_s.booking_id and status in ('confirmed', 'active');

  -- Debit the true cost (kWh + any overstay fee). May drive wallet_balance
  -- negative by exactly v_shortfall; that debt blocks further sessions via
  -- start_charging_session.
  update profiles set
    held_balance   = greatest(held_balance - v_hold, 0),
    wallet_balance = wallet_balance - v_cost,
    total_sessions = total_sessions + 1,
    total_kwh      = total_kwh + v_kwh
  where id = v_uid
  returning wallet_balance into v_balance;

  insert into wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  values
    (v_uid, 'charge', -v_cost, v_balance,
     coalesce(p_description, 'Charging session'), p_session::text);

  if v_listing is not null then
    perform public.credit_host_earning(v_listing, p_session::text, v_cost);
  end if;

  return jsonb_build_object('cost', v_cost, 'kwh', v_kwh, 'balance', v_balance,
    'released', v_hold, 'shortfall', v_shortfall, 'flagged', v_flag, 'already', false,
    'overstay_minutes', v_overstay_minutes, 'overstay_fee', v_overstay_fee);
end $function$;

-- ── Admin: force-stop a stuck session (bills normally, reuses the above) ─

create or replace function public.admin_force_stop_session(p_session uuid, p_reason text)
returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  v_result := public._finalize_charging_session(
    p_session, null, null,
    'Force-stopped by admin' || case when p_reason is not null then ': ' || p_reason else '' end,
    now(), null
  );

  update charging_sessions set admin_action = 'force_stop', admin_note = p_reason
    where id = p_session;

  return v_result;
end $function$;

-- ── Admin: refund a session (no charge, release the hold, cancel booking) ─

create or replace function public.admin_refund_charging_session(p_session uuid, p_reason text)
returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_s       charging_sessions%rowtype;
  v_uid     uuid;
  v_hold    numeric;
  v_balance numeric;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into v_s from charging_sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;

  if v_s.status <> 'active' then
    select wallet_balance into v_balance from profiles where id = v_s.user_id;
    return jsonb_build_object('already', true, 'balance', v_balance);
  end if;

  v_uid  := v_s.user_id;
  v_hold := coalesce(v_s.held_amount, 0);

  update charging_sessions set
    status         = 'interrupted',
    ended_at       = now(),
    cost           = 0,
    hold_shortfall = 0,
    admin_action   = 'refund',
    admin_note     = p_reason
  where id = p_session;

  update bookings set status = 'cancelled', cancellation_reason = coalesce(p_reason, 'Refunded by admin')
    where id = v_s.booking_id and status in ('confirmed', 'active');

  -- No charge was ever taken from wallet_balance (only held_balance reserved
  -- it) — releasing the hold is the entire refund. See design note 3 above.
  update profiles set held_balance = greatest(held_balance - v_hold, 0)
    where id = v_uid
    returning wallet_balance into v_balance;

  return jsonb_build_object('already', false, 'released', v_hold, 'balance', v_balance);
end $function$;
