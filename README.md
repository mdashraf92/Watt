<div align="center">
  <img src="brand/logo/gowatt-logo.svg" alt="GO WATT" width="280" />
  <p><strong>EV charging network for the Sultanate of Oman</strong></p>
</div>

---

GO WATT connects drivers looking for a charge with public stations and private
home chargers. Customers find and book a charger, hosts earn by sharing theirs,
investors fund new sites, and admins run the network — all from one app.

## Repository layout

```
Watt/
├── WattApp/          The product — Expo mobile app + Node/Express backend
├── brand/            Logos, icons and editable source art
├── docs/             Reports and planning documents
├── marketing/        Public landing page
└── Bills/            Financial records (git-ignored)
```

### `WattApp/` in detail

```
WattApp/
├── src/              Mobile app — screens, components, i18n, navigation
├── backend/          Node/Express API + Postgres
│   ├── src/modules/  One folder per API area (auth, bookings, payments, …)
│   └── sql/          Schema and migration files, applied in order
├── db/dumps/         Local Postgres dumps (git-ignored, ~19MB)
├── assets/           App icons, splash screens, fonts
├── deploy/           Server deployment configuration
└── docs/             Architecture, roadmap, user flows, go-live checklist
```

## Tech stack

| Layer | Built with |
|---|---|
| Mobile | Expo SDK 56, React Native 0.85, React 19, React Navigation 6 |
| Backend | Node + Express 4, TypeScript, Zod validation |
| Database | PostgreSQL — business logic lives in SQL functions |
| Realtime | Socket.IO over Postgres `LISTEN`/`NOTIFY` |
| Auth | JWT access/refresh tokens, email + password or phone OTP |
| Payments | Thawani (Oman) hosted checkout, wallet with pre-session holds |
| Languages | English and Arabic, full RTL support |

## Roles

The app presents a different navigator per role:

- **Customer** — find, book and pay for charging
- **Host** — share a private charger and earn
- **Investor** — fund charger installations and track returns
- **Admin / Superadmin** — approve applications, manage payouts, monitor sessions

## Running locally

**Prerequisites:** Node 20+, Docker, and the Expo Go app on your phone.

**1 — Database**

```bash
docker run -d --name gowatt-db \
  -e POSTGRES_PASSWORD=<your-password> \
  -p 55432:5432 postgres:15
```

Port 55432 avoids clashing with any Postgres already on 5432. Apply the SQL in
`WattApp/backend/sql/` in filename order, starting with `backend-compat.sql`.

**2 — Backend**

```bash
cd WattApp/backend
cp .env.example .env      # then fill in DATABASE_URL and the JWT secrets
npm install
npm run dev               # http://localhost:8090/health
```

**3 — Mobile app**

```bash
cd WattApp
npm install
npx expo start --port 8082
```

Set `EXPO_PUBLIC_API_URL` in `WattApp/.env` to your machine's **LAN IP** (not
`localhost`) so a physical phone can reach the backend:

```
EXPO_PUBLIC_API_URL=http://192.168.1.50:8090
```

> If the app shows `Host unreachable`, this value is almost always stale — most
> routers hand out a new IP periodically. Check yours and restart Expo with
> `-c`, since environment variables are inlined at bundle time.

## Scheduled jobs

The backend exposes cron endpoints under `/api/jobs`, each guarded by the
`x-job-secret` header. Add them to the server's crontab:

| Endpoint | Frequency | Purpose |
|---|---|---|
| `/api/jobs/reminders` | every minute | "Charging starts soon" / "ends soon" notifications |
| `/api/jobs/auto-shutoff` | every minute | Stop and bill sessions past their booked window |
| `/api/jobs/reconcile-payments` | every 5 min | Credit top-ups the app never confirmed |
| `/api/jobs/no-show` | every 10 min | Release unclaimed bookings |
| `/api/jobs/disburse` | daily | Pay out investor earnings |

## Documentation

| Document | Contents |
|---|---|
| [`WattApp/docs/C-server.md`](WattApp/docs/C-server.md) | Backend architecture and API reference |
| [`WattApp/docs/SELF_HOSTING.md`](WattApp/docs/SELF_HOSTING.md) | Deploying to your own server |
| [`WattApp/docs/GO_LIVE.md`](WattApp/docs/GO_LIVE.md) | Pre-launch checklist |
| [`WattApp/docs/ROADMAP.md`](WattApp/docs/ROADMAP.md) | Planned work |
| [`WattApp/docs/USER_FLOWS_EN.md`](WattApp/docs/USER_FLOWS_EN.md) | Screen-by-screen user journeys (also in Arabic) |
| [`WattApp/docs/DOCUMENTATION_EN.md`](WattApp/docs/DOCUMENTATION_EN.md) | Full product documentation (also in Arabic) |

## A note on secrets

`.env` files are git-ignored everywhere and must stay that way — they hold
database credentials, JWT signing secrets, SMTP passwords and payment keys. Use
the `.env.example` files as templates. Never commit a real key.

## Licence

See [`WattApp/LICENSE`](WattApp/LICENSE).
