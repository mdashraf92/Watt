#!/usr/bin/env node
// Build (or upgrade) a LOCAL development database for Go Watt in one command.
//
//   node scripts/setup-local-db.cjs                  apply any new migrations
//   node scripts/setup-local-db.cjs --reset          wipe and rebuild from the dumps
//   node scripts/setup-local-db.cjs --admin you@example.com:Secret123!
//                                                    create/upgrade a superadmin login
//
// Uses DATABASE_URL from backend/.env and the `psql` client (PG_BIN may point at
// PostgreSQL's bin folder). It refuses to touch anything that is not localhost:
// the dumps contain real customer data and --reset drops every table.
//
// Order verified on PostgreSQL 18: roles → auth bootstrap → auth users → auth.uid()
// compat → public dump (July snapshot, includes the Supabase-era migrations) →
// every backend migration in the order it was written.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const MIGRATIONS = [
  'backend-compat.sql', 'backend-tables.sql', 'backend-notifications.sql', 'backend-station-status.sql',
  'backend-realtime.sql', 'backend-saved-cards.sql', 'backend-superadmin-application-actions.sql',
  'backend-mobile-charging.sql', 'backend-trips.sql', 'backend-waitlist.sql', 'backend-support-reports.sql',
  'backend-session-photo.sql', 'backend-overstay-and-refund.sql', 'backend-billing-overrun-fix.sql',
  'backend-mobile-settings.sql', 'backend-unique-email.sql', 'backend-packages.sql',
  'backend-package-purchase-safety.sql', 'backend-package-redemption.sql', 'backend-package-venues.sql',
  'backend-signup-otp.sql', 'backend-email-otp.sql', 'backend-password-reset-otp.sql', 'backend-phone-otp.sql',
  'backend-marketplace.sql', 'backend-dashboard.sql', 'backend-signup-steps.sql', 'backend-marketplace-sellers.sql',
  'backend-seller-portal.sql', 'backend-cafe-orders.sql', 'backend-operations-monitor.sql',
];

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const adminArg = args[args.indexOf('--admin') + 1];
const wantsAdmin = args.includes('--admin');
const sqlDir = path.join(__dirname, '../sql');
const dumpDir = path.join(__dirname, '../../db/dumps');

function fail(message) { console.error(`\n✖ ${message}`); process.exit(1); }

const url = process.env.DATABASE_URL;
if (!url) fail('DATABASE_URL is not set in backend/.env');
let host;
try { host = new URL(url).hostname; } catch { fail('DATABASE_URL is not a valid URL'); }
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  fail(`DATABASE_URL points at "${host}". This script only runs against a local database.\n` +
       '  Set DATABASE_URL=postgresql://postgres:<password>@localhost:5432/gowatt in backend/.env');
}

const psqlExe = process.env.PG_BIN ? path.join(process.env.PG_BIN, process.platform === 'win32' ? 'psql.exe' : 'psql')
  : process.platform === 'win32' && fs.existsSync('C:/Program Files/PostgreSQL/18/bin/psql.exe')
    ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe' : 'psql';

function psql(label, { file, sql, stopOnError = true, ignore = [] }) {
  // -w + ignored stdin: psql must never sit waiting for a password prompt.
  const r = spawnSync(psqlExe, [url, '-q', '-X', '-w', '-v', `ON_ERROR_STOP=${stopOnError ? 1 : 0}`, ...(file ? ['-f', file] : ['-c', sql])],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10 * 60_000, env: { ...process.env, PGCONNECT_TIMEOUT: '10' } });
  if (r.signal) fail(`${label} timed out after 10 minutes.`);
  if (r.error) fail(`Could not run psql (${r.error.message}). Install PostgreSQL or set PG_BIN.`);
  const errors = (r.stderr || '').split('\n').filter(l => /ERROR/.test(l) && !ignore.some(re => re.test(l)));
  if (r.status !== 0 || (stopOnError && errors.length)) fail(`${label} failed:\n${errors.join('\n') || r.stderr}`);
  if (errors.length) console.warn(`  ⚠ ${label}: ${errors.length} unexpected error(s)\n    ${errors.slice(0, 5).join('\n    ')}`);
  console.log(`  ✔ ${label}`);
}

(async () => {
  console.log(`Go Watt local database → ${host} (${new URL(url).pathname.slice(1)})`);
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  try { await client.connect(); }
  catch (e) { fail(`Cannot connect: ${e.message}\n  Is PostgreSQL running, and does the database exist? (createdb gowatt)`); }
  const has = async rel => (await client.query('select to_regclass($1) as r', [rel])).rows[0].r !== null;
  const fresh = reset || !(await has('public.profiles'));

  if (fresh) {
    for (const f of ['gowatt_auth_users.sql', 'gowatt_public.sql']) {
      if (!fs.existsSync(path.join(dumpDir, f))) fail(`Missing db/dumps/${f} — ask the team for the database dumps.`);
    }
    console.log(reset ? 'Rebuilding from the dumps (all local data is replaced)…' : 'Empty database — restoring from the dumps…');
    await client.query(`do $$ begin
      ${['anon', 'authenticated', 'service_role', 'supabase_admin', 'supabase_auth_admin']
        .map(r => `if not exists (select 1 from pg_roles where rolname='${r}') then create role ${r} nologin; end if;`).join('\n      ')}
    end $$;`);
    await client.query('drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;');
    await client.query('create extension if not exists pgcrypto; create extension if not exists btree_gist;');
    await client.end();
    psql('auth schema (local bootstrap)', { file: path.join(sqlDir, 'local-auth-bootstrap.sql') });
    // auth.identities is a Supabase table the backend never reads.
    psql('auth users (dump)', { file: path.join(dumpDir, 'gowatt_auth_users.sql'), stopOnError: false, ignore: [/auth\.identities/] });
    psql('auth.uid() compatibility', { file: path.join(sqlDir, 'backend-compat.sql') });
    psql('public schema + data (dump)', { file: path.join(dumpDir, 'gowatt_public.sql'), stopOnError: false, ignore: [/schema "public" already exists/] });
  } else {
    await client.end();
    console.log('Existing database — applying migrations (all are safe to re-run)…');
  }

  for (const m of MIGRATIONS) psql(m, { file: path.join(sqlDir, m) });

  if (wantsAdmin) {
    const [email, ...rest] = String(adminArg || '').split(':');
    const password = rest.join(':');
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) fail('Use --admin email@example.com:password (password at least 8 characters)');
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 12);
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
      await c.query('begin');
      const existing = await c.query('select id from auth.users where lower(email)=lower($1)', [email]);
      const id = existing.rows[0]?.id ?? (await c.query('select gen_random_uuid() as id')).rows[0].id;
      if (existing.rows[0]) await c.query('update auth.users set encrypted_password=$2, updated_at=now() where id=$1', [id, hash]);
      else await c.query(`insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
                          values ($1, lower($2), $3, now(), now(), now())`, [id, email, hash]);
      await c.query(`insert into profiles (id, full_name, role, is_active) values ($1, 'Local admin', 'superadmin', true)
                     on conflict (id) do update set role='superadmin', is_active=true`, [id]);
      await c.query('commit');
      console.log(`  ✔ superadmin ready: ${email}`);
    } catch (e) { await c.query('rollback').catch(() => {}); fail(`Could not create the admin: ${e.message}`); }
    finally { await c.end(); }
  }

  console.log('\nDone. Start the API with:  npm run dev');
})().catch(e => fail(e.message));
