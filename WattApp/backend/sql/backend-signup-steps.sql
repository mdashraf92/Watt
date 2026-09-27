-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — step-by-step sign-up + first-run profile setup
--
--  Sign-up used to collect name + email + password on one form, then verify
--  the email. It is now three short steps:
--    1. email      → /auth/register/start   (a code is emailed; nothing created)
--    2. code       → /auth/register/verify  (email proven; returns signup_token)
--    3. password   → /auth/register/complete (account created, signed in)
--  followed, inside the app, by name + phone and an optional EV step.
--
--  pending_signups therefore no longer knows the password or name when the row
--  is created, and needs to remember that the email was verified. Old app
--  builds still send password + name up front; those rows keep working exactly
--  as before (see auth.service.ts: completeSignup).
--
--  profiles.onboarding_completed gates the in-app setup. Every account that
--  exists before this migration is marked complete so nobody already using the
--  app is suddenly asked to fill in a form; accounts created afterwards (email,
--  phone OTP, or any other path) start at false.
--
--  Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pending_signups alter column password_hash drop not null;
alter table public.pending_signups alter column full_name     drop not null;
alter table public.pending_signups add column if not exists verified_at       timestamptz;
alter table public.pending_signups add column if not exists signup_token_hash text;

alter table public.profiles add column if not exists onboarding_completed boolean;
update public.profiles set onboarding_completed = true where onboarding_completed is null;
alter table public.profiles alter column onboarding_completed set default false;
alter table public.profiles alter column onboarding_completed set not null;
