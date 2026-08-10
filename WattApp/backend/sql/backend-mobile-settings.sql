-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — mobile-charging (roadside rescue) pricing, editable by superadmin
--
--  The mobile_* app_config keys (callout fee, price/kWh, cancel fee, min/max
--  kWh, service radius) were seeded once in backend-mobile-charging.sql and
--  have had no admin UI since — a customer flagged the 5 OMR callout fee as
--  too high, with no way to change it except a manual SQL update.
--
--  Same design as sql/backend-overstay-and-refund.sql: a small, fully-owned
--  getter/setter pair, kept OUT of the existing sa_get_settings()/
--  sa_set_setting() whitelist because that function's body isn't tracked in
--  this repo (pre-dates the Node/Express migration) — extending it blindly
--  risks silently dropping the commission/payout keys it already accepts.
--
--  hold_buffer (the wallet-hold safety margin) is deliberately NOT exposed
--  here — it's an internal risk control, not a customer-facing price, and
--  misconfiguring it could under-reserve funds for a live callout.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sa_get_mobile_settings()
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
    'mobile_enabled',           coalesce((select value           from app_config where key = 'mobile_enabled'), 'true')::boolean,
    'mobile_callout_fee',       coalesce((select value::numeric  from app_config where key = 'mobile_callout_fee'), 5.000),
    'mobile_price_per_kwh',     coalesce((select value::numeric  from app_config where key = 'mobile_price_per_kwh'), 0.120),
    'mobile_min_kwh',           coalesce((select value::numeric  from app_config where key = 'mobile_min_kwh'), 5),
    'mobile_max_kwh',           coalesce((select value::numeric  from app_config where key = 'mobile_max_kwh'), 30),
    'mobile_cancel_fee',        coalesce((select value::numeric  from app_config where key = 'mobile_cancel_fee'), 0),
    'mobile_service_radius_km', coalesce((select value::numeric  from app_config where key = 'mobile_service_radius_km'), 60)
  );
end $function$;

create or replace function public.sa_set_mobile_settings(
  p_enabled            boolean,
  p_callout_fee        numeric,
  p_price_per_kwh      numeric,
  p_min_kwh            numeric,
  p_max_kwh            numeric,
  p_cancel_fee         numeric,
  p_service_radius_km  numeric
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'superadmin only';
  end if;
  if p_callout_fee < 0 or p_price_per_kwh <= 0 or p_cancel_fee < 0 or p_service_radius_km <= 0 then
    raise exception 'settings must be positive (fees may be zero)';
  end if;
  if p_min_kwh <= 0 or p_max_kwh < p_min_kwh then
    raise exception 'min/max kWh out of range';
  end if;

  insert into app_config (key, value) values ('mobile_enabled', p_enabled::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_config (key, value) values ('mobile_callout_fee', p_callout_fee::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_config (key, value) values ('mobile_price_per_kwh', p_price_per_kwh::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_config (key, value) values ('mobile_min_kwh', p_min_kwh::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_config (key, value) values ('mobile_max_kwh', p_max_kwh::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_config (key, value) values ('mobile_cancel_fee', p_cancel_fee::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_config (key, value) values ('mobile_service_radius_km', p_service_radius_km::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();

  return public.sa_get_mobile_settings();
end $function$;
