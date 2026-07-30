<div align="center">
  <img src="brand/logo/gowatt-logo-full.png" alt="GO WATT" width="260" />
  <p><strong>How to run GO WATT</strong></p>
</div>

This file is the single source for **running the project**. There are three runnable
parts: the **website** (static landing page), the **mobile app** (`WattApp/`, Expo),
and the **backend API** (`WattApp/backend/`, Node + Postgres).

---

## Prerequisites

- **Node.js 18+** and npm
- **Expo Go** app (or a dev build) on your phone — for the mobile app
- **Docker** — for the local Postgres database
- A phone and PC on the **same Wi‑Fi network**

---

## 1) Website (landing page)

The site is a single static file at the repo root — no build step.

```bash
# Just open it:
#   double-click index.html
# …or serve it locally:
npx serve .
```

It uses `brand/` (logos, icons) and `assets/` (app screenshots + splash video),
both relative to the repo root — keep `index.html` at the root so those paths work.
Arabic (RTL) / English (LTR) toggle is built in.

---

## 2) Mobile app — `WattApp/`

```bash
cd WattApp
npm install
npx expo start -c        # -c clears the Metro cache
```

Then on your phone: open **Expo Go**, **scan the QR code** that Metro prints, and the
app loads over Wi‑Fi.

**Point the app at the backend.** Edit `WattApp/.env`:

```env
# Use your PC's LAN IP (find it with `ipconfig`) so the phone can reach the backend.
EXPO_PUBLIC_API_URL=http://<YOUR-PC-LAN-IP>:8090
```

After any `.env` change, restart with `npx expo start -c`.

> **"Cannot connect to Expo CLI"** → your PC's IP changed or an old Metro session is
> stale. Stop old Metro, run `npx expo start -c`, and **re-scan the fresh QR**. If your
> Wi‑Fi blocks phone↔PC traffic, use `npx expo start -c --tunnel`.

---

## 3) Backend API — `WattApp/backend/`

Node + TypeScript + Express in front of Postgres. The app talks only to this API.

```bash
cd WattApp/backend
cp .env.example .env      # fill DATABASE_URL, JWT secrets, SMTP, Thawani, Tuya
npm install

# One-time DB prep (adds compat functions + backend tables):
psql "$DATABASE_URL" -f sql/backend-compat.sql
psql "$DATABASE_URL" -f sql/backend-tables.sql

npm run dev               # dev with auto-reload
# or for a production-style run:
npm run build && npm start
```

Local port is **8090** (port 8080 is taken by Apache on the dev machine). Health check:

```bash
curl http://localhost:8090/health
```

---

## 4) Local database (Docker Postgres)

Run Postgres locally on port **55432** and restore the dumps from `WattApp/db/dumps/`.

```bash
# Start a local Postgres 15
docker run -d --name gowatt-db \
  -e POSTGRES_PASSWORD=postgres \
  -p 55432:5432 postgres:15

# Restore data (auth users first, then app data)
psql "postgresql://postgres:postgres@localhost:55432/postgres" -f WattApp/db/dumps/gowatt_auth_users.sql
psql "postgresql://postgres:postgres@localhost:55432/postgres" -f WattApp/db/dumps/gowatt_public.sql
```

Then set the backend's connection string in `WattApp/backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres
```

> For deploying the full stack on a real server, see `WattApp/deploy/README.md`.

---

## Typical local run order

```bash
# 1. database
docker start gowatt-db                     # (first time: the docker run above)

# 2. backend  (terminal A)
cd WattApp/backend && npm run dev           # → http://localhost:8090

# 3. mobile app (terminal B)
cd WattApp && npx expo start -c             # scan the QR on your phone

# 4. website (optional)
npx serve .                                 # or just open index.html
```
