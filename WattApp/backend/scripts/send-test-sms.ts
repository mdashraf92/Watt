/**
 * Send one real SMS through the app's own SMS path, for provider verification.
 *
 *   npm run sms:test -- 96898568885
 *   npm run sms:test -- 96898568885 "custom message"
 *
 * Infocomm ask for a send from our system to one of their designated numbers
 * (98568885) as part of enabling API access, and they ask again whenever the
 * source server changes. This goes through sendSms() rather than a hand-built
 * request, so what they receive is exactly what production sends.
 *
 * The number must be digits only with country code and no plus: 98568885
 * becomes 96898568885.
 *
 * Costs one SMS credit on success. Auth and permission failures are rejected
 * before dispatch and cost nothing.
 */
import { env } from '../src/config/env';
import { sendSms, smsConfigured } from '../src/integrations/sms';

const DEFAULT_MESSAGE =
  'GO WATT API integration test from Ankaa Space and Technologies. Please confirm receipt.';

async function main() {
  const to = process.argv[2];
  const message = process.argv[3] ?? DEFAULT_MESSAGE;

  if (!to) {
    console.error('Usage: npm run sms:test -- <mobile with country code> ["message"]');
    console.error('Example: npm run sms:test -- 96898568885');
    process.exit(1);
  }
  // Minimum 10 digits, because the point of this check is to catch a number
  // passed WITHOUT its country code. An Omani local number is 8 digits, so a
  // range starting at 8 would wave it straight through — which is exactly the
  // mistake this guard exists to prevent.
  if (!/^\d{10,15}$/.test(to)) {
    console.error(`Refusing to send: "${to}" does not look like an international number.`);
    console.error('Give digits only, country code included, no "+" and no spaces.');
    console.error(`Oman is 968 + 8 digits — for 98568885 pass 96898568885.`);
    process.exit(1);
  }

  console.log('--- configuration in use -----------------------------------');
  console.log('endpoint  :', env.ISMARTSMS_URL);
  console.log('user id   :', env.ISMARTSMS_USER_ID ?? '(unset)');
  console.log('header    :', env.ISMARTSMS_HEADER ?? '(unset)');
  // Never print the password itself — only enough to prove it is loaded.
  console.log('password  :', env.ISMARTSMS_PASSWORD ? `set (${env.ISMARTSMS_PASSWORD.length} chars)` : '(unset)');
  console.log('recipient :', to);
  console.log('sent at   :', new Date().toISOString(), '(UTC)');
  console.log('------------------------------------------------------------');

  if (!smsConfigured()) {
    console.error('\nABORT: ISMARTSMS_USER_ID, ISMARTSMS_PASSWORD and ISMARTSMS_HEADER must all');
    console.error('be set in backend/.env. With any of them blank the app logs OTPs to the');
    console.error('console instead of sending, so nothing would reach the provider.');
    process.exit(1);
  }

  try {
    await sendSms(to, message);
    console.log('\nRESULT: return code 1 — SUCCESS, accepted for delivery (1 credit used)');
    console.log('message :', message);
  } catch (e: any) {
    console.error('\nRESULT: FAILED —', e?.message ?? e);
    console.error('\nThe provider rejects before dispatch, so a failure here costs no credit.');
    console.error('Return-code meanings are listed in src/integrations/sms.ts.');
    process.exit(1);
  }
}

main();
