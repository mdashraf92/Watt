import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { pool, callFn } from '../../db/pool';

const router = Router();

// Current user's profile (+ email).
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `select p.*, u.email from public.profiles p
     join auth.users u on u.id = p.id where p.id = $1`,
    [req.user!.id],
  );
  res.json(rows[0] ?? null);
}));

// Update own profile. Only client-safe columns are accepted — money/role columns
// are NEVER updatable here (also enforced by the DB protect_profile_columns trigger).
const editable = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().optional(),
  car_make: z.string().nullable().optional(),
  car_model: z.string().nullable().optional(),
  battery_kwh: z.number().positive().nullable().optional(),
  connector_type: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  profile_prompted: z.boolean().optional(),
  onboarding_completed: z.literal(true).optional(),   // first-run setup can only be finished, never reopened
  is_active: z.literal(false).optional(),   // self-deactivate only (never reactivate)
  notif_push: z.boolean().optional(),
  notif_booking: z.boolean().optional(),
  notif_charging: z.boolean().optional(),
  notif_promo: z.boolean().optional(),
  payout_bank_name: z.string().nullable().optional(),
  payout_account_holder: z.string().nullable().optional(),
  payout_iban: z.string().nullable().optional(),
  expo_push_token: z.string().nullable().optional(),
}).strict();

router.patch('/', requireAuth, validateBody(editable), asyncHandler(async (req, res) => {
  const keys = Object.keys(req.body);
  if (keys.length === 0) return res.status(400).json({ error: { code: 'bad_request', message: 'No fields' } });
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const vals = keys.map(k => (req.body as any)[k]);
  // Run as the user so the protect trigger applies the same rules as before.
  const row = await callFn<any>(req.user!.id,
    `update public.profiles set ${sets} where id = $1 returning *`, [req.user!.id, ...vals]);
  res.json(row);
}));

// Delete own account (existing SQL function does the cleanup).
router.delete('/', requireAuth, asyncHandler(async (req, res) => {
  await callFn(req.user!.id, 'select public.delete_own_account()');
  res.status(204).end();
}));

export default router;
