-- ============================================================================
-- Phone OTP codes — run ONCE on your PostgreSQL server.
-- ============================================================================
-- Stores 6-digit login codes (hashed) keyed by PHONE, not user_id — because a
-- brand-new phone signup has no user yet. Codes are short-lived + attempt-capped.
create table if not exists public.phone_otps (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int  not null default 0,
  consumed    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_phone_otps_phone on public.phone_otps (phone);
create index if not exists idx_phone_otps_created on public.phone_otps (created_at);
