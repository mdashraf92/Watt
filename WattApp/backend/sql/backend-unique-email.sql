-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — enforce one account per email at the database level
--
--  Found live: two accounts ended up with the same email (one from a typo'd
--  sign-up, one created later once the typo was noticed) because nothing in
--  the schema actually stopped it — auth.service.ts's getUserByEmail() check
--  is an application-level guard, not a guarantee, and doesn't cover races
--  or any future code path that skips it. This closes the gap for good.
--
--  Case-insensitive (matches getUserByEmail's `lower(email) = lower($1)`) and
--  partial (only applies where email is set — phone-only accounts have none).
--
--  Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

create unique index if not exists auth_users_email_unique_ci
  on auth.users (lower(email))
  where email is not null and email <> '';
