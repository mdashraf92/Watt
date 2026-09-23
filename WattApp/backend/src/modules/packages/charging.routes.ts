import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { query, callFn } from '../../db/pool';
import { env } from '../../config/env';
import { AppError, notFound, badRequest } from '../../lib/errors';
import { packageCharging } from './charging';
import { publicPackageRun } from './charging.service';

const router = Router();
router.use(requireAuth);
const uuid = z.string().uuid();
function paramId(value: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw badRequest('Invalid identifier');
  return parsed.data;
}

router.get('/entitlements/:id/charging', asyncHandler(async (req, res) => {
  const id = paramId(req.params.id);
  const { rows: owned } = await query("select station_id, (status='active' and expires_at>now()) as usable from entitlements where id=$1 and user_id=$2", [id, req.user!.id]);
  if (!owned[0]) throw notFound('Package not found');
  const { rows: connectors } = await query(`select c.id,c.connector_type,c.power_kw,c.status,
    exists(select 1 from charging_sessions cs where cs.connector_id=c.id and cs.status='active') as busy
    from connectors c join package_devices d on d.connector_id=c.id and d.enabled where c.station_id=$1`, [owned[0].station_id]);
  const { rows: runs } = await query('select * from package_charging_runs where entitlement_id=$1 order by created_at desc limit 1', [id]);
  const { rows: monitor } = await query("select 1 from package_monitor where checked_at>now()-interval '90 seconds'");
  res.json({ enabled: env.PACKAGES_CHARGING_ENABLED && monitor.length > 0 && owned[0].usable, connectors, run: runs[0] ? publicPackageRun(runs[0]) : null });
}));

router.post('/entitlements/:id/start', validateBody(z.object({ connector_id: uuid, start_key: z.string().min(16).max(100) })), asyncHandler(async (req, res) => {
  if (!env.PACKAGES_CHARGING_ENABLED) throw new AppError(503, 'unavailable', 'Package charging is not open yet');
  const run = await packageCharging.start(req.user!.id, paramId(req.params.id), req.body.connector_id, req.body.start_key);
  res.json(publicPackageRun(run));
}));

// Stop must remain reachable after the start feature is disabled.
router.post('/charging/:id/stop', asyncHandler(async (req, res) => {
  res.json(publicPackageRun(await packageCharging.stop(paramId(req.params.id), req.user!.id)));
}));

router.get('/staff/venues', asyncHandler(async (req, res) => {
  const { rows } = await query(`select s.id,s.name,s.name_ar from stations s join venue_staff v on v.station_id=s.id where v.user_id=$1`, [req.user!.id]);
  res.json(rows);
}));

router.post('/staff/lookup', validateBody(z.object({ code: z.string().trim().min(1).max(100) })), asyncHandler(async (req, res) => {
  const { rows } = await query(`select e.id,e.package_name,e.package_name_ar,e.partner_benefit,e.partner_benefit_ar,
    e.status,e.expires_at,e.benefit_redeemed_at,s.name as station_name,s.name_ar as station_name_ar
    from entitlements e join stations s on s.id=e.station_id
    join venue_staff v on v.station_id=e.station_id and v.user_id=$2 where e.redeem_code=$1`, [req.body.code.toUpperCase(), req.user!.id]);
  if (!rows[0]) throw notFound('No package found at your venues');
  res.json(rows[0]);
}));

router.post('/staff/entitlements/:id/benefit', asyncHandler(async (req, res) => {
  const { result } = await callFn(req.user!.id, 'select redeem_package_benefit($1) as result', [paramId(req.params.id)]);
  res.json({ id: result.id, benefit_redeemed_at: result.benefit_redeemed_at });
}));

export default router;
