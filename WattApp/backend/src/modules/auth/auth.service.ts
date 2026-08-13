import { randomBytes, randomUUID } from 'crypto';
import { pool, withUser } from '../../db/pool';
import { hashPassword, verifyPassword, hashToken } from '../../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { AppError, badRequest, conflict, unauthorized } from '../../lib/errors';
import { sendSms } from '../../integrations/sms';
import { sendEmail } from '../../integrations/email';
import { env, isProd } from '../../config/env';

const REFRESH_DAYS = 30;

// ── Phone OTP tuning ────────────────────────────────────────────────────────
const OTP_TTL_MIN = 5;          // a code is valid for 5 minutes
const OTP_MAX_ATTEMPTS = 5;     // wrong-code tries before the code is dead
const OTP_MAX_SENDS_15M = 5;    // codes we'll send to one number per 15 minutes

async function getUserByEmail(email: string) {
  const { rows } = await pool.query(
    `select u.id, u.email, u.encrypted_password, u.email_confirmed_at, p.role
     from auth.users u left join public.profiles p on p.id = u.id
     where lower(u.email) = lower($1) limit 1`,
    [email],
  );
  return rows[0] ?? null;
}

async function issueTokens(userId: string, role: string) {
  const access = signAccessToken(userId, role);
  const jti = randomUUID();
  const refresh = signRefreshToken(userId, jti);
  const expires = new Date(Date.now() + REFRESH_DAYS * 864e5);
  await pool.query(
    `insert into public.auth_refresh_tokens (user_id, token_hash, expires_at) values ($1,$2,$3)`,
    [userId, hashToken(refresh), expires],
  );
  return { access_token: access, refresh_token: refresh };
}

// Create the auth user + profile in one transaction. (handle_new_user trigger
// may also create the profile; the upsert keeps this idempotent.) Shared by
// completeSignup — the only caller now that sign-up is verify-then-create.
async function createAccount(email: string, passwordHash: string, fullName: string) {
  const id = randomUUID();
  await withUser(null, async (client) => {
    await client.query(
      `insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1, lower($2), $3, now(), now(), now())`,
      [id, email, passwordHash],
    );
    await client.query(
      `insert into public.profiles (id, full_name, role)
       values ($1, $2, 'customer')
       on conflict (id) do update set full_name = excluded.full_name`,
      [id, fullName],
    );
  });
  return id;
}

// ── Email sign-up (verify before create) ────────────────────────────────────
// Two steps: startSignup emails a code without creating anything yet;
// completeSignup only creates the account once that code is confirmed. This
// is what catches a mistyped email at sign-up time instead of silently
// creating an account nobody can ever verify or recover.

function signupEmailHtml(code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F6F8F7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16241D">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E4E9E6">
        <tr><td style="background:#214A38;padding:28px 28px 24px">
          <span style="color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:3px">GO WATT</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 8px;font-size:20px;color:#16241D">Verify your email</h1>
          <p style="margin:0 0 22px;font-size:14px;line-height:22px;color:#5A6B62">
            Enter this code in the app to finish creating your account. It expires in <strong>${OTP_TTL_MIN} minutes</strong>.
          </p>
          <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#378B5A;text-align:center;padding:16px;background:#F0F7F3;border-radius:12px">${code}</div>
          <p style="margin:22px 0 0;font-size:12px;line-height:18px;color:#95A29B">
            If you didn't request this, you can safely ignore this email — no account has been created.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export async function startSignup(rawEmail: string, password: string, fullName: string) {
  const email = rawEmail.trim().toLowerCase();
  if (await getUserByEmail(email)) throw conflict('Email already registered');

  const { rows: recent } = await pool.query(
    `select count(*)::int as n from public.pending_signups
     where email = $1 and created_at > now() - interval '15 minutes'`,
    [email],
  );
  if ((recent[0]?.n ?? 0) >= OTP_MAX_SENDS_15M)
    throw badRequest('Too many code requests. Please try again in a few minutes.');

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const passwordHash = await hashPassword(password);
  await pool.query(`update public.pending_signups set consumed = true where email = $1 and consumed = false`, [email]);
  await pool.query(
    `insert into public.pending_signups (email, password_hash, full_name, code_hash, expires_at)
     values ($1, $2, $3, $4, now() + interval '${OTP_TTL_MIN} minutes')`,
    [email, passwordHash, fullName, hashToken(code)],
  );

  sendEmail(email, 'Verify your GO WATT account', signupEmailHtml(code))
    // eslint-disable-next-line no-console
    .catch((e) => console.error('[signup-otp] send failed:', e?.message ?? e));
  if (!isProd) {
    // eslint-disable-next-line no-console
    console.warn(`[otp] non-prod: signup code for ${email} is ${code}`);
  }
  return { ok: true };
}

