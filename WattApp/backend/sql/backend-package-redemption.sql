-- Apply after backend-package-purchase-safety.sql. No hardware is activated here.
begin;

create table if not exists public.venue_staff (
  station_id uuid not null references stations(id),
  user_id uuid not null references profiles(id),
  primary key(station_id, user_id)
);
-- Configure only after verifying the device's switch code and cumulative meter units.
create table if not exists public.package_devices (
  connector_id uuid primary key references connectors(id),
  device_id text not null unique,
  switch_code text not null,
  energy_code text not null,
  energy_scale numeric not null check(energy_scale > 0),
  enabled boolean not null default false
);
create table if not exists public.package_monitor (
  id boolean primary key default true check(id),
  checked_at timestamptz not null
);
alter table entitlements add column if not exists benefit_redeemed_at timestamptz;
alter table entitlements add column if not exists benefit_redeemed_by uuid references profiles(id);
alter table charging_sessions add column if not exists entitlement_id uuid references entitlements(id);

create table if not exists public.package_charging_runs (
  id uuid primary key references charging_sessions(id),
  entitlement_id uuid not null references entitlements(id),
  user_id uuid not null references profiles(id),
  connector_id uuid not null references connectors(id),
  start_key text not null,
  state text not null default 'starting' check(state in ('starting','active','stopping','completed')),
  device_id text not null,
  switch_code text not null,
  energy_code text not null,
  energy_scale numeric not null,
  meter_start numeric,
  meter_last numeric,
  started_at timestamptz,
  deadline timestamptz not null,
  kwh_limit numeric,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  stop_reason text,
  flagged_review boolean not null default false,
  unique(user_id, start_key)
);
create unique index if not exists package_run_connector_active on package_charging_runs(connector_id) where state <> 'completed';
create unique index if not exists package_run_entitlement_active on package_charging_runs(entitlement_id) where state <> 'completed';
create unique index if not exists package_run_user_active on package_charging_runs(user_id) where state <> 'completed';

-- Even old customer/admin/cron finalizers must never bill a package session.
create or replace function public.guard_package_session() returns trigger language plpgsql as $$
begin
  -- Serialize legacy and package starts on the physical connector too.
  if TG_OP='INSERT' and new.connector_id is not null and new.status='active' then
    perform 1 from connectors where id=new.connector_id for update;
    if exists(select 1 from charging_sessions where connector_id=new.connector_id and status='active') then
      raise exception 'BUSY|Connector already in use';
    end if;
    if new.entitlement_id is null and exists(select 1 from package_charging_runs where user_id=new.user_id and state<>'completed') then
      raise exception 'BUSY|A package session is already active';
    end if;
  end if;
  if TG_OP = 'UPDATE' and old.entitlement_id is not null and new.entitlement_id is distinct from old.entitlement_id then
    raise exception 'FORBIDDEN|Package session identity cannot change';
  end if;
  if new.entitlement_id is not null then
    if new.cost <> 0 or new.held_amount <> 0 then
      raise exception 'FORBIDDEN|Package sessions cannot be billed again';
    end if;
    if TG_OP = 'UPDATE' and
       (new.status is distinct from old.status or new.kwh_delivered is distinct from old.kwh_delivered)
       and current_setting('gowatt.package_finalize', true) is distinct from 'on' then
      raise exception 'FORBIDDEN|Use package session control';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists package_session_guard on charging_sessions;
create trigger package_session_guard before insert or update on charging_sessions
for each row execute function guard_package_session();

