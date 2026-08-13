-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — email verification before account creation
--
--  Previously, email sign-up created the account immediately from
--  name+email+password with no proof the email was real or spelled
--  correctly — exactly how a typo'd account (gmail.comm) happened. This
--  table holds the sign-up details until the email is verified; the actual
--  auth.users/profiles row is only created once the code is confirmed
--  (auth.service.ts: startSignup / completeSignup).
--
--  Mirrors phone_otps/email_otps' shape, plus the pending account fields.
--
--  Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pending_signups (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  full_name     text not null,
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      integer not null default 0,
  consumed      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_pending_signups_email   on public.pending_signups (email);
create index if not exists idx_pending_signups_created on public.pending_signups (created_at);
