-- Run after backend-packages.sql. Additive upgrade; no existing balances move.
begin;

alter table public.entitlements add column if not exists purchase_key text;
alter table public.entitlements add column if not exists offer_version text;
alter table public.entitlements add column if not exists package_name text;
alter table public.entitlements add column if not exists package_name_ar text;
alter table public.entitlements add column if not exists partner_benefit text;
alter table public.entitlements add column if not exists partner_benefit_ar text;

-- Historical wording cannot be reconstructed; backfill the current wording once.
update public.entitlements e set
  package_name = p.name, package_name_ar = p.name_ar,
  partner_benefit = p.partner_benefit, partner_benefit_ar = p.partner_benefit_ar
from public.venue_packages p where p.id = e.package_id and e.package_name is null;

create unique index if not exists entitlements_purchase_key_idx
  on public.entitlements(user_id, purchase_key) where purchase_key is not null;

-- Disable the unsafe legacy entry point, including calls from old app builds.
create or replace function public.purchase_package(p_package uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  raise exception 'BAD_TRANSITION|Update the app before buying a package';
end $$;

create or replace function public.purchase_package(
  p_package uuid, p_key text, p_expected_price numeric, p_offer_version text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_pkg venue_packages%rowtype;
  v_ent entitlements%rowtype;
  v_balance numeric;
  v_held numeric;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_key is null or length(p_key) < 16 or length(p_key) > 100 then
    raise exception 'BAD_TRANSITION|Invalid purchase key';
  end if;
  -- One lock order for all buyers. A retry waits for the original transaction.
  select wallet_balance, coalesce(held_balance, 0) into v_balance, v_held
    from profiles where id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;

  select * into v_ent from entitlements where user_id = v_uid and purchase_key = p_key;
  if found then
    if v_ent.package_id <> p_package or p_expected_price is distinct from v_ent.price_paid
       or p_offer_version is distinct from v_ent.offer_version then
      raise exception 'BAD_TRANSITION|Purchase key already used for another request';
    end if;
    return jsonb_build_object('entitlement', to_jsonb(v_ent), 'balance', v_balance);
  end if;

  select * into v_pkg from venue_packages where id = p_package for share;
  if not found or not v_pkg.is_active then raise exception 'Package not found'; end if;
  if p_expected_price is distinct from v_pkg.price
     or p_offer_version is distinct from v_pkg.updated_at::text then
    raise exception 'BAD_TRANSITION|Package price changed or terms changed; review the offer again';
  end if;
  if v_balance - v_held < v_pkg.price then
    raise exception 'INSUFFICIENT_BALANCE|required=%', v_pkg.price;
  end if;

  insert into entitlements (
    user_id, package_id, station_id, price_paid, minutes_total, kwh_total,
    redeem_code, expires_at, purchase_key, offer_version, package_name, package_name_ar,
    partner_benefit, partner_benefit_ar
  ) values (
    v_uid, v_pkg.id, v_pkg.station_id, v_pkg.price, v_pkg.included_minutes,
    v_pkg.included_kwh, 'GW-' || upper(replace(gen_random_uuid()::text, '-', '')),
    now() + make_interval(hours => v_pkg.validity_hours), p_key, v_pkg.updated_at::text,
    v_pkg.name, v_pkg.name_ar, v_pkg.partner_benefit, v_pkg.partner_benefit_ar
  ) returning * into v_ent;

  update profiles set wallet_balance = wallet_balance - v_pkg.price
    where id = v_uid returning wallet_balance into v_balance;
  insert into wallet_transactions(user_id, type, amount, balance_after, description, reference_id)
    values(v_uid, 'charge', -v_pkg.price, v_balance, v_pkg.name, v_ent.id::text);
  return jsonb_build_object('entitlement', to_jsonb(v_ent), 'balance', v_balance);
end $$;

commit;
