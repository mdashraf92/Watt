# Run Go Watt locally

Everything on one Windows machine: PostgreSQL → API (+ admin dashboard) → Expo app on
your phone, plus the marketing website. About 15 minutes the first time.

| Piece | Folder | Runs at |
|---|---|---|
| Database | PostgreSQL 18 | `localhost:5432` |
| API + realtime | `mobile-app/backend` | `http://localhost:8090` |
| Admin dashboard | served by the API | `http://localhost:8090/dashboard` |
| Seller portal | served by the API | `http://localhost:8090/seller` |
| Mobile app | `mobile-app` | Expo Go on your phone |
| Website | `GoWatt/gowatt` | `http://localhost:3000` |

> Port **8080 is taken by Apache** on this machine, so the API uses **8090**.

---

## 0. Install once

- **Node.js 20 or newer** (`node -v`)
- **PostgreSQL 18** for Windows (EDB installer). Remember the `postgres` password.
  The setup script finds `psql` in `C:\Program Files\PostgreSQL\18\bin` automatically;
  for another location set `PG_BIN` to that bin folder.
- **Expo Go** on your phone (must support **SDK 57**). Phone and PC on the same Wi-Fi.
- The **database dumps** `gowatt_auth_users.sql` and `gowatt_public.sql` in
  `mobile-app/db/dumps/`. They contain real customer data, are git-ignored, and come from
  the team, not from git.

## 1. Create the database

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres gowatt
```

## 2. Point the API at it

Edit `mobile-app/backend/.env` (copy `.env.example` if it does not exist). The values that
matter locally:

```ini
NODE_ENV=development
PORT=8090
DATABASE_URL=postgresql://postgres:<your-postgres-password>@localhost:5432/gowatt
JWT_ACCESS_SECRET=<any 48+ random characters>
JWT_REFRESH_SECRET=<a different 48+ random characters>
CORS_ORIGIN=*
JOB_SECRET=<any 8+ characters>
```

The `.env` currently in the repo points at the **shared cloud database**. Keep that line
commented out (`# DATABASE_URL=...`) rather than deleting it, so you can switch back.
Everything else (Thawani, Tuya, SMS, SMTP, Mapbox) can stay empty for local work.

## 3. Build the database (one command)

```powershell
cd mobile-app\backend
npm ci
node scripts/setup-local-db.cjs --admin you@example.com:ChooseAPassword1
```

This restores the dumps, applies all 30 backend migrations in the right order and
creates a **superadmin** login. It refuses to run against anything but `localhost`.

- Run it again any time after pulling new migrations: it only applies changes (about 20 s).
- `--reset` wipes the local database and rebuilds it from the dumps.

**Charging locations** (34 EVO/Audi chargers):

```powershell
node scripts/import-evo-stations.js ..\db\seed\evo-chargers.kml
```

**Demo café** (optional — gives the Coffee tab, staff board and dashboard something to show):

```powershell
node scripts/seed-demo-cafe.cjs "Qurum Park" you@example.com
```

## 4. Start the API

```powershell
npm run dev
```

Check: <http://localhost:8090/health> → `{"ok":true,...}`

Open the **dashboard** at <http://localhost:8090/dashboard> and sign in with the
`--admin` email and password from step 3.

## 5. Run the mobile app

1. Find your PC's Wi-Fi address: `ipconfig` → *Wireless LAN adapter Wi-Fi* → **IPv4 Address**.
2. In `mobile-app/.env` set:
   ```ini
   EXPO_PUBLIC_API_URL=http://<that-IPv4-address>:8090
   EXPO_PUBLIC_SKIP_LOGIN=0
   ```
3. Start Expo:
   ```powershell
   cd mobile-app
   npm ci
   npx expo start -c
   ```
4. Scan the QR code with Expo Go. Press **w** in the terminal to open it in a browser
   instead (for the browser you may use `http://localhost:8090` as the API URL).

The first time Windows asks, **allow Node.js through the firewall on private networks**,
otherwise the phone cannot reach the API.

**Signing in on the phone:** use the admin email and password, or phone sign-in — with no
SMS provider configured the code is printed in the API terminal, and `000000` is accepted
for any number while `NODE_ENV` is not `production`.

## 6. The website (optional)

```powershell
cd GoWatt\gowatt
npm ci
copy .env.example .env.local    # fill DATABASE_URL, ADMIN_USER, ADMIN_PASSWORD
npm run dev                      # http://localhost:3000
```

The website has its own small schema (`GoWatt/gowatt/db/schema.sql`) and does not share the
app's backend.

## 7. Background jobs (optional)

In production a cron calls these every minute. Locally, call one by hand when you need it:

```powershell
curl.exe -X POST -H "x-job-secret: <JOB_SECRET>" http://localhost:8090/api/jobs/cafe-orders
```

Others: `auto-shutoff`, `no-show`, `reminders`, `reconcile-payments`, `mobile-dispatch`,
`package-charging`, `cafe-menus` (see `backend/README.md` and `docs/CAFE_ORDERS.md`).

## What works locally, and what needs more

| Works with the steps above | Needs extra setup |
|---|---|
| Sign-in, map, stations, profiles, bookings view | **Card payments** — Thawani test keys in `backend/.env` |
| Dashboard (all pages), seller portal | **Charger control / package charging** — Tuya keys + a configured device, and `PACKAGES_*_ENABLED=true` |
| Coffee tab, café menus, staff order board, admin café screens | **Placing a café order** — the above two, plus `CAFE_ORDERS_ENABLED=true` |
| Marketplace browsing | **Real SMS / email** — iSmartSMS / SMTP credentials |
| Backend tests: `npm run test:packages` (own temporary database) | **Directions / trip planner** — `OSRM_URL` |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment` when the API starts | A required `.env` value is missing — usually `DATABASE_URL` or a JWT secret shorter than 16 characters. |
| `EADDRINUSE :8090` | Something already uses the port. Change `PORT` in `backend/.env` and in `EXPO_PUBLIC_API_URL`. |
| Phone shows "network request failed" | Wrong IP (it changes with DHCP — rerun `ipconfig`), firewall blocked Node, or phone on another network. After changing `.env`, restart with `npx expo start -c`. |
| Expo Go says the project is incompatible | Update Expo Go; the project is SDK 57. |
| `Could not run psql` | Install PostgreSQL or set `PG_BIN=C:\Program Files\PostgreSQL\18\bin`. |
| `Cannot connect` from the setup script | PostgreSQL service not running, wrong password, or `createdb` not done. |
| Dashboard "Invalid credentials" | The account is not admin/superadmin. Rerun step 3 with `--admin` (it upgrades an existing email). |
| Coffee tab is empty | No café yet — run the demo café seed in step 3. |
