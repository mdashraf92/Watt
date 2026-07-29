# GO WATT — Self-Hosting on the Company Server

**Goal:** run the full Supabase stack (database + auth + API + realtime + edge
functions) on the company's own Linux server, using the company's Postgres, and
point the app at it. **No app code changes** beyond the `.env` values.

> Who does this: a **DevOps / server administrator**. Self-hosting Supabase is an
> infrastructure task. This guide is the checklist to hand to whoever manages the
> company server. Ashraf provides the domain, secrets, and the schema/data export.

---

## Why the whole Supabase stack (not just Postgres)

The phone never talks to Postgres directly (that would leak DB credentials on every
device and can't do auth, realtime, or the payment/hardware functions). Supabase is
the backend layer between the phone and the database, providing:

| Piece | What it does for GO WATT |
|---|---|
| **Postgres** | The database (company's own) |
| **GoTrue (Auth)** | Login, sessions, `auth.uid()` — every money RPC depends on this |
| **PostgREST + Kong** | The secure API the app calls (`supabase-js`) |
| **Realtime** | Live map / charger status updates |
| **Edge Functions (Deno)** | The 7 server functions (Thawani, Tuya, push, email, auto-shutoff, payouts, notify) |
| **Storage** (optional) | Avatars / images if used |

All of this is free and open-source. Official reference:
**https://supabase.com/docs/guides/self-hosting/docker**

---

## Prerequisites (on the company server)

- Linux VM/server you control (Ubuntu 22.04+ recommended), **4 GB RAM minimum**, 2 vCPU, 40 GB+ disk.
- **Docker** + **Docker Compose** installed.
- A **domain/subdomain** pointing at the server, e.g. `api.gowatt.om` (needed for HTTPS).
- Ports **80** and **443** open to the internet.
- Outbound internet (for Thawani/Tuya/push API calls from edge functions).

---

## Step 1 — Stand up self-hosted Supabase

```bash
# On the company server
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

Then edit `docker/.env` and set **strong** values for at least:
- `POSTGRES_PASSWORD` — the database password
- `JWT_SECRET` — long random string (min 32 chars)
- `ANON_KEY` and `SERVICE_ROLE_KEY` — generate these from the `JWT_SECRET` using
  Supabase's key generator: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` — for the admin studio
- `SITE_URL` / `API_EXTERNAL_URL` — set to `https://api.gowatt.om`
- SMTP settings (`SMTP_*`) — an email provider so auth emails / password reset work

Start it:
```bash
docker compose up -d
```

> **Using the company's existing Postgres instead of the bundled one:** point the
> stack's DB env vars (`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`,
> `POSTGRES_PASSWORD`) at the company DB. Simplest first deploy: use the bundled
> Postgres, then migrate to the external one later. Either way the app doesn't care.

---

## Step 2 — Put HTTPS + the domain in front

The Supabase API gateway (Kong) listens on port `8000`. Put a TLS reverse proxy in
front so the app connects securely over `https://api.gowatt.om`.

Easiest is **Caddy** (automatic Let's Encrypt certificates):
```
# /etc/caddy/Caddyfile
api.gowatt.om {
    reverse_proxy localhost:8000
}
```
(Nginx + certbot works too.) After this, `https://api.gowatt.om` should reach Supabase.

---

## Step 3 — Load the GO WATT database  ✅ ready-made backup exists

**There is already a complete backup: `gowatt_backup.sql`** (in the project root,
git-ignored). It was taken from the live cloud database **after** all Phase 1–5
enhancements were deployed, so it is a full, current snapshot — schema **+ all data
+ user accounts** (`public` and `auth` schemas). Just restore this one file; there is
**no** need to re-apply the repo migrations on top.

### 3a. Restore the backup onto the new server

On the company server (where the self-hosted Postgres runs):
```bash
# Ashraf sends you gowatt_backup.sql (do NOT commit it to git — it has user data)
psql -U postgres -h localhost -p 5432 -d postgres -f gowatt_backup.sql
```
That's it — the new database now matches production exactly.

### 3b. (Reference) How to regenerate the backup from the cloud

If a fresh dump is ever needed, this is the exact command that works. Note the cloud
project's **direct** host is IPv6-only, so on an IPv4-only network you MUST use the
**Session Pooler** host (region = `ap-southeast-1` / Singapore for this project):

```bash
# Session Pooler (IPv4) — full schema + data + auth users
PGPASSWORD='<db-password>' pg_dump \
  "host=aws-1-ap-southeast-1.pooler.supabase.com port=5432 \
   dbname=postgres user=postgres.cnwlmbpmgwmhzzjnmltz sslmode=require" \
  -f gowatt_backup.sql
```
- Get `<db-password>` from **Supabase Dashboard → Project Settings → Database**.
- Windows: use `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe` (v18+, must be ≥ the
  server's Postgres version) and set the password with
  `$env:PGPASSWORD='...'` in PowerShell.
- The exact pooler host/region is shown in **Dashboard → Connect → Session pooler**
  if it ever changes.

> Only needed if starting **totally fresh with no cloud snapshot**: run
> `supabase/schema.sql`, then every file in `supabase/migrations/` in filename order.
> The repo is now complete (`20260719f` supplies the `is_admin`/`check_email_exists`
> helpers that used to live only in the cloud).

---

## Step 4 — Deploy the 7 edge functions + their secrets

```bash
supabase functions deploy --project-ref <self-host> \
  auto-shutoff-chargers control-tuya-switch disburse-payouts \
  notify-booking send-push send-watt-email thawani-checkout
```

Set the secrets each function needs (these are **server-only**, never in the app):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Tuya: `TUYA_BASE_URL`, `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET`
- Thawani: `THAWANI_*` keys
- `AUTO_SHUTOFF_SECRET` (auto-shutoff) and `DISBURSE_SECRET` (payouts)
- SMTP creds for `send-watt-email`, push creds for `send-push`

---

## Step 5 — Schedule the recurring jobs (cron)

Two functions must run on a timer:
- **`auto-shutoff-chargers`** — every 1–2 minutes (stops expired sessions, bills them).
- **`disburse-payouts`** — e.g. once daily (only acts once you enable auto-payout + set a provider).

Use `pg_cron` inside the DB (call the function via `net.http_post`) or an external
scheduler (server crontab hitting the function URL with the secret header).

---

## Step 6 — Point the app at the new server

In the app's **`.env`** (already wired up — see `src/lib/supabase.ts`):
```
EXPO_PUBLIC_SUPABASE_URL=https://api.gowatt.om
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the ANON_KEY generated in Step 1>
```
Restart the bundler with a clean cache so new values load:
```
npx expo start -c
```
Then rebuild the app (EAS) for the store release.

Also configure in the self-hosted Auth settings:
- **Redirect URLs**: `watt://` (deep links for payment return + password reset).
- Email templates / SMTP so password reset + confirmations send.

---

## Quick sanity checklist

- [ ] `https://api.gowatt.om/rest/v1/` responds (Kong up, TLS valid)
- [ ] App logs in (auth works → `auth.uid()` present)
- [ ] Map loads stations; charger status updates live (realtime works)
- [ ] A test charge completes (RPCs + billing work)
- [ ] `auto-shutoff-chargers` runs on schedule
- [ ] Superadmin page loads for Ashraf's account (role bootstrap ran)

---

## What Claude can do to help

- **Generate the complete cloud schema dump** using the connected Supabase tools, so
  the server admin just restores one file (removes the "missing functions" risk).
- Produce the exact ordered list of SQL to apply (cloud dump → Phase 1–5 migrations).
- Review the server admin's `docker/.env` and Caddy config for mistakes.

Ask and I'll prepare any of these.
--------------------------------------------------------------------------

 First: you may already have them ✅

  The gowatt_backup.sql you made with pg_dump already includes the auth users — the auth.users table (with the bcrypt password hashes)
  and auth.identities. So when it's restored, your users log in with their same passwords. You don't strictly need the SQL editor.

  But restoring auth has a catch, so here's the clean way to do both parts.

  Part 1 — Look at / export the auth users (SQL editor)

  In the Supabase dashboard SQL Editor, to see them:
  select id, email, email_confirmed_at, created_at
  from auth.users
  order by created_at;

  The SQL editor can only show data (and export the result grid to CSV) — it can't produce a full SQL dump. For a real migration you
  export with pg_dump (Part 2), because the passwords/identities need to come as proper INSERTs.

  Part 2 — The dump, split correctly

  The key insight: on the new self-hosted server, Supabase's GoTrue creates the auth schema itself. So you must not overwrite that
  schema — you only want to insert the user rows into it. That means two separate dumps:

  A) Your app data (public schema) — full:
  PGPASSWORD='<db-password>' pg_dump \
    "host=aws-1-ap-southeast-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.cnwlmbpmgwmhzzjnmltz sslmode=require" \
    --schema=public -f gowatt_public.sql

  B) Just the auth USER ROWS (data only, as inserts):
  PGPASSWORD='<db-password>' pg_dump \
    "host=aws-1-ap-southeast-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.cnwlmbpmgwmhzzjnmltz sslmode=require" \
    --data-only --column-inserts \
    --table=auth.users --table=auth.identities -f gowatt_auth_users.sql

  Part 3 — Restore on the company server (order matters)

  Once the self-hosted Supabase stack is running (GoTrue has created the auth schema):

  # 1. Auth users first (into the schema GoTrue already made)
  psql "postgresql://postgres:<pw>@localhost:5432/postgres" -f gowatt_auth_users.sql
  # 2. Then your app data
  psql "postgresql://postgres:<pw>@localhost:5432/postgres" -f gowatt_public.sql

  Passwords keep working because the hash algorithm (bcrypt) is identical between cloud and self-hosted Supabase.

  ---
  ⚠️  If a user row already exists on the fresh server (e.g. a test signup), the insert will conflict. Cleanest: restore auth into a
  fresh, empty stack before anyone signs up.

  Since you have SELF_HOSTING.md open, want me to add this exact "migrate auth users" section into it (with the two-dump +
  restore-order steps) so the server admin has it in one place? I can also generate the two split dumps for you right now via the same
  pooler connection if you'd like them ready to hand over.
  # 1. Auth users first (into the schema GoTrue already made)
  psql "postgresql://postgres:<pw>@localhost:5432/postgres" -f gowatt_auth_users.sql
  # 2. Then your app data
  psql "postgresql://postgres:<pw>@localhost:5432/postgres" -f gowatt_public.sql

  Passwords keep working because the hash algorithm (bcrypt) is identical between cloud and self-hosted Supabase.

  ---
  ⚠️  If a user row already exists on the fresh server (e.g. a test signup), the insert will conflict. Cleanest: restore auth into a
  fresh, empty stack before anyone signs up.

  Since you have SELF_HOSTING.md open, want me to add this exact "migrate auth users" section into it (with the two-dump +
  restore-order steps) so the server admin has it in one place? I can also generate the two split dumps for you right now via the same
  pooler connection if you'd like them ready to hand over.
