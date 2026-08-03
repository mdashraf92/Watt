import { env } from '../config/env';

// SMS sender — iSmartSMS (Infocomm Group LLC, Oman) HTTP POST "SMS PUSH" API.
// Uses the live provider when configured; otherwise logs the message to the
// console so the OTP flow can be tested end-to-end without spending credit.
//
// To go live, set these in the backend .env (values provided by Infocomm):
//   ISMARTSMS_USER_ID, ISMARTSMS_PASSWORD, ISMARTSMS_HEADER
// ISMARTSMS_HEADER is the registered sender ID (≤11 chars). Swapping providers
// later means editing only this file.

// Response is a bare return code; 1 = success, everything else is an error.
const RETURN_CODES: Record<string, string> = {
  '2': 'Company does not exist',
  '3': 'SMS user or password is wrong',
  '4': 'SMS credit is low',
  '5': 'Message is blank',
  '6': 'Message length exceeded',
  '7': 'SMS account is inactive',
  '8': 'Mobile number is empty',
  '9': 'Invalid mobile number',
  '10': 'Invalid language',
  '11': 'Unknown SMS provider error',
  '12': 'SMS account blocked',
  '13': 'SMS account expired',
  '14': 'SMS credit expired',
  '15': 'Invalid request or parameter fields',
  '16': 'Invalid date-time parameter',
  '17': 'Web service user id not registered',
  '18': 'User id not registered to use the API',
  '19': 'Header not registered with Infocomm',
  '20': 'Client IP address blocked',
  '23': 'Recipient has opted out of SMS',
  '24': 'Too many mobile numbers (max 50)',
  '25': 'SMS API expired',
};

export function smsConfigured(): boolean {
  return !!(env.ISMARTSMS_USER_ID && env.ISMARTSMS_PASSWORD && env.ISMARTSMS_HEADER);
}

export async function sendSms(to: string, body: string): Promise<void> {
  if (!smsConfigured()) {
    // Dev fallback — the code is printed so you can complete the flow locally.
    // eslint-disable-next-line no-console
    console.log(`[sms:log] to=${to} :: ${body}`);
    return;
  }

  // iSmartSMS wants the number as digits only, with country code, no "+"
  // (Oman = 968 + 8 local digits = 11 digits, e.g. 96899XXXXXX).
  const mobileNo = to.replace(/\D/g, '');

  const params = new URLSearchParams();
  params.set('UserId', env.ISMARTSMS_USER_ID!);
  params.set('Password', env.ISMARTSMS_PASSWORD!);
  params.set('MobileNo', mobileNo);
  params.set('Message', body);
  params.set('Lang', '0');            // 0 = English, 64 = Arabic
  params.set('Header', env.ISMARTSMS_HEADER!);
  // PushDateTime omitted → provider sends immediately.

  const res = await fetch(env.ISMARTSMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const text = (await res.text().catch(() => '')).trim();
  if (!res.ok) {
    throw new Error(`SMS send failed (HTTP ${res.status}): ${text}`);
  }
  // Success is return code "1". The body may carry trailing whitespace/newlines.
  const code = text.split(/\s+/)[0];
  if (code !== '1') {
    throw new Error(`SMS send failed (code ${code || 'empty'}): ${RETURN_CODES[code] ?? 'Unknown error'}`);
  }
}
