-- Investor-application actions rejected superadmins.
--
-- accept/reject/set-under-review each guarded on `role = 'admin'` exactly, so a
-- superadmin — the highest-privilege role — got "Unauthorized" while a plain
-- admin succeeded. Every other guard in the codebase treats the two together:
-- is_admin() is `role in ('admin','superadmin')`, as is the API's requireAdmin.
-- The request therefore passed Express and failed inside Postgres.
--
-- Swapped the inline checks for is_admin() so there is one definition of "admin"
-- rather than three copies that can drift again. Idempotent: safe to re-run.

create or replace function public.set_application_under_review(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;
  update public.charger_applications
     set status = 'under_review', updated_at = now()
   where id = p_application_id;
end;
$function$;

create or replace function public.reject_investor_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;
  update public.charger_applications
     set status = 'rejected', updated_at = now()
   where id = p_application_id;
end;
$function$;

-- Body unchanged apart from the guard: promotes the applicant to investor and
-- seeds their listing (unavailable until they price it themselves).
create or replace function public.accept_investor_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id      uuid;
  v_charger_type text;
  v_governorate  text;
  v_city         text;
  v_power_kw     float;
  v_latitude     double precision;
  v_longitude    double precision;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  select user_id, charger_type, governorate, city, power_kw, latitude, longitude
    into v_user_id, v_charger_type, v_governorate, v_city, v_power_kw, v_latitude, v_longitude
    from public.charger_applications where id = p_application_id;
  if v_user_id is null then raise exception 'Application not found'; end if;

  update public.charger_applications set status = 'approved', updated_at = now() where id = p_application_id;
  update public.profiles           set role = 'investor', updated_at = now() where id = v_user_id;

  insert into public.charger_listings
    (host_id, address, latitude, longitude, charger_type, power_kw, price_per_kwh, is_available)
  select v_user_id, concat(v_city, ', ', v_governorate),
         coalesce(v_latitude, 23.588), coalesce(v_longitude, 58.383),
         v_charger_type, coalesce(v_power_kw, 7.4), 0.025, false
   where not exists (select 1 from public.charger_listings where host_id = v_user_id);
end;
$function$;
