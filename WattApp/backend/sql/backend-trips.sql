-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — Trip Planner
--
--  Saved journeys with their computed charging stops. The plan itself is
--  stored as JSON: it is the output of an estimate made at a moment in time
--  (with a given battery, start charge and set of live chargers), and
--  recomputing it later would silently change what the driver saved.
--  Reopening a trip re-plans on demand; the stored plan is the record of what
--  they were shown.
--
--  trip_stops exists as real rows, not just JSON, because a stop can carry a
--  booking — and a booking needs a foreign key, not a value buried in a blob.
--
--  Run ONCE on the PostgreSQL server.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.trips (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null default '',

  from_lat     double precision not null,
  from_lng     double precision not null,
  from_label   text not null default '',
  to_lat       double precision not null,
  to_lng       double precision not null,
  to_label     text not null default '',

  -- The car and assumptions the plan was made under. Kept so a re-plan can
  -- start from the same premises instead of silently using today's profile.
  params       jsonb not null default '{}'::jsonb,
  plan         jsonb not null default '{}'::jsonb,

  status       text not null default 'planned',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint trips_status_chk check (status in ('planned', 'active', 'completed', 'cancelled'))
);

create index if not exists idx_trips_user on public.trips (user_id, created_at desc);

create table if not exists public.trip_stops (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  seq           integer not null,

  -- Exactly one of these: a company station or a private listing.
  station_id    uuid references public.stations(id) on delete set null,
  listing_id    uuid references public.charger_listings(id) on delete set null,

  name          text not null default '',
  latitude      double precision not null,
  longitude     double precision not null,
  along_km      numeric(8,2) not null default 0,
  arrive_soc    integer,
  depart_soc    integer,
  charge_kwh    numeric(8,3),
  charge_minutes integer,
  cost          numeric(10,3),

  -- Set once the driver reserves this stop. Only ever the NEXT stop is booked
  -- (see the routing routes): an ETA three hundred kilometres out will drift,
  -- and a missed reservation costs the customer a no-show.
  booking_id    uuid references public.bookings(id) on delete set null,
  status        text not null default 'planned',

  created_at    timestamptz not null default now(),

  constraint trip_stops_status_chk check (status in ('planned', 'booked', 'done', 'skipped')),
  unique (trip_id, seq)
);

create index if not exists idx_trip_stops_trip on public.trip_stops (trip_id, seq);

drop trigger if exists trg_trips_updated_at on public.trips;
create trigger trg_trips_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

-- Planner assumptions, tunable without an app release.
insert into public.app_config (key, value) values
  ('trip_corridor_km',              '5'),
  ('trip_consumption_kwh_per_100km','18'),
  ('trip_reserve_soc_pct',          '15')
on conflict (key) do nothing;