create or replace function public.reserve_package_session(p_ent uuid, p_connector uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_e entitlements%rowtype; v_d package_devices%rowtype;
  v_r package_charging_runs%rowtype; v_station uuid; v_status text; v_id uuid;
  v_deadline timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_key is null or length(p_key) not between 16 and 100 then raise exception 'BAD_TRANSITION|Invalid start key'; end if;
  -- Consistent lock order; caller also holds a connector advisory lock during device I/O.
  perform 1 from profiles where id=v_uid for update;
  select * into v_r from package_charging_runs where user_id=v_uid and start_key=p_key;
  if found then
    if v_r.entitlement_id<>p_ent or v_r.connector_id<>p_connector then raise exception 'BAD_TRANSITION|Start key reused'; end if;
    return to_jsonb(v_r) || jsonb_build_object('already',true);
  end if;
  select * into v_e from entitlements where id=p_ent for update;
  if not found or v_e.user_id<>v_uid then raise exception 'FORBIDDEN|Not your package'; end if;
  if v_e.status<>'active' or v_e.expires_at<=now() then raise exception 'BAD_TRANSITION|Package unavailable'; end if;
  if exists(select 1 from package_charging_runs where entitlement_id=p_ent and flagged_review) then
    raise exception 'BAD_TRANSITION|Package needs meter review';
  end if;
  select station_id,status::text into v_station,v_status from connectors where id=p_connector for update;
  if not found or v_station<>v_e.station_id then raise exception 'FORBIDDEN|Wrong venue'; end if;
  if v_status<>'available' then raise exception 'BUSY|Connector unavailable'; end if;
  if exists(select 1 from charging_sessions where status='active' and (connector_id=p_connector or user_id=v_uid)) then
    raise exception 'BUSY|An active session already exists';
  end if;
  select * into v_d from package_devices where connector_id=p_connector and enabled;
  if not found then raise exception 'DISABLED|Package charger is not configured'; end if;
  v_deadline := v_e.expires_at;
  if v_e.minutes_total is not null then
    if v_e.minutes_total<=v_e.minutes_used then raise exception 'BAD_TRANSITION|Allowance exhausted'; end if;
    v_deadline := least(v_deadline,now()+make_interval(mins=>v_e.minutes_total-v_e.minutes_used));
  end if;
  if v_e.kwh_total is not null and v_e.kwh_total<=v_e.kwh_used then raise exception 'BAD_TRANSITION|Allowance exhausted'; end if;
  insert into charging_sessions(user_id,station_id,connector_id,entitlement_id,status,cost,held_amount)
    values(v_uid,v_e.station_id,p_connector,p_ent,'active',0,0) returning id into v_id;
  insert into package_charging_runs(id,entitlement_id,user_id,connector_id,start_key,device_id,switch_code,energy_code,energy_scale,deadline,kwh_limit)
    values(v_id,p_ent,v_uid,p_connector,p_key,v_d.device_id,v_d.switch_code,v_d.energy_code,v_d.energy_scale,v_deadline,v_e.kwh_total-v_e.kwh_used)
    returning * into v_r;
  return to_jsonb(v_r) || jsonb_build_object('already',false);
end $$;

-- Backend-only, called after OFF has been confirmed. Reading is cumulative and
-- never accepted from the mobile app. Repeated finalization consumes nothing twice.
create or replace function public.finish_package_session(p_run uuid, p_meter numeric, p_reason text, p_uncertain boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r package_charging_runs%rowtype; v_e entitlements%rowtype;
  v_minutes integer; v_kwh numeric; v_used_minutes integer; v_used_kwh numeric;
begin
  select * into v_r from package_charging_runs where id=p_run for update;
  if not found then raise exception 'Session not found'; end if;
  if v_r.state='completed' then return to_jsonb(v_r); end if;
  if v_r.state<>'stopping' then raise exception 'BAD_TRANSITION|Stop device first'; end if;
  select * into v_e from entitlements where id=v_r.entitlement_id for update;
  if p_meter is not null and (p_meter<coalesce(v_r.meter_last,v_r.meter_start,0) or p_meter::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'BAD_TRANSITION|Invalid meter reading';
  end if;
  v_minutes := case when v_r.started_at is null then 0 else greatest(0,ceil(extract(epoch from(now()-v_r.started_at))/60)::int) end;
  v_kwh := greatest(0,coalesce(p_meter,v_r.meter_last,v_r.meter_start,0)-coalesce(v_r.meter_start,0));
  v_used_minutes := case when v_e.minutes_total is null then v_minutes else least(v_minutes,greatest(0,v_e.minutes_total-v_e.minutes_used)) end;
  v_used_kwh := case when v_e.kwh_total is null then v_kwh else least(v_kwh,greatest(0,v_e.kwh_total-v_e.kwh_used)) end;
  insert into entitlement_redemptions(entitlement_id,session_id,station_id,minutes_used,kwh_used)
    values(v_e.id,v_r.id,v_e.station_id,v_used_minutes,v_used_kwh);
  update entitlements set minutes_used=minutes_used+v_used_minutes,kwh_used=kwh_used+v_used_kwh where id=v_e.id returning * into v_e;
  if (v_e.minutes_total is not null and v_e.minutes_used>=v_e.minutes_total) or
     (v_e.kwh_total is not null and v_e.kwh_used>=v_e.kwh_total) then
    update entitlements set status='consumed',consumed_at=now() where id=v_e.id;
  end if;
  perform set_config('gowatt.package_finalize','on',true);
  update charging_sessions set status='completed',ended_at=now(),kwh_delivered=v_kwh,
    meter_kwh=v_kwh,cost=0,flagged_review=p_uncertain where id=p_run;
  update profiles set total_sessions=total_sessions+1,total_kwh=total_kwh+v_kwh where id=v_r.user_id;
  update package_charging_runs set state='completed',ended_at=now(),stop_reason=p_reason,
    meter_last=coalesce(p_meter,meter_last),flagged_review=p_uncertain where id=p_run returning * into v_r;
  return to_jsonb(v_r);
end $$;

create or replace function public.redeem_package_benefit(p_ent uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_e entitlements%rowtype; v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_e from entitlements where id=p_ent for update;
  if not found then raise exception 'Package not found'; end if;
  if not coalesce(is_admin(),false) and not exists(select 1 from venue_staff where station_id=v_e.station_id and user_id=v_uid) then
    raise exception 'FORBIDDEN|Not staff at this venue';
  end if;
  if v_e.benefit_redeemed_at is not null then return to_jsonb(v_e); end if;
  if v_e.status not in ('active','consumed') or v_e.expires_at<=now() then raise exception 'BAD_TRANSITION|Benefit unavailable'; end if;
  update entitlements set benefit_redeemed_at=now(),benefit_redeemed_by=v_uid where id=p_ent returning * into v_e;
  return to_jsonb(v_e);
end $$;

-- Preserve the existing refund implementation, but guard its row transition in
-- the same transaction so its wallet credit also rolls back on any used benefit.
create or replace function public.guard_package_refund() returns trigger language plpgsql as $$
begin
  if new.status='refunded' and old.status<>'refunded' and
     (old.benefit_redeemed_at is not null or exists(select 1 from package_charging_runs where entitlement_id=old.id)) then
    raise exception 'BAD_TRANSITION|Used or started packages need a reviewed refund';
  end if;
  return new;
end $$;
drop trigger if exists package_refund_guard on entitlements;
create trigger package_refund_guard before update on entitlements for each row execute function guard_package_refund();

-- Retire arbitrary consumption submitted by a caller, including old clients.
create or replace function public.redeem_entitlement(p_entitlement uuid,p_session uuid default null,p_minutes integer default 0,p_kwh numeric default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
begin raise exception 'FORBIDDEN|Use trusted package session metering'; end $$;

revoke all on venue_staff,package_devices,package_charging_runs,package_monitor from public;
revoke execute on function reserve_package_session(uuid,uuid,text),finish_package_session(uuid,numeric,text,boolean),redeem_package_benefit(uuid) from public;
-- Existing backend deployments use the database owner or service_role.
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant all on venue_staff,package_devices,package_charging_runs,package_monitor to service_role;
    grant execute on function reserve_package_session(uuid,uuid,text),finish_package_session(uuid,numeric,text,boolean),redeem_package_benefit(uuid) to service_role;
  end if;
end $$;
commit;
