-- Apply after backend-package-redemption.sql. Existing stations stay unchanged.
begin;
alter table public.stations add column if not exists is_package_venue boolean not null default false;

-- Serialize venue conversion with new bookings/session inserts. Old clients
-- cannot route a package venue through the per-kWh billing flow.
create or replace function public.guard_package_venue_booking() returns trigger
language plpgsql set search_path=public as $$
declare v_package boolean;
begin
  if new.station_id is not null then
    select is_package_venue into v_package from stations where id=new.station_id for share;
    if v_package then raise exception 'BAD_TRANSITION|Choose a venue package instead of a metered booking'; end if;
  end if;
  return new;
end $$;
drop trigger if exists package_venue_booking_guard on public.bookings;
create trigger package_venue_booking_guard before insert on public.bookings
for each row execute function public.guard_package_venue_booking();

create or replace function public.guard_package_venue_session() returns trigger
language plpgsql set search_path=public as $$
declare v_package boolean;
begin
  if new.entitlement_id is null then
    -- Check the physical connector as well as the client/booking station ID.
    perform 1 from stations where id=new.station_id or id=(select station_id from connectors where id=new.connector_id) for share;
    select exists(select 1 from stations where is_package_venue and
      (id=new.station_id or id=(select station_id from connectors where id=new.connector_id))) into v_package;
    if v_package then raise exception 'BAD_TRANSITION|Use package session control at this venue'; end if;
  end if;
  return new;
end $$;
drop trigger if exists package_venue_session_guard on public.charging_sessions;
create trigger package_venue_session_guard before insert on public.charging_sessions
for each row execute function public.guard_package_venue_session();
commit;
