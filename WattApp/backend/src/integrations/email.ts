import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

// SMTP email. Used for password reset / verification. No-op (logs) if SMTP is
// not configured, so the app still works in early testing.
let transport: nodemailer.Transporter | null = null;

export function requireEmailDelivery(): void {
  if (env.NODE_ENV === 'production' && !env.SMTP_HOST)
    throw new AppError(503, 'email_unavailable', 'Email delivery is not configured');
}

function getTransport() {
  if (transport) return transport;
  if (!env.SMTP_HOST) return null;
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return transport;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  requireEmailDelivery();
  const tp = getTransport();
  if (!tp) {
    // eslint-disable-next-line no-console
    console.log(`[email:disabled] to=${to} subject="${subject}"`);
    return;
  }
  await tp.sendMail({ from: env.SMTP_FROM, to, subject, html });
}
