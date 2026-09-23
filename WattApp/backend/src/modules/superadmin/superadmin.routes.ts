import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { requireSuperadmin } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { callFn } from '../../db/pool';

const router = Router();
router.use(requireAuth, requireSuperadmin);

// List admins + superadmins.
router.get('/admins', asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(req.user!.id,
    `select coalesce(json_agg(a), '[]'::json) as result from public.sa_list_admins() a`);
  res.json(row.result);
}));

// Promote/remove an admin by email or phone.
router.post('/admins',
  validateBody(z.object({ identifier: z.string().min(1), make: z.boolean() })),
  asyncHandler(async (req, res) => {
    const row = await callFn<{ result: any }>(req.user!.id,
      'select public.sa_set_admin($1,$2) as result', [req.body.identifier, req.body.make]);
    res.json(row.result);
  }),
);

// Platform settings.
router.get('/settings', asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(req.user!.id, 'select public.sa_get_settings() as result');
  res.json(row.result);
}));

router.put('/settings',
  validateBody(z.object({ key: z.string().min(1), value: z.string() })),
  asyncHandler(async (req, res) => {
    await callFn(req.user!.id, 'select public.sa_set_setting($1,$2)', [req.body.key, req.body.value]);
    res.status(204).end();
  }),
);

// Overstay grace period / per-minute fee / max-overstay cap. Kept as their
// own small pair rather than added to the settings whitelist above — see the
// design note at the top of sql/backend-overstay-and-refund.sql.
router.get('/overstay-settings', asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(req.user!.id, 'select public.sa_get_overstay_settings() as result');
  res.json(row.result);
}));

router.put('/overstay-settings',
  validateBody(z.object({
    overstay_grace_minutes: z.number().int().min(0),
    overstay_fee_per_minute: z.number().min(0),
    overstay_max_minutes: z.number().int().min(0),
  })),
  asyncHandler(async (req, res) => {
    const { overstay_grace_minutes, overstay_fee_per_minute, overstay_max_minutes } = req.body;
    const row = await callFn<{ result: any }>(req.user!.id,
      'select public.sa_set_overstay_settings($1,$2,$3) as result',
      [overstay_grace_minutes, overstay_fee_per_minute, overstay_max_minutes]);
    res.json(row.result);
  }),
);

// Mobile-charging (roadside rescue) pricing — callout fee, price/kWh, cancel
// fee, min/max kWh, service radius. Own pair, not the settings whitelist —
// see the design note in sql/backend-mobile-settings.sql.
router.get('/mobile-settings', asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(req.user!.id, 'select public.sa_get_mobile_settings() as result');
  res.json(row.result);
}));

router.put('/mobile-settings',
  validateBody(z.object({
    mobile_enabled: z.boolean(),
    mobile_callout_fee: z.number().min(0),
    mobile_price_per_kwh: z.number().positive(),
    mobile_min_kwh: z.number().positive(),
    mobile_max_kwh: z.number().positive(),
    mobile_cancel_fee: z.number().min(0),
    mobile_service_radius_km: z.number().positive(),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const row = await callFn<{ result: any }>(req.user!.id,
      'select public.sa_set_mobile_settings($1,$2,$3,$4,$5,$6,$7) as result',
      [b.mobile_enabled, b.mobile_callout_fee, b.mobile_price_per_kwh,
       b.mobile_min_kwh, b.mobile_max_kwh, b.mobile_cancel_fee, b.mobile_service_radius_km]);
    res.json(row.result);
  }),
);

export default router;
