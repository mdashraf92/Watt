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

  // Base of the password-reset link emailed to users. The app deep-links on
  // `watt://reset-password?token=…`. Swap to an https:// universal link once the
  // domain + associated-domains are set up.
  PASSWORD_RESET_URL: z.string().default('watt://reset-password'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('no-reply@gowatt.om'),

  // Self-hosted OSRM for in-app driving directions (see docs/SELF_HOSTING.md).
  // Unset → /api/routing/route returns 503 and the app falls back to a straight
  // line, so directions degrade rather than break.
  OSRM_URL: z.string().optional(),

  THAWANI_BASE_URL: z.string().default('https://checkout.thawani.om'),
  THAWANI_SECRET_KEY: z.string().optional(),
  THAWANI_PUBLISHABLE_KEY: z.string().optional(),
  TUYA_BASE_URL: z.string().default('https://openapi.tuyaeu.com'),
  TUYA_CLIENT_ID: z.string().optional(),
  TUYA_CLIENT_SECRET: z.string().optional(),

  // SMS / phone-OTP (iSmartSMS by Infocomm, Oman). If the three required creds
  // are unset, OTP codes are logged to the console instead of being texted.
  // Infocomm ship several endpoints and an account is provisioned for one of
  // them. Ours authenticates on SMSDynamicAPI; the SMSDynamicRefIntlAPI variant
  // in their PDF rejects the same credentials with code 3 (user/password wrong),
  // which reads as a bad password rather than the wrong URL. If a new account
  // returns 3 with credentials you know are right, probe the other endpoints —
  // code 9 (invalid mobile) on a junk number means auth passed.
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
