import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { query, callFn } from '../../db/pool';
import { notify } from '../../integrations/notify';

const router = Router();
router.use(requireAuth, requireAdmin);

// Network analytics (revenue/sessions/kWh + top chargers + flagged count).
router.get('/analytics', asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(req.user!.id, 'select public.get_admin_analytics() as result');
  res.json(row.result);
}));

// Flagged (meter-mismatch) sessions for review.
router.get('/flagged', asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(req.user!.id,
    `select coalesce(json_agg(f), '[]'::json) as result from public.get_flagged_sessions_detail() f`);
  res.json(row.result);
}));

// Clear a flag after review.
router.post('/flagged/:id/resolve', asyncHandler(async (req, res) => {
  await callFn(req.user!.id, 'select public.resolve_flagged_session($1)', [req.params.id]);
  res.status(204).end();
}));

// Users list (admins can read across users; email joined from auth.users).
router.get('/users', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select p.id, p.full_name, p.phone, p.role, p.is_active, p.wallet_balance,
            p.total_sessions, p.total_kwh, u.email, p.created_at
     from public.profiles p join auth.users u on u.id = p.id
     order by p.created_at desc limit 500`,
  );
  res.json(rows);
}));

// Lightweight counts for the admin profile screen.
router.get('/counts', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select (select count(*) from public.stations)::int as stations,
            (select count(*) from public.profiles)::int as users`,
  );
  res.json(rows[0]);
}));

// All investor applications (name/phone live on the row itself).
router.get('/applications', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select * from public.charger_applications order by created_at desc limit 500`,
  );
  res.json(rows);
}));

// Save an admin note on an application.
router.patch('/applications/:id',
  validateBody(z.object({ admin_comment: z.string().nullable() })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `update public.charger_applications set admin_comment = $2 where id = $1 returning *`,
      [req.params.id, req.body.admin_comment || null],
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'No application' } });
    res.json(rows[0]);
  }),
);

// Delete an application.
router.delete('/applications/:id', asyncHandler(async (req, res) => {
  await query(`delete from public.charger_applications where id = $1`, [req.params.id]);
  res.status(204).end();
}));

// The listing that belongs to an approved applicant (device + price panel).
router.get('/users/:userId/listing', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select id, tuya_device_id, tuya_verified, price_per_kwh
     from public.charger_listings where host_id = $1`,
    [req.params.userId],
  );
  res.json(rows[0] ?? null);
}));

// Admin edits on a listing: set price and/or verify the device (allowlist only).
router.patch('/listings/:id',
  validateBody(z.object({
    price_per_kwh: z.number().positive().max(1).optional(),
    tuya_verified: z.boolean().optional(),
  }).strict()),
  asyncHandler(async (req, res) => {
    const keys = Object.keys(req.body);
    if (!keys.length) return res.status(400).json({ error: { code: 'bad_request', message: 'No fields' } });
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const vals = keys.map(k => (req.body as any)[k]);
    const { rows } = await query(
      `update public.charger_listings set ${sets} where id = $1 returning id, tuya_device_id, tuya_verified, price_per_kwh`,
      [req.params.id, ...vals],
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'No listing' } });
    res.json(rows[0]);
  }),
);

// Activate / deactivate a user.
router.patch('/users/:id',
  validateBody(z.object({ is_active: z.boolean() })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `update public.profiles set is_active = $2 where id = $1 returning id, is_active`,
      [req.params.id, req.body.is_active],
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'No user' } });
    res.json(rows[0]);
  }),
);

// Delete a user account (reuses the hardened SECURITY DEFINER function).
router.delete('/users/:id', asyncHandler(async (req, res) => {
  await callFn(req.user!.id, 'select public.delete_user_account($1)', [req.params.id]);
  res.status(204).end();
}));

// Per-investor earnings + session breakdown — so admin can see exactly what a
// payout amount is made of (which charger, which sessions) before manually
// transferring money and marking a payout as paid.
router.get('/investors/:userId/earnings', asyncHandler(async (req, res) => {
  const { rows: investorRows } = await query(
    `select id, full_name, phone, wallet_balance,
            payout_bank_name, payout_account_holder, payout_iban
     from public.profiles where id = $1 and role in ('investor', 'host')`,
    [req.params.userId],
  );
  if (!investorRows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Investor not found' } });

  const { rows: listingRows } = await query(
    `select id, station_name, address, price_per_kwh
     from public.charger_listings where host_id = $1`,
    [req.params.userId],
  );

  const { rows: transactions } = await query(
    `select wt.id, wt.amount, wt.description, wt.created_at,
            cs.id as session_id, cs.kwh_delivered, cs.cost, cs.started_at, cs.ended_at,
            coalesce(s.name, cl.station_name) as charger_name
       from public.wallet_transactions wt
       left join public.charging_sessions cs on cs.id::text = wt.reference_id
       left join public.stations s on s.id = cs.station_id
       left join public.charger_listings cl on cl.id = cs.listing_id
      where wt.user_id = $1 and wt.type = 'earning'
      order by wt.created_at desc
      limit 200`,
    [req.params.userId],
  );

  const total_earnings = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

  res.json({
    investor: investorRows[0],
    listing: listingRows[0] ?? null,
    transactions,
    total_earnings,
  });
}));

// Investor applications review actions.
router.post('/applications/:id/:action',
  validateBody(z.object({}).optional()),
  asyncHandler(async (req, res) => {
    const map: Record<string, string> = {
      accept: 'accept_investor_application',
      reject: 'reject_investor_application',
      review: 'set_application_under_review',
    };
    const fn = map[req.params.action];
    if (!fn) return res.status(400).json({ error: { code: 'bad_request', message: 'Unknown action' } });
    const row = await callFn<{ result: any }>(req.user!.id, `select public.${fn}($1) as result`, [req.params.id]);

    // Tell the applicant what happened — previously nothing notified them at
    // all; they had to keep re-opening the app to notice their role changed.
    if (req.params.action === 'accept' || req.params.action === 'reject') {
      const { rows: appRows } = await query(
        `select user_id, admin_comment from public.charger_applications where id = $1`,
        [req.params.id],
      );
      const app = appRows[0];
      if (app?.user_id) {
        const accepted = req.params.action === 'accept';
        notify({
          userIds: [app.user_id],
          category: 'booking',
          kind: accepted ? 'investor_application_approved' : 'investor_application_rejected',
          title: accepted ? 'Your charger application was approved' : 'Your charger application was not approved',
          body: accepted
            ? 'Congratulations — you can now set up your charger and start earning.'
            : (app.admin_comment || 'Contact support if you have questions about this decision.'),
          data: { application_id: req.params.id },
        }).catch(() => {});
      }
    }

    res.json(row.result ?? { ok: true });
  }),
);

export default router;
