const assert = require('node:assert/strict');
require('ts-node/register');

module.exports = async function adminTests(t, pool) {
  await pool.query(`alter table profiles add column full_name text, add column phone text;
    alter table bookings add column station_id uuid;
    alter table charger_listings add column tuya_device_id text;`);
  const migration = require('node:fs').readFileSync(require('node:path').join(__dirname, '../sql/backend-package-venues.sql'), 'utf8');
  await pool.query(migration);
  await pool.query(migration);
  // Inject only the isolated database and test identity. The real router,
  // role guard, body validation and SQL run without loading application .env.
  const poolPath = require.resolve('../src/db/pool.ts');
  const authPath = require.resolve('../src/middleware/auth.ts');
  const previousPool = require.cache[poolPath];
  const previousAuth = require.cache[authPath];
  const user = (await pool.query('select id from profiles limit 1')).rows[0].id;
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: {
    query: (sql, args) => pool.query(sql, args),
    withUser: async (_id, fn) => {
      const client = await pool.connect();
      try { await client.query('begin'); const result = await fn(client); await client.query('commit'); return result; }
      catch (e) { await client.query('rollback'); throw e; }
      finally { client.release(); }
    },
  } };
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
    requireAuth: (req, _res, next) => { req.user = { id: user, role: req.headers['x-test-role'] || 'customer' }; next(); },
  } };
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use(require('../src/modules/packages/admin.routes.ts').default);
  app.use(require('../src/middleware/error.ts').errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, url, body, role = 'admin') => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'x-test-role': role }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const station_id = (await pool.query('select id from stations limit 1')).rows[0].id;
    const draft = { station_id, name: 'Coffee', name_ar: 'Arabic coffee', partner_benefit: 'Coffee', partner_benefit_ar: 'Arabic coffee', price: 2.125, included_minutes: 60 };
    let id;
    await t.test('admin package creation defaults to paused and customer access is denied', async () => {
      assert.equal((await request('GET', '/packages', undefined, 'customer')).status, 403);
      assert.equal((await request('POST', '/packages', draft, 'customer')).status, 403);
      const created = await request('POST', '/packages', draft);
      assert.equal(created.status, 201);
      assert.equal(created.body.is_active, false);
      id = created.body.id;
    });
    await t.test('offer validation rejects excess price precision, blank names and missing caps', async () => {
      for (const patch of [{ price: 2.1234 }, { name: '   ' }, { included_minutes: null }]) {
        assert.equal((await request('POST', '/packages', { ...draft, ...patch })).status, 400);
      }
      assert.equal((await request('GET', '/packages?station_id=bad')).status, 400);
    });
    await t.test('concurrent admin edits cannot overwrite the same offer version', async () => {
      const offers = await request('GET', '/packages');
      const version = offers.body.find(p => p.id === id).offer_version;
      const results = await Promise.all([
        request('PATCH', `/packages/${id}`, { expected_version: version, name: 'First' }),
        request('PATCH', `/packages/${id}`, { expected_version: version, name: 'Second' }),
      ]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const saved = (await pool.query('select * from venue_packages where id=$1', [id])).rows[0];
      assert.equal(saved.is_active, false);
      assert.equal(saved.included_minutes, 60);
    });
    await t.test('clearing the final cap fails; explicit publishing preserves other terms', async () => {
      assert.equal((await request('PATCH', `/packages/${id}`, { included_minutes: null })).status, 400);
      const offers = await request('GET', '/packages');
      const version = offers.body.find(p => p.id === id).offer_version;
      const published = await request('PATCH', `/packages/${id}`, { expected_version: version, is_active: true });
      assert.equal(published.status, 200);
      assert.equal(published.body.is_active, true);
      assert.equal(Number(published.body.price), 2.125);
      assert.equal(published.body.included_minutes, 60);
    });
    await t.test('venue operations are admin-only and staff lookup exposes scoped fields', async () => {
      await pool.query('update profiles set full_name=$2,phone=$3 where id=$1', [user, 'Test Staff', '+96899990000']);
      assert.equal((await request('GET', `/packages/venues/${station_id}/operations`, undefined, 'customer')).status, 403);
      const found = await request('GET', '/packages/staff-search?phone=%2B96899990000');
      assert.equal(found.body[0].id, user);
      assert.equal(found.body[0].wallet_balance, undefined);
      assert.equal((await request('GET', '/packages/staff-search?phone=99')).status, 400);
      assert.equal((await request('PUT', '/packages/staff', { station_id, user_id: user, enabled: true })).status, 204);
      let ops = await request('GET', `/packages/venues/${station_id}/operations`);
      assert.ok(ops.body.staff.some(p => p.id === user));
      await request('PUT', '/packages/staff', { station_id, user_id: user, enabled: false });
      ops = await request('GET', `/packages/venues/${station_id}/operations`);
      assert.ok(!ops.body.staff.some(p => p.id === user));
    });
    await t.test('package venue mode blocks legacy bookings and connector-based sessions', async () => {
      const venue = (await pool.query("insert into stations(id,name) values(gen_random_uuid(),'Package venue') returning id")).rows[0].id;
      const connector = (await pool.query('insert into connectors(station_id) values($1) returning id', [venue])).rows[0].id;
      const booking = (await pool.query("insert into bookings(id,station_id,status) values(gen_random_uuid(),$1,'confirmed') returning id", [venue])).rows[0].id;
      assert.equal((await request('PUT', `/packages/venues/${venue}`, { is_package_venue: true })).status, 409);
      await pool.query("update bookings set status='cancelled' where id=$1", [booking]);
      assert.equal((await request('PUT', `/packages/venues/${venue}`, { is_package_venue: true })).status, 204);
      await assert.rejects(pool.query("insert into bookings(id,station_id,status) values(gen_random_uuid(),$1,'confirmed')", [venue]), /Choose a venue package/);
      await assert.rejects(pool.query('insert into charging_sessions(user_id,connector_id) values($1,$2)', [user, connector]), /Use package session control/);
      const config = { connector_id: connector, device_id: 'operations-device', switch_code: 'switch', energy_code: 'energy', energy_scale: 0.001, enabled: false };
      assert.equal((await request('PUT', '/packages/devices', config)).status, 204);
      const operations = await request('GET', `/packages/venues/${venue}/operations`);
      assert.equal(operations.body.venue.is_package_venue, true);
      assert.equal(operations.body.devices[0].device_id, 'operations-device');
      assert.equal((await request('PUT', '/packages/devices', { ...config, energy_scale: 0 })).status, 400);
      await request('PUT', `/packages/venues/${venue}`, { is_package_venue: false });
      const session = (await pool.query('insert into charging_sessions(user_id,station_id,connector_id) values($1,$2,$3) returning id', [user, venue, connector])).rows[0].id;
      assert.equal((await request('PUT', '/packages/devices', { ...config, enabled: true })).status, 400);
      assert.equal((await request('PUT', `/packages/venues/${venue}`, { is_package_venue: true })).status, 409);
      await pool.query("update charging_sessions set status='completed' where id=$1", [session]);
    });
  } finally {
    await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    if (previousPool) require.cache[poolPath] = previousPool; else delete require.cache[poolPath];
    if (previousAuth) require.cache[authPath] = previousAuth; else delete require.cache[authPath];
  }
};
