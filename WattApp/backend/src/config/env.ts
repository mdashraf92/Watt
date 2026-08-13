import 'dotenv/config';
import { z } from 'zod';

// Validate environment once at startup — fail fast if anything is missing.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),

  CORS_ORIGIN: z.string().default('*'),

  // Public base URL of this backend (used to build payment return/redirect links
  // that hosted checkouts like Thawani require to be valid http(s) URLs).
  PUBLIC_URL: z.string().default('https://go-watt.com'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('no-reply@gowatt.om'),

  // Where a new marketing-site waitlist sign-up is announced. Falls back to
  // SMTP_FROM, so the notification is never silently dropped — but that mailbox
  // is a no-reply, so set this to somebody who reads mail.
  WAITLIST_NOTIFY_TO: z.string().optional(),

  // Self-hosted OSRM for in-app driving directions (see docs/SELF_HOSTING.md).
  // Unset → /api/routing/route returns 503 and the app falls back to a straight
  // line, so directions degrade rather than break.
  OSRM_URL: z.string().optional(),

  // Mapbox Geocoding API, used server-side only for the trip planner's place
  // search (separate product/billing from map tiles — see mapchossing.md for
  // why raster tiles from Mapbox were rejected; geocoding wasn't). Unset →
  // /api/routing/search returns [] and the search box falls back to matching
  // against the app's own stations.
  MAPBOX_TOKEN: z.string().optional(),

  THAWANI_BASE_URL: z.string().default('https://checkout.thawani.om'),
  THAWANI_SECRET_KEY: z.string().optional(),
  THAWANI_PUBLISHABLE_KEY: z.string().optional(),
  TUYA_BASE_URL: z.string().default('https://openapi.tuyaeu.com'),
  TUYA_CLIENT_ID: z.string().optional(),
  TUYA_CLIENT_SECRET: z.string().optional(),

  // SMS / phone-OTP (iSmartSMS by Infocomm, Oman). If the three required creds
  // are unset, OTP codes are logged to the console instead of being texted.
  // Infocomm ship several endpoints; SMSDynamicRefIntlAPI is the one in their
  // PDF, SMSDynamicAPI is set here because it looked like the working one. That
  // is UNVERIFIED — do not trust it without checking. Sending has never actually
  // succeeded on this account, so which endpoint is correct is still unknown.
  //
  // Do not diagnose from the numeric return code alone. This account returned 3
  // (user/password wrong), 7 (account inactive), 9 (invalid mobile) and 12
  // (account blocked) for the SAME credentials, varying only by endpoint and by
  // the MobileNo sent — the endpoints validate fields in a different order, so a
  // code that names one cause can be reporting another. Repeated attempts also
  // got the account blocked, so probe sparingly.
  //
  // To confirm the real state: send from the iSmartSMS web portal. If that works
  // while the API returns an auth error, it is an API-permission problem on
  // Infocomm's side and no change here will fix it.
  ISMARTSMS_URL: z.string().default('https://www.ismartsms.net/iBulkSMS/HttpWS/SMSDynamicAPI.aspx'),
  ISMARTSMS_USER_ID: z.string().optional(),
  ISMARTSMS_PASSWORD: z.string().optional(),
  ISMARTSMS_HEADER: z.string().optional(),   // registered sender ID (≤11 chars), provided by Infocomm

  // Internal-testing ONLY: a master phone-OTP code accepted for any number when
  // NODE_ENV !== 'production'. Lets QA/testers complete phone login while the SMS
  // provider is unavailable. IGNORED in production — never a bypass for real users.
  DEV_OTP_CODE: z.string().default('000000'),

  JOB_SECRET: z.string().min(8).default('change-me'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
