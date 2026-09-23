-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — pre-launch waitlist
--
--  Backs POST /api/waitlist, which the marketing site's form submits to. The
--  app does not read this table; it exists so the launch-day download link can
--  be sent to the people who asked for it, and so the host-side interest is
--  measurable before there is a single listing.
--
--  Design notes:
--
--  * A person is identified by the contact they gave us, so uniqueness is per
--    channel: one row per phone, one row per email. The partial unique indexes
--    below are what make the route's `on conflict do nothing` work — a visitor
--    who taps submit twice gets the same 201 and no duplicate row, and the
--    endpoint therefore cannot be used to test whether a number is already on
--    the list.
--
--  * `notified_at` is the launch-day audit trail: it is stamped when the
--    download link is actually sent, so a re-run of the send cannot message the
--    same person twice.
--
--  * This is personal data under Oman's Personal Data Protection Law
--    (RD 6/2022) and was collected for ONE stated purpose — telling these
--    people the app is out. It is not a marketing list. Delete a row on
--    request, and see the retention note at the bottom.
--
--  Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.waitlist (
  id             uuid primary key default gen_random_uuid(),
  name           text        not null,
  contact_method text        not null check (contact_method in ('phone', 'email')),
  phone          text,
  email          text,
  role           text        not null check (role in ('driver', 'host', 'both')),
  lang           text        not null default 'ar' check (lang in ('ar', 'en')),
  source         text        not null default 'website',
  notified_at    timestamptz,
  created_at     timestamptz not null default now(),

  -- The chosen channel must be present. Enforced here as well as in Zod,
  -- because a row we cannot answer is useless and this table outlives any one
  -- version of the API.
  constraint waitlist_contact_present check (
    (contact_method = 'phone' and phone is not null) or
    (contact_method = 'email' and email is not null)
  )
);

-- Partial, so a row that only has a phone does not collide with every other
-- row that has a null email.
create unique index if not exists waitlist_phone_key on public.waitlist (phone) where phone is not null;
create unique index if not exists waitlist_email_key on public.waitlist (email) where email is not null;

-- Admin list view is ordered by newest first.
create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);
-- Launch-day send: "everyone not yet notified".
create index if not exists waitlist_pending_idx on public.waitlist (created_at) where notified_at is null;

comment on table public.waitlist is
  'Pre-launch sign-ups from the marketing site. Collected for one purpose: to send the download link at launch. Not a marketing list.';
comment on column public.waitlist.notified_at is
  'Set when the launch notification was sent, so a re-run cannot message anyone twice.';

-- ── Retention ──────────────────────────────────────────────────────────────
-- Once launch notifications have gone out this table has served its purpose.
-- After that, keep it only as long as there is a reason to, and record the
-- decision. To clear the notified rows:
--
--   delete from public.waitlist where notified_at < now() - interval '90 days';
