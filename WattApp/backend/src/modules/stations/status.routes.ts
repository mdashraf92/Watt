import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { callFn } from '../../db/pool';
import { AppError } from '../../lib/errors';

// Service-status management for the two things the map draws markers for.
//
// Authorization lives in the SQL functions (set_station_status /
// set_listing_status) rather than here, because they already hold the row lock
// and the ownership data. This layer only translates their errors into HTTP.
//
//   stations         — admin / superadmin only (company network, no owner)
//   charger_listings — the owning host/investor, or admin / superadmin
const router = Router();
router.use(requireAuth);

const STATION_STATUSES = ['available', 'busy', 'fault', 'offline', 'under_maintenance'] as const;
const LISTING_STATUSES = ['available', 'offline', 'under_maintenance'] as const;

// Map the SQL exceptions onto sensible HTTP codes. The functions raise
// 'FORBIDDEN|…' / 'INVALID_STATUS|…' prefixes precisely so this can stay simple.
function translate(e: any): never {
  const msg = String(e?.message ?? '');
  if (msg.includes('FORBIDDEN'))      throw new AppError(403, 'forbidden', 'Not allowed to change this charger');
  if (msg.includes('INVALID_STATUS')) throw new AppError(400, 'bad_request', 'Unknown status');
  // Same code the availability toggle already returns, so the app's existing
  // "a customer is charging right now" handling applies unchanged.
  if (msg.includes('BUSY'))           throw new AppError(409, 'busy', 'A customer is charging right now');
  if (msg.includes('not found'))      throw new AppError(404, 'not_found', 'Not found');
  throw e;
}

// PATCH /api/stations/:id/status
router.patch('/stations/:id/status',
  validateBody(z.object({
    status: z.enum(STATION_STATUSES),
    reason: z.string().max(300).optional(),
  })),
  asyncHandler(async (req, res) => {
    try {
      const row = await callFn<{ result: any }>(req.user!.id,
        'select public.set_station_status($1,$2,$3) as result',
        [req.params.id, req.body.status, req.body.reason ?? null]);
      res.json({ success: true, ...row.result });
    } catch (e) { translate(e); }
  }),
);

// PATCH /api/stations/listings/:id/status
router.patch('/listings/:id/status',
  validateBody(z.object({
    status: z.enum(LISTING_STATUSES),
    reason: z.string().max(300).optional(),
  })),
  asyncHandler(async (req, res) => {
    try {
      const row = await callFn<{ result: any }>(req.user!.id,
        'select public.set_listing_status($1,$2,$3) as result',
        [req.params.id, req.body.status, req.body.reason ?? null]);
      res.json({ success: true, ...row.result });
    } catch (e) { translate(e); }
  }),
);

export default router;
