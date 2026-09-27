import { Router } from 'express';
import { asyncHandler } from '../../middleware/error';
import { query, callFn } from '../../db/pool';

// Public/private chargers (home listings) shown on the map.
const router = Router();

// The map and the charger page are public so guests can browse before signing
// in. Guests don't get the smart-plug wiring or the host's account id; signed-in
// users keep the full row exactly as before.
const GUEST_HIDDEN = ['host_id', 'tuya_device_id', 'switch_status', 'tuya_verified'] as const;
function forViewer(row: any, signedIn: boolean) {
  if (signedIn || !row) return row;
  const copy = { ...row };
  for (const k of GUEST_HIDDEN) delete copy[k];
  return copy;
}

// Available private chargers (with host first name) for the map + list.
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select cl.*, split_part(coalesce(p.full_name, ''), ' ', 1) as host_name
     from public.charger_listings cl
     left join public.profiles p on p.id = cl.host_id
     where cl.is_available = true`,
  );
  res.json(rows.map(r => forViewer(r, !!req.user)));
}));

// Single private charger's public details (for the customer-facing details page).
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select cl.*, split_part(coalesce(p.full_name, ''), ' ', 1) as host_name
     from public.charger_listings cl
     left join public.profiles p on p.id = cl.host_id
     where cl.id = $1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Charger not found' } });
  res.json(forViewer(rows[0], !!req.user));
}));

// Reviews for a private charger.
router.get('/:id/reviews', asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(req.user?.id ?? null,
    'select coalesce(json_agg(r), \'[]\'::json) as result from public.get_charger_reviews(null, $1) r',
    [req.params.id]);
  res.json(row.result);
}));

export default router;
