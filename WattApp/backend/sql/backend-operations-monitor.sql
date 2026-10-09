-- One latest HTTP execution per scheduled job; no customer payloads or secrets.
create table if not exists public.operations_job_runs (
 name text primary key,
 started_at timestamptz not null,
 finished_at timestamptz,
 http_status integer,
 duration_ms integer,
 last_success_at timestamptz
);
alter table public.operations_job_runs enable row level security;
revoke all on public.operations_job_runs from public;