export async function completeSignup(rawEmail: string, code: string) {
  const email = rawEmail.trim().toLowerCase();

  const { rows } = await pool.query(
    `select id, password_hash, full_name, code_hash, expires_at, attempts from public.pending_signups
     where email = $1 and consumed = false order by created_at desc limit 1`,
    [email],
  );
  const row = rows[0];
  if (!row) throw badRequest('No pending sign-up found for this email. Please start again.');

  const devBypass = !isProd && code.trim() === env.DEV_OTP_CODE;
  if (!devBypass) {
    if (new Date(row.expires_at) < new Date())
      throw badRequest('Code expired. Please request a new one.');
    if (row.attempts >= OTP_MAX_ATTEMPTS)
      throw badRequest('Too many attempts. Please request a new code.');
    if (hashToken(code.trim()) !== row.code_hash) {
      await pool.query(`update public.pending_signups set attempts = attempts + 1 where id = $1`, [row.id]);
      throw badRequest('Incorrect code. Please try again.');
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[otp] non-prod DEV_OTP_CODE accepted for signup ${email}`);
  }

  // Someone else could have registered this email while the code sat unused.
  if (await getUserByEmail(email)) throw conflict('Email already registered');

  await pool.query(`update public.pending_signups set consumed = true where id = $1`, [row.id]);
  const id = await createAccount(email, row.password_hash, row.full_name);
  const tokens = await issueTokens(id, 'customer');
  return { user: { id, email, role: 'customer', full_name: row.full_name }, ...tokens };
}

export async function login(email: string, password: string) {
  const u = await getUserByEmail(email);
  if (!u) throw unauthorized('Invalid email or password');
  const ok = await verifyPassword(u.encrypted_password, password);
  if (!ok) throw unauthorized('Invalid email or password');
  const role = u.role ?? 'customer';
  const tokens = await issueTokens(u.id, role);
  return { user: { id: u.id, email: u.email, role }, ...tokens };
}

export async function refresh(refreshToken: string) {
  let payload;
  try { payload = verifyRefreshToken(refreshToken); }
  catch { throw unauthorized('Invalid refresh token'); }

  const h = hashToken(refreshToken);
  const { rows } = await pool.query(
    `select id, revoked, expires_at from public.auth_refresh_tokens
     where token_hash = $1 and user_id = $2 limit 1`,
    [h, payload.sub],
  );
  const row = rows[0];
  if (!row || row.revoked || new Date(row.expires_at) < new Date())
    throw unauthorized('Refresh token expired');

  // Rotate: revoke the old token, issue a new pair.
  await pool.query(`update public.auth_refresh_tokens set revoked = true where id = $1`, [row.id]);
  const { rows: pr } = await pool.query(`select role from public.profiles where id = $1`, [payload.sub]);
  return issueTokens(payload.sub, pr[0]?.role ?? 'customer');
}

export async function logout(refreshToken: string) {
  if (!refreshToken) return;
  await pool.query(
    `update public.auth_refresh_tokens set revoked = true where token_hash = $1`,
    [hashToken(refreshToken)],
  );
}

export async function changePassword(userId: string, current: string, next: string) {
  const { rows } = await pool.query(`select encrypted_password from auth.users where id = $1`, [userId]);
  if (!rows[0] || !(await verifyPassword(rows[0].encrypted_password, current)))
    throw badRequest('Current password is incorrect');
  await pool.query(`update auth.users set encrypted_password = $1, updated_at = now() where id = $2`,
    [await hashPassword(next), userId]);
  // Revoke all sessions on password change.
  await pool.query(`update public.auth_refresh_tokens set revoked = true where user_id = $1`, [userId]);
}

// ── Password reset (email link) ─────────────────────────────────────────────
export async function requestPasswordReset(email: string): Promise<string | null> {
  const u = await getUserByEmail(email);
  if (!u) return null;                              // don't reveal whether the email exists
  const token = randomBytes(32).toString('hex');
  await pool.query(
    `insert into public.auth_tokens (user_id, purpose, token_hash, expires_at)
     values ($1,'reset',$2, now() + interval '1 hour')`,
    [u.id, hashToken(token)],
  );
  return token;                                     // caller emails the reset link
}

export async function resetPassword(token: string, newPassword: string) {
  const h = hashToken(token);
  const { rows } = await pool.query(
    `select id, user_id, expires_at, used from public.auth_tokens
     where token_hash = $1 and purpose = 'reset' limit 1`,
    [h],
  );
  const row = rows[0];
  if (!row || row.used || new Date(row.expires_at) < new Date())
    throw badRequest('Invalid or expired reset token');
  await withUser(null, async (client) => {
    await client.query(`update auth.users set encrypted_password = $1, updated_at = now() where id = $2`,
      [await hashPassword(newPassword), row.user_id]);
    await client.query(`update public.auth_tokens set used = true where id = $1`, [row.id]);
    await client.query(`update public.auth_refresh_tokens set revoked = true where user_id = $1`, [row.user_id]);
  });
}

export async function emailExists(email: string): Promise<boolean> {
  return !!(await getUserByEmail(email));
}

// ── Phone / OTP login ───────────────────────────────────────────────────────
// Oman numbers are 8 local digits; anything without a leading + is assumed +968.
function normalizePhone(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) return `+968${digits}`;
  return `+${digits}`;
}

export async function startPhoneAuth(rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (phone.replace(/\D/g, '').length < 8) throw badRequest('Please enter a valid phone number');

  // Rate-limit: cap codes per number so we don't burn SMS or enable abuse.
  const { rows: recent } = await pool.query(
    `select count(*)::int as n from public.phone_otps
     where phone = $1 and created_at > now() - interval '15 minutes'`,
    [phone],
  );
  if ((recent[0]?.n ?? 0) >= OTP_MAX_SENDS_15M)
    throw badRequest('Too many code requests. Please try again in a few minutes.');

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  // Invalidate any earlier live codes for this number, then store the new one.
  await pool.query(`update public.phone_otps set consumed = true where phone = $1 and consumed = false`, [phone]);
  await pool.query(
    `insert into public.phone_otps (phone, code_hash, expires_at)
     values ($1, $2, now() + interval '${OTP_TTL_MIN} minutes')`,
    [phone, hashToken(code)],
  );

  try {
    await sendSms(phone, `Your GO WATT verification code is ${code}. It expires in ${OTP_TTL_MIN} minutes.`);
  } catch (e: any) {
    // The provider's wording ("user or password is wrong") is for us, not the
    // customer — keep the detail in the server log and show something useful.
    // eslint-disable-next-line no-console
    console.error('[sms] OTP send failed:', e?.message ?? e);
    // Outside production (internal test), don't block the flow — testers verify
    // with DEV_OTP_CODE. In production a send failure is surfaced to the caller.
    if (isProd) throw new AppError(502, 'sms_failed', 'We could not send the code right now. Please try again shortly.');
    // eslint-disable-next-line no-console
    console.warn(`[otp] non-prod: SMS unavailable — use DEV_OTP_CODE "${env.DEV_OTP_CODE}" for ${phone}`);
  }
  return { ok: true };
}

async function findOrCreateUserByPhone(phone: string) {
  const { rows } = await pool.query(
    `select u.id, p.role from auth.users u
     left join public.profiles p on p.id = u.id
     where u.phone = $1 limit 1`,
    [phone],
  );
  if (rows[0]) return { id: rows[0].id as string, role: (rows[0].role as string) ?? 'customer' };

  // New number → create the auth user (the on_auth_user_created trigger seeds
  // the profile from NEW.phone); the upsert keeps it safe if the trigger ran.
  const id = randomUUID();
  await withUser(null, async (client) => {
    await client.query(
      `insert into auth.users (id, phone, phone_confirmed_at, aud, role, created_at, updated_at)
       values ($1, $2, now(), 'authenticated', 'authenticated', now(), now())`,
      [id, phone],
    );
    await client.query(
      `insert into public.profiles (id, phone, full_name, role)
       values ($1, $2, '', 'customer')
       on conflict (id) do update set phone = excluded.phone`,
      [id, phone],
    );
  });
  return { id, role: 'customer' };
}

export async function verifyPhoneAuth(rawPhone: string, code: string) {
  const phone = normalizePhone(rawPhone);

  // Internal-testing bypass: outside production, a master code logs in any
  // number so QA can test phone login while SMS is unavailable. Never in prod.
  if (!isProd && code.trim() === env.DEV_OTP_CODE) {
    // eslint-disable-next-line no-console
    console.warn(`[otp] non-prod DEV_OTP_CODE accepted for ${phone}`);
    await pool.query(`update public.phone_otps set consumed = true where phone = $1 and consumed = false`, [phone]);
    const user = await findOrCreateUserByPhone(phone);
    const tokens = await issueTokens(user.id, user.role);
    return { user: { id: user.id, phone, role: user.role }, ...tokens };
  }

  const { rows } = await pool.query(
    `select id, code_hash, expires_at, attempts from public.phone_otps
     where phone = $1 and consumed = false order by created_at desc limit 1`,
    [phone],
  );
  const row = rows[0];
  if (!row || new Date(row.expires_at) < new Date())
    throw badRequest('Code expired. Please request a new one.');
  if (row.attempts >= OTP_MAX_ATTEMPTS)
    throw badRequest('Too many attempts. Please request a new code.');

  if (hashToken(code.trim()) !== row.code_hash) {
    await pool.query(`update public.phone_otps set attempts = attempts + 1 where id = $1`, [row.id]);
    throw badRequest('Incorrect code. Please try again.');
  }

  await pool.query(`update public.phone_otps set consumed = true where id = $1`, [row.id]);
  const user = await findOrCreateUserByPhone(phone);
  const tokens = await issueTokens(user.id, user.role);
  return { user: { id: user.id, phone, role: user.role }, ...tokens };
}

// ── Email OTP login ──────────────────────────────────────────────────────────
// A second, fully self-controlled OTP channel — useful while Omantel's SMS
// whitelist is still pending. Unlike phone OTP this never creates an account:
// email sign-up is already its own flow (register()), so a code here only
// ever logs an *existing* email account in.

function otpEmailHtml(code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F6F8F7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16241D">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E4E9E6">
        <tr><td style="background:#214A38;padding:28px 28px 24px">
          <span style="color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:3px">GO WATT</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 8px;font-size:20px;color:#16241D">Your sign-in code</h1>
          <p style="margin:0 0 22px;font-size:14px;line-height:22px;color:#5A6B62">
            Enter this code in the app to sign in. It expires in <strong>${OTP_TTL_MIN} minutes</strong>.
          </p>
          <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#378B5A;text-align:center;padding:16px;background:#F0F7F3;border-radius:12px">${code}</div>
          <p style="margin:22px 0 0;font-size:12px;line-height:18px;color:#95A29B">
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export async function startEmailOtp(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();

  const { rows: recent } = await pool.query(
    `select count(*)::int as n from public.email_otps
     where email = $1 and created_at > now() - interval '15 minutes'`,
    [email],
  );
  if ((recent[0]?.n ?? 0) >= OTP_MAX_SENDS_15M)
    throw badRequest('Too many code requests. Please try again in a few minutes.');

  // Don't reveal whether the account exists — same stance as forgot-password.
  // If there's no account, silently skip sending; the caller always gets ok.
  const user = await getUserByEmail(email);
  if (user) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await pool.query(`update public.email_otps set consumed = true where email = $1 and consumed = false`, [email]);
    await pool.query(
      `insert into public.email_otps (email, code_hash, expires_at)
       values ($1, $2, now() + interval '${OTP_TTL_MIN} minutes')`,
      [email, hashToken(code)],
    );
    sendEmail(email, 'Your GO WATT sign-in code', otpEmailHtml(code))
      // eslint-disable-next-line no-console
      .catch((e) => console.error('[email-otp] send failed:', e?.message ?? e));
    if (!isProd) {
      // eslint-disable-next-line no-console
      console.warn(`[otp] non-prod: email code for ${email} is ${code}`);
    }
  }
  return { ok: true };
}

export async function verifyEmailOtp(rawEmail: string, code: string) {
  const email = rawEmail.trim().toLowerCase();

  if (!isProd && code.trim() === env.DEV_OTP_CODE) {
    const user = await getUserByEmail(email);
    if (!user) throw badRequest('No account found for this email.');
    // eslint-disable-next-line no-console
    console.warn(`[otp] non-prod DEV_OTP_CODE accepted for ${email}`);
    await pool.query(`update public.email_otps set consumed = true where email = $1 and consumed = false`, [email]);
    const role = user.role ?? 'customer';
    const tokens = await issueTokens(user.id, role);
    return { user: { id: user.id, email: user.email, role }, ...tokens };
  }

  const { rows } = await pool.query(
    `select id, code_hash, expires_at, attempts from public.email_otps
     where email = $1 and consumed = false order by created_at desc limit 1`,
    [email],
  );
  const row = rows[0];
  if (!row || new Date(row.expires_at) < new Date())
    throw badRequest('Code expired. Please request a new one.');
  if (row.attempts >= OTP_MAX_ATTEMPTS)
    throw badRequest('Too many attempts. Please request a new code.');

  if (hashToken(code.trim()) !== row.code_hash) {
    await pool.query(`update public.email_otps set attempts = attempts + 1 where id = $1`, [row.id]);
    throw badRequest('Incorrect code. Please try again.');
  }
  await pool.query(`update public.email_otps set consumed = true where id = $1`, [row.id]);

  const user = await getUserByEmail(email);
  if (!user) throw badRequest('No account found for this email.');
  const role = user.role ?? 'customer';
  const tokens = await issueTokens(user.id, role);
  return { user: { id: user.id, email: user.email, role }, ...tokens };
}
