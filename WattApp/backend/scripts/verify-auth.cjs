// Integration check against DATABASE_URL. All records are rolled back; email is captured locally.
require('dotenv').config();
process.env.NODE_ENV = 'production'; // Exercise real OTP validation, without the dev bypass.
require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { pool } = require('../src/db/pool');
const email = require('../src/integrations/email');
let code;
email.sendEmail = async (_to, _subject, html) => {
  code = html.match(/>(\d{6})<\/div>/)?.[1];
};

async function main() {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  let server;
  await client.query('BEGIN');
  // Keep the real route/service SQL inside one rollback-only test transaction.
  pool.query = (...args) => client.query(...args);
  pool.connect = async () => ({
    query: (sql, params) => client.query({
      BEGIN: 'SAVEPOINT auth_check',
      COMMIT: 'RELEASE SAVEPOINT auth_check',
      ROLLBACK: 'ROLLBACK TO SAVEPOINT auth_check',
    }[sql] ?? sql, params),
    release() {},
  });
  try {
    const { createApp } = require('../src/app');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, body, token, expected = 200) {
      const res = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      assert.equal(res.status, expected, `${path}: ${data.error?.message ?? res.status}`);
      console.log(`PASS ${path} (${res.status})`);
      return data;
    }
    const address = `auth-check-${randomUUID()}@example.invalid`;
    const password = `Check9-${randomUUID()}`;
    await request('/api/auth/register/start', { email: address, password, full_name: 'Auth Check' });
    assert.match(code, /^\d{6}$/);
    await request('/api/auth/register/verify', { email: address, code: '000000' }, undefined, 400);
    const signup = await request('/api/auth/register/verify', { email: address, code }, undefined, 201);
    assert.ok(signup.access_token);
    const profile = await request('/api/profile', undefined, signup.access_token);
    assert.equal(profile.email, address);
    const login = await request('/api/auth/login', { email: address, password });
    await request('/api/auth/refresh', { refresh_token: login.refresh_token });
    await request('/api/stations', undefined, login.access_token);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
    console.log('Test records rolled back. No email sent.');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
