// Isolated PostgreSQL integration tests. Never reads .env or DATABASE_URL.
// PG_BIN may point at a local PostgreSQL installation; no existing DB is used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { Pool } = require('pg');

test('package purchase money invariants on isolated PostgreSQL', async t => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const tempRoot = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, 'gowatt-packages-test-'));
  const data = path.join(dir, 'data');
  const port = await new Promise(resolve => {
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1', () => {
      const value = socket.address().port;
      socket.close(() => resolve(value));
    });
  });
  const run = (name, args) => execFileSync(exe(name), args, { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  let pool;
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    pool = new Pool({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', max: 4 });
    await pool.query(`
      create schema auth;
      create function auth.uid() returns uuid language sql as $$
        select (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
      $$;
      create table profiles(id uuid primary key, wallet_balance numeric(10,3), held_balance numeric(10,3));
      create table stations(id uuid primary key, name text, name_ar text, address text);
      create table charging_sessions(id uuid primary key);
      create table wallet_transactions(id uuid default gen_random_uuid(), user_id uuid,
        type text, amount numeric(10,3), balance_after numeric(10,3), description text, reference_id text);
      create function is_admin() returns boolean language sql as $$ select false $$;
    `);
    const sqlDir = path.join(__dirname, '../sql');
    await pool.query(fs.readFileSync(path.join(sqlDir, 'backend-packages.sql'), 'utf8'));
    const safety = fs.readFileSync(path.join(sqlDir, 'backend-package-purchase-safety.sql'), 'utf8');
    await pool.query(safety);
    await pool.query(safety); // migration replay must preserve all definitions
    const user = (await pool.query(`insert into profiles values(gen_random_uuid(), 10, 0) returning id`)).rows[0].id;
    const venue = (await pool.query(`insert into stations values(gen_random_uuid(), 'Cafe', 'Cafe AR', 'Muscat') returning id`)).rows[0].id;
    const offer = (await pool.query(`insert into venue_packages
      (station_id,name,name_ar,partner_benefit,partner_benefit_ar,price,included_minutes)
      values($1,'Coffee and charging','Coffee AR','Coffee','Coffee AR',2.500,60) returning id`, [venue])).rows[0].id;
    const version = (await pool.query('select updated_at::text as version from venue_packages where id=$1', [offer])).rows[0].version;
    const buy = async (key, price = 2.5, id = user) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: id })]);
        const { rows } = await client.query('select purchase_package($1,$2,$3,$4) as result', [offer, key, price, version]);
        await client.query('commit');
        return rows[0].result;
      } catch (e) { await client.query('rollback'); throw e; }
      finally { client.release(); }
    };
    let purchased;
    await t.test('concurrent duplicate requests debit once and return the same entitlement', async () => {
      const [a, b] = await Promise.all([buy('duplicate-request-001'), buy('duplicate-request-001')]);
      assert.equal(a.entitlement.id, b.entitlement.id);
      assert.equal(a.balance, 7.5);
      assert.equal(b.balance, 7.5);
      assert.equal((await pool.query('select count(*)::int as n from wallet_transactions')).rows[0].n, 1);
      purchased = a.entitlement;
    });
    await t.test('reserved session funds cannot be spent on packages', async () => {
      await pool.query('update profiles set held_balance=6 where id=$1', [user]);
      await assert.rejects(buy('reserved-balance-001'), /INSUFFICIENT_BALANCE/);
      assert.equal((await pool.query('select count(*)::int as n from entitlements')).rows[0].n, 1);
      await pool.query('update profiles set held_balance=0 where id=$1', [user]);
    });
    await t.test('price changes require a fresh confirmation', async () => {
      await pool.query('update venue_packages set price=3, name=$1, partner_benefit=$2 where id=$3', ['New offer', 'Tea', offer]);
      await assert.rejects(buy('changed-price-001'), /price changed/);
      const { rows } = await pool.query('select package_name,partner_benefit,price_paid from entitlements where id=$1', [purchased.id]);
      assert.equal(rows[0].package_name, 'Coffee and charging');
      assert.equal(rows[0].partner_benefit, 'Coffee');
      assert.equal(Number(rows[0].price_paid), 2.5);
    });
    await t.test('same-price changes to benefits also require confirmation', async () => {
      await pool.query('update venue_packages set price=2.5, updated_at=clock_timestamp() where id=$1', [offer]);
      await assert.rejects(buy('changed-terms-001'), /terms changed/);
    });
    await t.test('retry succeeds even after the offer is changed or disabled', async () => {
      await pool.query('update venue_packages set is_active=false where id=$1', [offer]);
      assert.equal((await buy('duplicate-request-001')).entitlement.id, purchased.id);
      await assert.rejects(buy('disabled-offer-001', 3), /Package not found/);
      await assert.rejects(buy('duplicate-request-001', 3), /another request/);
    });
    await t.test('unknown accounts and legacy purchase calls are rejected', async () => {
      await assert.rejects(buy('unknown-account-001', 3, '00000000-0000-0000-0000-000000000001'), /Account not found/);
      await assert.rejects(pool.query('select purchase_package($1)', [offer]), /Update the app/);
    });
    await t.test('failed requests leave the ledger and balance unchanged', async () => {
      const { rows } = await pool.query('select wallet_balance from profiles where id=$1', [user]);
      assert.equal(Number(rows[0].wallet_balance), 7.5);
      assert.equal((await pool.query('select count(*)::int as n from wallet_transactions')).rows[0].n, 1);
    });
    await require('./test-package-redemption.cjs')(t, pool);
    await require('./test-package-admin.cjs')(t, pool);
  } finally {
    if (pool) await pool.end();
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    // Delete only the exact temporary test cluster created above.
    const resolved = fs.realpathSync(dir);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.ok(path.basename(resolved).startsWith('gowatt-packages-test-'));
    fs.rmSync(resolved, { recursive: true });
  }
});
