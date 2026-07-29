-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — fix silent revenue loss on session overruns
--
--  Previously _finalize_charging_session did this when actual cost exceeded
--  the pre-session hold:
--
--      if v_hold > 0 and v_cost > v_hold then
--        v_cost := v_hold;
--        v_kwh  := round(v_cost / nullif(v_price, 0), 4);   -- ← falsified
--
--  Two separate problems:
--
--   1. The company absorbed the overrun, AND kwh_delivered was rewritten
--      downward to stay consistent with the capped cost. The loss was
--      therefore invisible in our own reporting — there was no way to measure
--      how much revenue was being given away.
--
--   2. credit_host_earning() was called with the capped cost, so the HOST
--      silently under-earned on exactly the sessions where they delivered the
--      most power. Hosts are far harder to replace than customers.
--
--  After this change the session records what actually happened: true kWh,
--  true cost, host paid on the true cost. Any amount beyond the hold is
--  recorded in hold_shortfall and left as a negative wallet balance (a debt).
--
--  Debt self-enforces with no new code: start_charging_session computes
--  available = wallet_balance - held_balance and refuses to start a session
--  when that is below the required hold. A user carrying a debt therefore
--  cannot start another session until they top up.
--
--  Runaway exposure is already bounded upstream — v_kwh is capped at 125% of
--  the theoretical maximum for the elapsed time, so a faulty meter cannot
--  produce an unbounded charge.
-- ═══════════════════════════════════════════════════════════════════════════

-- How much of this session's cost exceeded the hold (0 for normal sessions).
-- Makes the previously-invisible loss queryable.
alter table public.charging_sessions
  add column if not exists hold_shortfall numeric(8,3) not null default 0;

comment on column public.charging_sessions.hold_shortfall is
  'Amount by which the final cost exceeded held_amount. >0 means the wallet was '
  'driven negative by this session; the user cannot start another until settled.';

-- Find sessions that ran over, for admin review / reporting.
create index if not exists idx_charging_sessions_shortfall
  on public.charging_sessions (created_at desc)
  where hold_shortfall > 0;


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
  v_s         charging_sessions%rowtype;
  v_uid       uuid;
  v_listing   uuid;
  v_price     numeric;
  v_power     numeric;
  v_hours     numeric;
  v_kwh       numeric;
  v_cost      numeric;
  v_hold      numeric;
  v_est       numeric;
  v_shortfall numeric := 0;
  v_flag      boolean := false;
  v_balance   numeric;
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

  v_hours := greatest(extract(epoch from (coalesce(p_ended_at, now()) - v_s.started_at)) / 3600.0, 0);
  v_est   := round(v_hours * v_power, 4);
  -- Meter sanity cap (unchanged): never bill more than 125% of what this
  -- charger could physically have delivered in the elapsed time.
  v_kwh   := least(greatest(coalesce(p_kwh, 0), 0), round(v_hours * v_power * 1.25, 4));
  v_cost  := round(v_kwh * v_price, 3);

  -- CHANGED: record the overrun instead of capping cost and falsifying kWh.
  -- kwh_delivered and cost now always reflect what actually happened.
  if v_hold > 0 and v_cost > v_hold then
    v_shortfall := round(v_cost - v_hold, 3);
  end if;

  if p_meter_kwh is not null and abs(p_meter_kwh - v_est) > greatest(v_est * 0.25, 0.5) then
    v_flag := true;
  end if;

  update charging_sessions set
    status          = 'completed',
    ended_at        = coalesce(p_ended_at, now()),
    kwh_delivered   = v_kwh,
    cost            = v_cost,
    hold_shortfall  = v_shortfall,
    meter_kwh       = p_meter_kwh,
    flagged_review  = v_flag,
    battery_end_pct = coalesce(p_battery_end, battery_end_pct)
  where id = p_session;

  update bookings set status = 'completed'
    where id = v_s.booking_id and status in ('confirmed', 'active');

  -- Debit the true cost. This may drive wallet_balance negative by exactly
  -- v_shortfall; that debt blocks further sessions via start_charging_session.
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

  -- CHANGED: host is paid on the true cost, not the capped one.
  if v_listing is not null then
    perform public.credit_host_earning(v_listing, p_session::text, v_cost);
  end if;

  return jsonb_build_object('cost', v_cost, 'kwh', v_kwh, 'balance', v_balance,
    'released', v_hold, 'shortfall', v_shortfall, 'flagged', v_flag, 'already', false);
end $function$;
