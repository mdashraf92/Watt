-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — three-state service status for stations AND private listings
--
--  The brand map icons distinguish three states: in service, out of service,
--  and under maintenance. Two things needed changing, because the map draws
--  markers from two unrelated tables:
--
--    public.stations         — the company network. Has a station_status enum
--                              (available/busy/fault/offline) but no owner
--                              column, so only admin/superadmin can manage it.
--    public.charger_listings — private home chargers, owned via host_id. Had
--                              only a boolean is_available, so "under
--                              maintenance" was not expressible at all.
--
--  Investors own listings, NOT stations — so "investor can change the status"
--  means their own listing. Admin/superadmin can change either.
--
--  Icon mapping used by the app:
--      available, busy    → Station icon           (in service)
--      fault, offline     → Out of Service icon
--      under_maintenance  → Under Maintenance icon
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Stations ────────────────────────────────────────────────────────────
-- Purely additive: no existing row changes value.
alter type public.station_status add value if not exists 'under_maintenance';


-- ── 2) Private listings ────────────────────────────────────────────────────
-- New status column alongside is_available. is_available is KEPT and kept in
-- sync (it is read in ~20 places across app and backend); status is the richer
-- source of truth. Anything not 'available' means not bookable.
alter table public.charger_listings
  add column if not exists status text not null default 'available';

do $$ begin
  alter table public.charger_listings
    add constraint charger_listings_status_chk
    check (status in ('available', 'offline', 'under_maintenance'));
exception when duplicate_object then null; end $$;

-- Backfill from the existing boolean so current data stays truthful.
update public.charger_listings
   set status = case when is_available then 'available' else 'offline' end
 where status = 'available' and is_available = false;


-- ── 3) Audit trail ─────────────────────────────────────────────────────────
-- Taking a charger out of service affects revenue and customer trust, so who
-- did it and why is worth keeping.
create table if not exists public.station_status_log (
  id          uuid primary key default gen_random_uuid(),
  -- Exactly one of these is set, depending on which table was changed.
  station_id  uuid references public.stations(id) on delete cascade,
  listing_id  uuid references public.charger_listings(id) on delete cascade,
  changed_by  uuid references public.profiles(id) on delete set null,
  from_status text not null,
  to_status   text not null,
  reason      text,
  created_at  timestamptz not null default now(),
  constraint station_status_log_target_chk
    check ((station_id is not null) <> (listing_id is not null))
);

create index if not exists idx_station_status_log_station
  on public.station_status_log (station_id, created_at desc) where station_id is not null;
create index if not exists idx_station_status_log_listing
  on public.station_status_log (listing_id, created_at desc) where listing_id is not null;

alter table public.station_status_log enable row level security;


-- ── 4) Set a company station's status — admin / superadmin only ────────────
create or replace function public.set_station_status(
  p_station uuid,
  p_status  text,
  p_reason  text default null
) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_from text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  select role into v_role from profiles where id = v_uid;

  if v_role not in ('admin', 'superadmin') then
    raise exception 'FORBIDDEN|role %', coalesce(v_role, 'none') using errcode = 'P0001';
  end if;

  -- Validate against the enum first so a typo fails loudly instead of blowing
  -- up mid-update with a cast error.
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'station_status' and e.enumlabel = p_status
  ) then
    raise exception 'INVALID_STATUS|%', p_status using errcode = 'P0001';
  end if;

  select status::text into v_from from stations where id = p_station for update;
  if v_from is null then raise exception 'Station not found' using errcode = 'P0001'; end if;

  if v_from = p_status then
    return jsonb_build_object('status', p_status, 'changed', false);
  end if;

  update stations set status = p_status::station_status where id = p_station;

  insert into station_status_log (station_id, changed_by, from_status, to_status, reason)
  values (p_station, v_uid, v_from, p_status, p_reason);

  return jsonb_build_object('status', p_status, 'changed', true, 'from', v_from);
end $function$;


-- ── 5) Set a private listing's status — owner, or admin/superadmin ─────────
create or replace function public.set_listing_status(
  p_listing uuid,
  p_status  text,
  p_reason  text default null
) returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_owner uuid;
  v_from  text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  select role into v_role from profiles where id = v_uid;

  if p_status not in ('available', 'offline', 'under_maintenance') then
    raise exception 'INVALID_STATUS|%', p_status using errcode = 'P0001';
  end if;

  select status, host_id into v_from, v_owner
    from charger_listings where id = p_listing for update;
  if v_from is null then raise exception 'Listing not found' using errcode = 'P0001'; end if;

  -- Owner (host or investor) may manage their own; staff may manage any.
  if v_role in ('admin', 'superadmin') then
    null;
  elsif v_owner is distinct from v_uid then
    raise exception 'FORBIDDEN|not your charger' using errcode = 'P0001';
  end if;

  if v_from = p_status then
    return jsonb_build_object('status', p_status, 'changed', false);
  end if;

  -- Mirror the guard the availability toggle already enforced: taking a charger
  -- out of service mid-session would strand a customer who is actively paying
  -- for that charge. Only staff may override.
  if p_status <> 'available'
     and v_role not in ('admin', 'superadmin')
     and public.listing_has_active_session(p_listing) then
    raise exception 'BUSY|a customer is charging right now' using errcode = 'P0001';
  end if;

  -- Keep the legacy boolean in step: anything other than available is not
  -- bookable, and ~20 call sites still read is_available.
  update charger_listings
     set status = p_status,
         is_available = (p_status = 'available')
   where id = p_listing;

  insert into station_status_log (listing_id, changed_by, from_status, to_status, reason)
  values (p_listing, v_uid, v_from, p_status, p_reason);

  return jsonb_build_object('status', p_status, 'changed', true, 'from', v_from);
end $function$;
