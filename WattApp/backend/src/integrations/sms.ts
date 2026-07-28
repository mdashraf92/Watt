import { env } from '../config/env';

// SMS sender. Uses Twilio when configured; otherwise logs the message to the
// console so the OTP flow can be tested end-to-end without a paid provider.
//
// To go live: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM in the
// backend .env. TWILIO_FROM may be a sender phone number (+968…) or a Messaging
// Service SID (starts with "MG"). Swapping providers later means editing only
// this file.

export function smsConfigured(): boolean {
  return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
}

export async function sendSms(to: string, body: string): Promise<void> {
  if (!smsConfigured()) {
    // Dev fallback — the code is printed so you can complete the flow locally.
    // eslint-disable-next-line no-console
    console.log(`[sms:log] to=${to} :: ${body}`);
    return;
  }

  const sid = env.TWILIO_ACCOUNT_SID!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams();
  params.set('To', to);
  params.set('Body', body);
  // "MG…" = Messaging Service SID; anything else = a From number.
  if (env.TWILIO_FROM!.startsWith('MG')) params.set('MessagingServiceSid', env.TWILIO_FROM!);
  else params.set('From', env.TWILIO_FROM!);

  const auth = Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SMS send failed (${res.status}): ${text}`);
  }
}
