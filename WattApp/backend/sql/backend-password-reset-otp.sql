-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — password reset via in-app code (replaces the emailed deep link)
--
--  The emailed watt:// / exp:// reset link turned out to be unreliable in
--  practice: Gmail strips non-http(s) links from clickable buttons entirely
--  (confirmed live — long-press found no link to copy), and a real https
--  landing page needs a domain we don't have yet. A typed code, entered
--  directly in the app — the same pattern already proven for phone/email
--  login and sign-up — sidesteps the whole deep-link problem.
--
--  Mirrors email_otps' shape exactly.
--
--  Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.password_reset_otps (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   integer not null default 0,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_otps_email   on public.password_reset_otps (email);
create index if not exists idx_password_reset_otps_created on public.password_reset_otps (created_at);
