const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node/register');
const { PackageChargingService } = require('../src/modules/packages/charging.service.ts');

module.exports = async function redemptionTests(t, pool) {
  // Minimal faithful columns for the integration boundary; no production dumps,
  // private data, live hardware or payment gateway are loaded by this suite.
  await pool.query(`
    alter table charging_sessions alter column id set default gen_random_uuid();
    alter table charging_sessions add column user_id uuid, add column station_id uuid,
      add column connector_id uuid, add column status text default 'active',
      add column started_at timestamptz default now(), add column ended_at timestamptz,
      add column created_at timestamptz default now(),
      add column kwh_delivered numeric default 0, add column cost numeric default 0,
      add column held_amount numeric default 0, add column meter_kwh numeric,
      add column flagged_review boolean default false;
    alter table charging_sessions add column booking_id uuid, add column listing_id uuid,
      add column hold_shortfall numeric default 0, add column battery_end_pct integer;
    alter table stations add column price_per_kwh numeric default 0.1, add column power_kw numeric default 22;
    alter table profiles add column total_sessions integer default 0, add column total_kwh numeric default 0;
    create table bookings(id uuid primary key, listing_id uuid, status text);
    create table charger_listings(id uuid primary key, price_per_kwh numeric, power_kw numeric);
    create function credit_host_earning(uuid,text,numeric) returns void language sql as $$ select $$;
    create table connectors(id uuid primary key default gen_random_uuid(), station_id uuid,
      status text default 'available', connector_type text default 'Type2', power_kw numeric default 22);
    create or replace function is_admin() returns boolean language sql as $$
      select coalesce(current_setting('request.jwt.claims',true)::jsonb ->> 'test_admin','false')='true'
    $$;
  `);
  const migration = fs.readFileSync(path.join(__dirname, '../sql/backend-package-redemption.sql'), 'utf8');
  await pool.query(migration);
  await pool.query(migration);
  await pool.query(fs.readFileSync(path.join(__dirname, '../sql/backend-billing-overrun-fix.sql'), 'utf8'));

  async function asUser(id, sql, args = [], admin = false) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, test_admin: admin })]);
      const result = await client.query(sql, args);
      await client.query('commit');
      return result.rows[0]?.result;
    } catch (e) { await client.query('rollback'); throw e; }
    finally { client.release(); }
  }

  async function fixture() {
    const user = (await pool.query('insert into profiles(id,wallet_balance,held_balance) values(gen_random_uuid(),20,0) returning id')).rows[0].id;
    const venue = (await pool.query("insert into stations(id,name,name_ar,address) values(gen_random_uuid(),'Venue','Venue AR','Muscat') returning id")).rows[0].id;
    const connector = (await pool.query('insert into connectors(station_id) values($1) returning id', [venue])).rows[0].id;
    await pool.query("insert into package_devices values($1,$2,'switch','energy',0.001,true)", [connector, `test-${connector}`]);
    const pkg = (await pool.query(`insert into venue_packages(station_id,name,name_ar,partner_benefit,partner_benefit_ar,price,included_minutes,included_kwh)
      values($1,'Coffee','Coffee AR','Coffee','Coffee AR',2,60,5) returning id,updated_at::text as version`, [venue])).rows[0];
    const purchased = await asUser(user, 'select purchase_package($1,$2,$3,$4) as result', [pkg.id, `purchase-${user}`, 2, pkg.version]);
    const ent = purchased.entitlement.id;
    await pool.query('insert into package_monitor values(true,now()) on conflict(id) do update set checked_at=now()');
    const device = { on: false, energy: 100, rejectOff: false, loseOnAck: false, failRead: false };
    const commands = [];
    const hardware = {
      async read() { if (device.failRead) throw new Error('offline'); return { on: device.on, energy: device.energy }; },
      async switch(_run, on) {
        commands.push(on);
        if (!on && device.rejectOff) throw new Error('OFF failed');
        device.on = on;
        if (on && device.loseOnAck) throw new Error('ON response lost');
      },
    };
    const service = new PackageChargingService(pool, hardware);
    return { user, venue, connector, ent, service, device, commands };
  }

  await t.test('package start takes no hold and repeated start/stop consume once without a second debit', async () => {
    const f = await fixture();
    const a = await f.service.start(f.user, f.ent, f.connector, 'start-normal-00001');
    const b = await f.service.start(f.user, f.ent, f.connector, 'start-normal-00001');
    assert.equal(a.id, b.id); assert.equal(f.commands.filter(Boolean).length, 1);
    f.device.energy = 102;
    const stopped = await f.service.stop(a.id, f.user);
    await f.service.stop(a.id, f.user);
    assert.equal(stopped.state, 'completed'); assert.equal(f.device.on, false);
    const e = (await pool.query('select * from entitlements where id=$1', [f.ent])).rows[0];
    assert.equal(Number(e.kwh_used), 2); assert.equal(e.benefit_redeemed_at, null);
    const p = (await pool.query('select * from profiles where id=$1', [f.user])).rows[0];
    assert.equal(Number(p.wallet_balance), 18); assert.equal(Number(p.held_balance), 0);
    assert.equal((await pool.query('select count(*)::int n from wallet_transactions where user_id=$1', [f.user])).rows[0].n, 1);
    assert.equal((await pool.query('select count(*)::int n from entitlement_redemptions where entitlement_id=$1', [f.ent])).rows[0].n, 1);
  });
  await t.test('wrong owner/venue and stale monitor cannot activate hardware', async () => {
    const f = await fixture(), other = await fixture();
    await assert.rejects(f.service.start(other.user, f.ent, f.connector, 'start-owner-00001'), /Not your package/);
    await assert.rejects(f.service.start(f.user, f.ent, other.connector, 'start-venue-00001'), /Wrong venue/);
    await pool.query('delete from package_monitor');
    await assert.rejects(f.service.start(f.user, f.ent, f.connector, 'start-monitor-001'), /monitor is not ready/);
    assert.equal(f.commands.length, 0);
  });
  await t.test('failed OFF retains reservation and monitor retries to completion', async () => {
    const f = await fixture();
    const run = await f.service.start(f.user, f.ent, f.connector, 'start-off-fail-01');
    f.device.energy = 101; f.device.rejectOff = true;
    await assert.rejects(f.service.stop(run.id, f.user), /OFF failed/);
    assert.equal((await pool.query('select state from package_charging_runs where id=$1', [run.id])).rows[0].state, 'stopping');
    await assert.rejects(f.service.start(f.user, f.ent, f.connector, 'start-duplicate-01'), /active session/);
    f.device.rejectOff = false;
    await f.service.poll();
    assert.equal((await pool.query('select state from package_charging_runs where id=$1', [run.id])).rows[0].state, 'completed');
  });
  await t.test('lost ON response is followed by confirmed OFF and no second payment', async () => {
    const f = await fixture(); f.device.loseOnAck = true;
    await assert.rejects(f.service.start(f.user, f.ent, f.connector, 'start-lost-ack-01'), /response lost/);
    assert.deepEqual(f.commands, [true, false]); assert.equal(f.device.on, false);
    const retry = await f.service.start(f.user, f.ent, f.connector, 'start-lost-ack-01');
    assert.equal(retry.state, 'completed'); assert.equal(f.commands.length, 2);
    assert.equal(retry.flagged_review, true);
  });
  await t.test('energy cap stops charging, records actual energy, clamps allowance and does not charge excess', async () => {
    const f = await fixture();
    const run = await f.service.start(f.user, f.ent, f.connector, 'start-energy-001');
    f.device.energy = 106;
    await f.service.poll();
    const e = (await pool.query('select * from entitlements where id=$1', [f.ent])).rows[0];
    assert.equal(Number(e.kwh_used), 5); assert.equal(e.status, 'consumed');
    const s = (await pool.query('select * from charging_sessions where id=$1', [run.id])).rows[0];
    assert.equal(Number(s.kwh_delivered), 6); assert.equal(Number(s.cost), 0);
    assert.equal(f.device.on, false);
  });
  await t.test('expiry/time deadline stops a session without consuming the venue benefit', async () => {
    const f = await fixture();
    const run = await f.service.start(f.user, f.ent, f.connector, 'start-deadline-01');
    await pool.query("update package_charging_runs set deadline=now()-interval '1 second' where id=$1", [run.id]);
    await f.service.poll();
    assert.equal(f.device.on, false);
    assert.equal((await pool.query('select benefit_redeemed_at from entitlements where id=$1', [f.ent])).rows[0].benefit_redeemed_at, null);
  });
  await t.test('meter reset stops and flags the package, preventing another start', async () => {
    const f = await fixture();
    const run = await f.service.start(f.user, f.ent, f.connector, 'start-meter-0001');
    f.device.energy = 2;
    await f.service.poll();
    const row = (await pool.query('select * from package_charging_runs where id=$1', [run.id])).rows[0];
    assert.equal(row.flagged_review, true); assert.equal(row.state, 'completed');
    await assert.rejects(f.service.start(f.user, f.ent, f.connector, 'start-meter-0002'), /meter review/);
  });
  await t.test('legacy billing attempts and customer energy writes roll back', async () => {
    const f = await fixture();
    const run = await f.service.start(f.user, f.ent, f.connector, 'start-billing-001');
    await assert.rejects(pool.query('update charging_sessions set cost=7 where id=$1', [run.id]), /cannot be billed/);
    await assert.rejects(pool.query("update charging_sessions set status='completed' where id=$1", [run.id]), /package session control/);
    await assert.rejects(pool.query('update charging_sessions set kwh_delivered=9 where id=$1', [run.id]), /package session control/);
    await assert.rejects(pool.query('select _finalize_charging_session($1,3)', [run.id]), /Package sessions cannot be billed|package session control/);
    await assert.rejects(asUser(f.user, 'select redeem_entitlement($1,null,30,2) as result', [f.ent]), /trusted package/);
    await assert.rejects(f.service.stop(run.id, '00000000-0000-0000-0000-000000000001'), /Forbidden/);
    await f.service.stop(run.id, f.user);
  });
  await t.test('benefit redemption is venue-scoped, idempotent and blocks full refund atomically', async () => {
    const f = await fixture(), staff = await fixture(), stranger = await fixture();
    await pool.query('insert into venue_staff values($1,$2)', [f.venue, staff.user]);
    await assert.rejects(asUser(stranger.user, 'select redeem_package_benefit($1) as result', [f.ent]), /Not staff/);
    const a = await asUser(staff.user, 'select redeem_package_benefit($1) as result', [f.ent]);
    const b = await asUser(staff.user, 'select redeem_package_benefit($1) as result', [f.ent]);
    assert.equal(a.benefit_redeemed_at, b.benefit_redeemed_at);
    assert.equal(Number(a.minutes_used), 0); assert.equal(Number(a.kwh_used), 0);
    await assert.rejects(asUser(staff.user, 'select refund_entitlement($1) as result', [f.ent], true), /reviewed refund/);
    assert.equal(Number((await pool.query('select wallet_balance from profiles where id=$1', [f.user])).rows[0].wallet_balance), 18);
  });
  await t.test('coffee can be redeemed after charging is exhausted, but not after expiry', async () => {
    const f = await fixture();
    await pool.query('insert into venue_staff values($1,$2)', [f.venue, f.user]);
    await pool.query("update entitlements set status='consumed',kwh_used=5 where id=$1", [f.ent]);
    assert.ok((await asUser(f.user, 'select redeem_package_benefit($1) as result', [f.ent])).benefit_redeemed_at);
    const expired = await fixture();
    await pool.query("update entitlements set expires_at=now()-interval '1 minute' where id=$1", [expired.ent]);
    await assert.rejects(asUser(f.user, 'select redeem_package_benefit($1) as result', [expired.ent], true), /Benefit unavailable/);
  });
  await t.test('concurrent starts cannot both activate a connector', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      f.service.start(f.user, f.ent, f.connector, 'start-racing-0001'),
      f.service.start(f.user, f.ent, f.connector, 'start-racing-0002'),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(f.commands.filter(Boolean).length, 1);
    await f.service.stop(results.find(r => r.status === 'fulfilled').value.id, f.user);
  });
  await t.test('ordinary charging still uses its existing billing finalizer', async () => {
    const f = await fixture();
    const run = (await pool.query("insert into charging_sessions(user_id,station_id,connector_id,started_at) values($1,$2,$3,now()-interval '1 hour') returning id", [f.user,f.venue,f.connector])).rows[0];
    const result = (await pool.query('select _finalize_charging_session($1,2) as result', [run.id])).rows[0].result;
    assert.equal(result.cost, 0.2);
    assert.equal(result.balance, 17.8);
  });
};
