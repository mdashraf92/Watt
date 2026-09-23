-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — support reports ("report a problem")
--
--  From the 4 Aug 2026 meeting: users need a way to raise any kind of issue
--  (charger fault, payment, safety, damage, other), optionally tied to a
--  booking/session and with a photo, that an admin can see, respond to, and
--  close. Plain table — no money moves here, so no SECURITY DEFINER function
--  is needed; ownership/role checks live in the Express routes instead.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.support_reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  category       text not null check (category in ('charger_fault', 'payment', 'safety', 'damage', 'other')),
  description    text not null,
  -- Optional base64 JPEG, same convention as charging_sessions.completion_photo_base64.
  photo_base64   text,
  booking_id     uuid references public.bookings(id) on delete set null,
  session_id     uuid references public.charging_sessions(id) on delete set null,
  status         text not null default 'open' check (status in ('open', 'in_review', 'resolved')),
  admin_response text,
  resolved_by    uuid references public.profiles(id),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_support_reports_user_created
  on public.support_reports (user_id, created_at desc);

create index if not exists idx_support_reports_status
  on public.support_reports (status, created_at desc);

drop trigger if exists trg_support_reports_updated_at on public.support_reports;
create trigger trg_support_reports_updated_at
  before update on public.support_reports
  for each row execute function public.set_updated_at();
