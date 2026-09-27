-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — web seller portal sessions (/seller/)
--
--  Shop and service-provider owners (and their staff) manage their store from
--  a browser. Same design as dashboard_sessions — httpOnly cookie holding a
--  random token, only its SHA-256 stored here — but a separate table and
--  cookie, so a seller session can never reach the admin dashboard API.
--
--  Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.seller_sessions (
  token_hash text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists seller_sessions_user on public.seller_sessions(user_id);
alter table public.seller_sessions enable row level security;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.seller_sessions from %I', r);
    end if;
  end loop;
end $$;
