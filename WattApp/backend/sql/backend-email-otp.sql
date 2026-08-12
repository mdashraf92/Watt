-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — email OTP login
--
--  Mirrors public.phone_otps exactly, so auth.service.ts's email-OTP functions
--  can reuse the same rate-limit/expiry/attempts logic already proven there.
--  A second, independent login path for accounts registered by email — useful
--  right now specifically because Omantel's SMS whitelist is still pending,
--  so email is the one OTP channel fully in our own control.
--
--  Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.email_otps (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   integer not null default 0,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_otps_email   on public.email_otps (email);
create index if not exists idx_email_otps_created on public.email_otps (created_at);
