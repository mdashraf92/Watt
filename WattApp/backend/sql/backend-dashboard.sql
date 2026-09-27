begin;
create table if not exists public.dashboard_sessions (
 token_hash text primary key, user_id uuid not null references public.profiles(id) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists dashboard_sessions_user on public.dashboard_sessions(user_id);
create table if not exists public.dashboard_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id),
 method text not null, path text not null, status integer not null,
 created_at timestamptz not null default now()
);
alter table public.dashboard_sessions enable row level security;
alter table public.dashboard_audit enable row level security;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on public.dashboard_sessions,public.dashboard_audit from %I',r);
  end if;
 end loop;
end $$;
commit;
