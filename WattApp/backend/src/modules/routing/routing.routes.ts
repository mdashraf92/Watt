import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

// In-app driving directions.
//
// The app draws the route itself on the Leaflet map instead of handing the user
// off to Google Maps. Road geometry comes from OSRM, proxied through here
// rather than called from the device, so that:
//   - the OSRM host stays private and swappable without an app release
//   - requests are authenticated, so the routing box is not open to the world
//   - one place to add caching later if it gets hot
//
// Set OSRM_URL to your self-hosted instance (see docs/SELF_HOSTING.md).
const router = Router();
router.use(requireAuth);

// Oman's bounding box, generously padded. Rejecting far-away coordinates keeps
// a bad GPS fix from asking OSRM to route across continents.
const OMAN_BOUNDS = { minLat: 16.0, maxLat: 27.0, minLng: 51.0, maxLng: 60.5 };

const coord = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

function inOman(c: { latitude: number; longitude: number }): boolean {
  return c.latitude  >= OMAN_BOUNDS.minLat && c.latitude  <= OMAN_BOUNDS.maxLat
      && c.longitude >= OMAN_BOUNDS.minLng && c.longitude <= OMAN_BOUNDS.maxLng;
}

router.post('/route',
  validateBody(z.object({ from: coord, to: coord })),
  asyncHandler(async (req, res) => {
    if (!env.OSRM_URL) {
      throw new AppError(503, 'not_configured', 'Routing is not configured');
    }
    const { from, to } = req.body as { from: any; to: any };
    if (!inOman(from) || !inOman(to)) {
      throw new AppError(400, 'bad_request', 'Coordinates outside the service area');
    }

    // OSRM takes lng,lat — the reverse of the lat,lng used everywhere else.
    const path = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const url  = `${env.OSRM_URL}/route/v1/driving/${path}`
               + `?overview=full&geometries=geojson&steps=true&alternatives=false`;

    // Never let a slow routing box hang an app request.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let payload: any;
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      payload = await r.json().catch(() => ({}));
      if (!r.ok) throw new AppError(502, 'routing_failed', 'Routing service error');
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      throw new AppError(
        e?.name === 'AbortError' ? 504 : 502,
        'routing_failed',
        e?.name === 'AbortError' ? 'Routing timed out' : 'Could not reach routing service',
      );
    } finally {
      clearTimeout(timer);
    }

    const route = payload?.routes?.[0];
    if (!route) throw new AppError(404, 'no_route', 'No driving route found');

    // GeoJSON is [lng, lat]; Leaflet wants [lat, lng]. Flip once, here, so the
    // app never has to think about it.
    const coordinates: Array<[number, number]> = (route.geometry?.coordinates ?? [])
      .map((c: [number, number]) => [c[1], c[0]]);

    res.json({
      success: true,
      distance_m: Math.round(route.distance ?? 0),
      duration_s: Math.round(route.duration ?? 0),
      coordinates,
      steps: (route.legs?.[0]?.steps ?? []).map((s: any) => ({
        instruction: s.maneuver?.type ?? '',
        modifier:    s.maneuver?.modifier ?? null,
        name:        s.name ?? '',
        distance_m:  Math.round(s.distance ?? 0),
      })),
    });
  }),
);

export default router;
