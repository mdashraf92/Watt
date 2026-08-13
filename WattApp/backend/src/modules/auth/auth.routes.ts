import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import * as svc from './auth.service';
import { sendEmail } from '../../integrations/email';
import { env } from '../../config/env';

const router = Router();

// Branded password-reset email. `link` opens the app on the reset screen.
function resetEmailHtml(link: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F6F8F7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16241D">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E4E9E6">
        <tr><td style="background:#214A38;padding:28px 28px 24px">
          <span style="color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:3px">GO WATT</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 8px;font-size:20px;color:#16241D">Reset your password</h1>
          <p style="margin:0 0 22px;font-size:14px;line-height:22px;color:#5A6B62">
            We received a request to reset your GO WATT password. Tap the button below to choose a new one. This link expires in <strong>1 hour</strong>.
          </p>
          <a href="${link}" style="display:inline-block;background:#378B5A;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 28px;border-radius:12px">Reset password</a>
          <p style="margin:22px 0 0;font-size:12px;line-height:18px;color:#95A29B">
            If you didn't request this, you can safely ignore this email — your password won't change.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#95A29B">© GO WATT · Smart Charging Starts Here</p>
    </td></tr>
  </table></body></html>`;
}

// Password POLICY (new passwords only): at least 8 chars, with a letter and a
// number. Reused by register / change-password / reset-password so the rule is
// enforced identically everywhere and matches the app's client-side check.
const strongPassword = z.string()
  .min(8, 'Password must be at least 8 characters and include a letter and a number')
  .regex(/[A-Za-z]/, 'Password must be at least 8 characters and include a letter and a number')
  .regex(/\d/, 'Password must be at least 8 characters and include a letter and a number');

// Registration enforces the password POLICY. Login only needs the field present
// — it verifies credentials, so it must not reject a legacy / migrated user
// whose stored password happens to be shorter or weaker than the current policy.
const emailPw = z.object({
  email: z.string().email(),
  password: strongPassword,
});
const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

// Sign-up is verify-then-create: /start emails a code and creates nothing yet;
// /verify only creates the account once that code is confirmed. Catches a
// mistyped email at sign-up instead of silently creating an unreachable account.
router.post('/register/start',
  validateBody(emailPw.extend({ full_name: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { email, password, full_name } = req.body;
    res.json(await svc.startSignup(email, password, full_name));
  }),
);

router.post('/register/verify',
  validateBody(z.object({ email: z.string().email(), code: z.string().min(4).max(8) })),
  asyncHandler(async (req, res) => {
    res.status(201).json(await svc.completeSignup(req.body.email, req.body.code));
  }),
);

router.post('/login', validateBody(loginBody), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  res.json(await svc.login(email, password));
}));

router.post('/refresh',
  validateBody(z.object({ refresh_token: z.string().min(1) })),
  asyncHandler(async (req, res) => res.json(await svc.refresh(req.body.refresh_token))),
);

router.post('/logout',
  validateBody(z.object({ refresh_token: z.string().optional() })),
  asyncHandler(async (req, res) => { await svc.logout(req.body.refresh_token ?? ''); res.status(204).end(); }),
);

router.post('/change-password',
  requireAuth,
  validateBody(z.object({ current_password: z.string(), new_password: strongPassword })),
  asyncHandler(async (req, res) => {
    await svc.changePassword(req.user!.id, req.body.current_password, req.body.new_password);
    res.status(204).end();
  }),
);

router.post('/forgot-password',
  validateBody(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    const token = await svc.requestPasswordReset(req.body.email);
    if (token) {
      const link = `${env.PASSWORD_RESET_URL}?token=${encodeURIComponent(token)}`;
      // Fire-and-forget: never block or fail the response on mail delivery, and
      // keep timing uniform so we don't reveal whether the email exists.
      sendEmail(req.body.email, 'Reset your GO WATT password', resetEmailHtml(link))
        // eslint-disable-next-line no-console
        .catch((e) => console.error('[forgot-password] email send failed:', e?.message ?? e));
    }
    res.json({ ok: true }); // always ok — don't reveal whether the email exists
  }),
);

router.post('/reset-password',
  validateBody(z.object({ token: z.string(), new_password: strongPassword })),
  asyncHandler(async (req, res) => {
    await svc.resetPassword(req.body.token, req.body.new_password);
    res.status(204).end();
  }),
);

router.post('/check-email',
  validateBody(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => res.json({ exists: await svc.emailExists(req.body.email) })),
);

// ── Phone / OTP login ──
router.post('/phone/start',
  validateBody(z.object({ phone: z.string().min(6) })),
  asyncHandler(async (req, res) => res.json(await svc.startPhoneAuth(req.body.phone))),
);

router.post('/phone/verify',
  validateBody(z.object({ phone: z.string().min(6), code: z.string().min(4).max(8) })),
  asyncHandler(async (req, res) => res.json(await svc.verifyPhoneAuth(req.body.phone, req.body.code))),
);

// ── Email OTP login (existing accounts only — see auth.service.ts) ──
router.post('/email-otp/start',
  validateBody(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => res.json(await svc.startEmailOtp(req.body.email))),
);

router.post('/email-otp/verify',
  validateBody(z.object({ email: z.string().email(), code: z.string().min(4).max(8) })),
  asyncHandler(async (req, res) => res.json(await svc.verifyEmailOtp(req.body.email, req.body.code))),
);

export default router;
