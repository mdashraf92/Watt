import { randomBytes, randomUUID } from 'crypto';
import { pool, withUser } from '../../db/pool';
import { hashPassword, verifyPassword, hashToken } from '../../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { badRequest, conflict, unauthorized } from '../../lib/errors';
import { sendSms } from '../../integrations/sms';

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

export async function register(email: string, password: string, fullName: string) {
  if (await getUserByEmail(email)) throw conflict('Email already registered');
  const id = randomUUID();
  const pw = await hashPassword(password);
  // Create the auth user + profile in one transaction. (handle_new_user trigger
  // may also create the profile; the upsert keeps this idempotent.)
  await withUser(null, async (client) => {
    await client.query(
      `insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1, lower($2), $3, now(), now(), now())`,
      [id, email, pw],
    );
    await client.query(
      `insert into public.profiles (id, full_name, role)
       values ($1, $2, 'customer')
       on conflict (id) do update set full_name = excluded.full_name`,
      [id, fullName],
    );
  });
  const tokens = await issueTokens(id, 'customer');
  return { user: { id, email, role: 'customer', full_name: fullName }, ...tokens };
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

  await sendSms(phone, `Your GO WATT verification code is ${code}. It expires in ${OTP_TTL_MIN} minutes.`);
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
