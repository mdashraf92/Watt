-- ============================================================================
-- Saved credit / debit cards (Thawani tokenisation) — run ONCE on the server.
-- ----------------------------------------------------------------------------
-- Thawani never gives us the PAN. It gives a customer token (cus_…) per user and
-- a payment-method token per saved card; both are safe to store. Card charges
-- top the wallet up off-session, so all existing session billing keeps working
-- unchanged — the card just removes the "go top up first" step.
-- ============================================================================

-- One Thawani customer per app user.
create table if not exists public.payment_customers (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  thawani_customer_id text not null unique,
  created_at          timestamptz not null default now()
);

-- Cards saved against that customer. `card_token` is Thawani's payment_method id.
create table if not exists public.payment_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  card_token  text not null unique,
  brand       text,
  last4       text,
  expiry      text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_payment_cards_user on public.payment_cards (user_id);
-- At most one default card per user.
create unique index if not exists idx_payment_cards_one_default
  on public.payment_cards (user_id) where is_default;

-- Preferred rail: pay charging sessions from the wallet, or auto-charge the card.
create table if not exists public.payment_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  method     text not null default 'wallet' check (method in ('wallet','card')),
  updated_at timestamptz not null default now()
);

-- Existing top-up sessions get a purpose so a card-verification charge can be
-- told apart from a normal top-up in support/reporting.
alter table public.payment_sessions
  add column if not exists purpose text not null default 'topup';

-- One row per Thawani session / payment-intent id, so retries can't duplicate.
create unique index if not exists idx_payment_sessions_session_id
  on public.payment_sessions (session_id);
