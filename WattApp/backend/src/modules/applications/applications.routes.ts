import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { query } from '../../db/pool';
import { notify } from '../../integrations/notify';

// Investor / charger applications submitted by the user.
const router = Router();
router.use(requireAuth);

// The user's latest charger application (for the profile status card / reapply prefill).
router.get('/mine', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select * from public.charger_applications where user_id = $1
     order by created_at desc limit 1`,
    [req.user!.id],
  );
  res.json(rows[0] ?? null);
}));

// Submit a new charger application. user_id and status are set server-side —
// the client can never spoof them (mirrors what the old RLS insert policy did).
router.post('/',
  validateBody(z.object({
    full_name: z.string().min(1),
    phone: z.string().min(1),
    station_name: z.string().nullable().optional(),
    governorate: z.string().min(1),
    city: z.string().min(1),
    latitude: z.number(),
    longitude: z.number(),
    charger_type: z.string().min(1),
    power_kw: z.number().positive().nullable().optional(),
    electricity_form_name: z.string().min(1),
    commercial_registration: z.string().min(1),
    id_card_number: z.string().min(1),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const { rows } = await query(
      `insert into public.charger_applications
         (user_id, full_name, phone, station_name, governorate, city, latitude, longitude,
          charger_type, power_kw, electricity_form_name, commercial_registration, id_card_number, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending') returning *`,
      [req.user!.id, b.full_name, b.phone, b.station_name ?? null, b.governorate, b.city,
       b.latitude, b.longitude, b.charger_type, b.power_kw ?? null,
       b.electricity_form_name, b.commercial_registration, b.id_card_number],
    );
    const application = rows[0];

    const { rows: admins } = await query(`select id from public.profiles where role in ('admin','superadmin')`);
    if (admins.length) {
      notify({
        userIds: admins.map(a => a.id),
        category: 'booking',
        kind: 'investor_application_submitted',
        title: 'New investor application',
        body: `${application.full_name} applied to host a charger in ${application.governorate}.`,
        data: { application_id: application.id },
      }).catch(() => {});
    }

    res.status(201).json(application);
  }),
);

export default router;
