-- ============================================================================
-- Backend-owned tables — run ONCE on your PostgreSQL server.
-- ============================================================================
-- Refresh-token store (rotating). We store only a SHA-256 hash of each token.
create table if not exists public.auth_refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_refresh_user on public.auth_refresh_tokens (user_id);
create index if not exists idx_refresh_hash on public.auth_refresh_tokens (token_hash);

-- Password-reset + email-verification tokens (hashed).
create table if not exists public.auth_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  purpose     text not null check (purpose in ('reset','verify')),
  token_hash  text not null,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_authtok_hash on public.auth_tokens (token_hash);

-- Auth records are backend-only; no client Data API policies.
alter table public.auth_refresh_tokens enable row level security;
alter table public.auth_tokens enable row level security;
