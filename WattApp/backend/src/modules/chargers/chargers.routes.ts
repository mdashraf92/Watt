import { Router } from 'express';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { query, callFn } from '../../db/pool';

// Public/private chargers (home listings) shown on the map.
const router = Router();

// Available private chargers (with host first name) for the map + list.
router.get('/', requireAuth, asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select cl.*, split_part(coalesce(p.full_name, ''), ' ', 1) as host_name
     from public.charger_listings cl
     left join public.profiles p on p.id = cl.host_id
     where cl.is_available = true`,
  );
  res.json(rows);
}));

// Single private charger's public details (for the customer-facing details page).
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select cl.*, split_part(coalesce(p.full_name, ''), ' ', 1) as host_name
     from public.charger_listings cl
     left join public.profiles p on p.id = cl.host_id
     where cl.id = $1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Charger not found' } });
  res.json(rows[0]);
}));

// Reviews for a private charger.
router.get('/:id/reviews', requireAuth, asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(req.user!.id,
    'select coalesce(json_agg(r), \'[]\'::json) as result from public.get_charger_reviews(null, $1) r',
    [req.params.id]);
  res.json(row.result);
}));

export default router;
