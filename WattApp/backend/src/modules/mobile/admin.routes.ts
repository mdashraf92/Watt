import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { callFn, query } from '../../db/pool';
import { badRequest, notFound } from '../../lib/errors';
import { runDispatch } from './dispatch';

// Fleet and job oversight. Mounted alongside the main admin router at
// /api/admin, kept in this module so everything mobile-charging lives together.
const router = Router();
router.use(requireAuth, requireAdmin);

// ── Fleet ──────────────────────────────────────────────────────────────────

router.get('/vans', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select v.*, p.full_name as operator_name, p.phone as operator_phone,
            (select count(*)::int from public.mobile_charge_requests r
              where r.van_id = v.id and r.status = 'completed') as jobs_completed
       from public.service_vans v
       left join public.profiles p on p.id = v.operator_id
      order by v.created_at`,
  );
  res.json(rows);
}));

const vanBody = z.object({
  label:        z.string().min(1).max(60),
  plate:        z.string().max(30).optional(),
  operator_id:  z.string().uuid().nullable().optional(),
  capacity_kwh: z.number().positive().max(1000),
  current_kwh:  z.number().nonnegative().max(1000).optional(),
  governorate:  z.string().max(60).nullable().optional(),
  is_active:    z.boolean().optional(),
});

// Assigning a driver who is not an operator would create a van nobody can drive
// — the role check belongs here, where the mistake is made.
async function assertOperator(id: string | null | undefined) {
  if (!id) return;
  const { rows } = await query(`select role from public.profiles where id = $1`, [id]);
  if (!rows[0]) throw notFound('Operator not found');
  if (!['operator', 'admin', 'superadmin'].includes(rows[0].role)) {
    throw badRequest('NOT_OPERATOR|That user is not an operator');
  }
}

router.post('/vans', validateBody(vanBody), asyncHandler(async (req, res) => {
  const b = req.body;
  await assertOperator(b.operator_id);
  // Every placeholder is cast explicitly: $4 is used twice (once directly, once
  // inside coalesce), and without a cast Postgres deduces two different types
  // for it and refuses the statement outright.
  const { rows } = await query(
    `insert into public.service_vans
       (label, plate, operator_id, capacity_kwh, current_kwh, governorate, is_active)
     values ($1::text, $2::text, $3::uuid, $4::numeric,
             coalesce($5::numeric, $4::numeric), $6::text, coalesce($7::boolean, true))
     returning *`,
    [b.label, b.plate ?? '', b.operator_id ?? null, b.capacity_kwh,
     b.current_kwh ?? null, b.governorate ?? null, b.is_active ?? null],
  );
  res.json(rows[0]);
}));

router.patch('/vans/:id', validateBody(vanBody.partial()), asyncHandler(async (req, res) => {
  const b = req.body;
  if ('operator_id' in b) await assertOperator(b.operator_id);
  const { rows } = await query(
    `update public.service_vans set
       label        = coalesce($2::text, label),
       plate        = coalesce($3::text, plate),
       operator_id  = case when $4::boolean then $5::uuid else operator_id end,
       capacity_kwh = coalesce($6::numeric, capacity_kwh),
       current_kwh  = coalesce($7::numeric, current_kwh),
       governorate  = coalesce($8::text, governorate),
       is_active    = coalesce($9::boolean, is_active)
     where id = $1::uuid returning *`,
    [req.params.id, b.label ?? null, b.plate ?? null,
     'operator_id' in b, b.operator_id ?? null,
     b.capacity_kwh ?? null, b.current_kwh ?? null, b.governorate ?? null, b.is_active ?? null],
  );
  if (!rows[0]) throw notFound('Van not found');
  res.json(rows[0]);
}));

// Refill after the van swaps or recharges its pack.
router.post('/vans/:id/refill', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `update public.service_vans set current_kwh = capacity_kwh where id = $1 returning *`,
    [req.params.id],
  );
  if (!rows[0]) throw notFound('Van not found');
  runDispatch().catch(() => {});   // a full van may now be able to take a waiting job
  res.json(rows[0]);
}));

router.delete('/vans/:id', asyncHandler(async (req, res) => {
  // Soft delete: completed jobs reference the van, and the history should stay
  // readable after a vehicle leaves the fleet.
  const { rows } = await query(
    `update public.service_vans set is_active = false, status = 'offline'
      where id = $1 returning id`, [req.params.id],
  );
  if (!rows[0]) throw notFound('Van not found');
  res.status(204).end();
}));

// Candidate drivers for the assignment picker.
router.get('/operators', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select p.id, p.full_name, p.phone, v.id as van_id, v.label as van_label
       from public.profiles p
       left join public.service_vans v on v.operator_id = p.id
      where p.role = 'operator' and p.is_active
      order by p.full_name`,
  );
  res.json(rows);
}));

// ── Jobs ───────────────────────────────────────────────────────────────────

router.get('/mobile/requests', asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const { rows } = await query(
    `select r.*, c.full_name as customer_name, c.phone as customer_phone,
            op.full_name as operator_name, v.label as van_label
       from public.mobile_charge_requests r
       join public.profiles c on c.id = r.user_id
       left join public.profiles op on op.id = r.operator_id
       left join public.service_vans v on v.id = r.van_id
      where ($1::text is null or r.status = $1)
      order by r.created_at desc limit 100`,
    [status],
  );
  res.json(rows);
}));

// Live picture for the ops map: vans on duty and jobs still waiting.
router.get('/mobile/live', asyncHandler(async (_req, res) => {
  const { rows: vans } = await query(
    `select v.id, v.label, v.status, v.current_kwh, v.last_lat, v.last_lng, v.last_seen_at,
            p.full_name as operator_name
       from public.service_vans v
       left join public.profiles p on p.id = v.operator_id
      where v.is_active and v.status <> 'offline'`,
  );
  const { rows: open } = await query(
    `select r.id, r.pickup_lat, r.pickup_lng, r.address_text, r.status,
            r.requested_kwh, r.created_at, c.full_name as customer_name
       from public.mobile_charge_requests r
       join public.profiles c on c.id = r.user_id
      where r.status in ('pending','offered','assigned','en_route','arrived','charging')`,
  );
  res.json({ vans, requests: open });
}));

// Support override: cancel on the customer's behalf. Admin cancels waive the
// fee (see cancel_mobile_charge) — if support is stepping in, something already
// went wrong and the customer should not pay for it.
router.post('/mobile/requests/:id/cancel',
  validateBody(z.object({ reason: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.cancel_mobile_charge($1,$2) as result',
      [req.params.id, req.body.reason ?? 'Cancelled by support'],
    );
    res.json(row.result);
  }),
);

// Kick dispatch by hand when ops can see a waiting job and an idle van.
router.post('/mobile/dispatch', asyncHandler(async (_req, res) => {
  res.json(await runDispatch());
}));

export default router;
