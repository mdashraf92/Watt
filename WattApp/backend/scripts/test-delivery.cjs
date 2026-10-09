// Isolated delivery tests: no .env, database, or real provider requests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.DOTENV_CONFIG_PATH = require('node:path').join(__dirname, 'no-test-env');
process.env.NODE_ENV = 'production';
process.env.DATABASE_URL = 'postgresql://localhost/test_unused';
process.env.JWT_ACCESS_SECRET = 'isolated-delivery-access-secret';
process.env.JWT_REFRESH_SECRET = 'isolated-delivery-refresh-secret';
for (const key of ['SMTP_HOST', 'ISMARTSMS_USER_ID', 'ISMARTSMS_PASSWORD', 'ISMARTSMS_HEADER']) delete process.env[key];
require('ts-node/register/transpile-only');
const { sendSms } = require('../src/integrations/sms');
const { sendEmail } = require('../src/integrations/email');
test('production SMS cannot report success without a configured provider', async () => {
  await assert.rejects(sendSms('96890000000', 'Test'), { status: 503, code: 'sms_unavailable' });
});
test('production email cannot report success without SMTP', async () => {
  await assert.rejects(sendEmail('test@example.invalid', 'Test', 'Test'), { status: 503, code: 'email_unavailable' });
});
test('email authentication fails before accessing the database when delivery is unavailable', async () => {
  const auth = require('../src/modules/auth/auth.service');
  try {
    for (const action of [auth.startSignup, auth.startEmailOtp, auth.requestPasswordReset])
      await assert.rejects(action('test@example.invalid'), { status: 503, code: 'email_unavailable' });
  } finally { await require('../src/db/pool').pool.end(); }
});
