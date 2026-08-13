import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import * as svc from './auth.service';

const router = Router();

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

// A typed code, not an emailed link — see auth.service.ts for why.
router.post('/forgot-password',
  validateBody(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    await svc.requestPasswordReset(req.body.email);
    res.json({ ok: true }); // always ok — don't reveal whether the email exists
  }),
);

router.post('/reset-password',
  validateBody(z.object({ email: z.string().email(), code: z.string().min(4).max(8), new_password: strongPassword })),
  asyncHandler(async (req, res) => {
    await svc.resetPassword(req.body.email, req.body.code, req.body.new_password);
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
