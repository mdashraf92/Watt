import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

// The one place that talks to OSRM.
//
// Extracted from routing.routes.ts when the trip planner arrived and needed the
// same road geometry: two copies of the timeout, the bbox rule and the
// [lng,lat] → [lat,lng] flip would have drifted apart within a release.

// Oman's bounding box, generously padded. Rejecting far-away coordinates keeps
// a bad GPS fix from asking OSRM to route across continents.
const OMAN_BOUNDS = { minLat: 16.0, maxLat: 27.0, minLng: 51.0, maxLng: 60.5 };

export type Coord = { latitude: number; longitude: number };

export function inOman(c: Coord): boolean {
  return c.latitude  >= OMAN_BOUNDS.minLat && c.latitude  <= OMAN_BOUNDS.maxLat
      && c.longitude >= OMAN_BOUNDS.minLng && c.longitude <= OMAN_BOUNDS.maxLng;
}

export type OsrmRoute = {
  distance_m: number;
  duration_s: number;
  /** [lat, lng] pairs — already flipped from OSRM's GeoJSON order. */
  coordinates: Array<[number, number]>;
  steps: Array<{ instruction: string; modifier: string | null; name: string; distance_m: number }>;
};

/**
 * Driving route through the given points, in order. Two points for plain
 * directions; more for a trip with waypoints.
 */
export async function osrmRoute(points: Coord[]): Promise<OsrmRoute> {
  if (!env.OSRM_URL) {
    throw new AppError(503, 'not_configured', 'Routing is not configured');
  }
  if (points.length < 2) {
    throw new AppError(400, 'bad_request', 'Need at least two points');
  }
  if (!points.every(inOman)) {
    throw new AppError(400, 'bad_request', 'Coordinates outside the service area');
  }

  // OSRM takes lng,lat — the reverse of the lat,lng used everywhere else.
  const path = points.map(p => `${p.longitude},${p.latitude}`).join(';');
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

  return {
    distance_m: Math.round(route.distance ?? 0),
    duration_s: Math.round(route.duration ?? 0),
    coordinates,
    steps: (route.legs?.[0]?.steps ?? []).map((s: any) => ({
      instruction: s.maneuver?.type ?? '',
      modifier:    s.maneuver?.modifier ?? null,
      name:        s.name ?? '',
      distance_m:  Math.round(s.distance ?? 0),
    })),
  };
}

// ── Geometry helpers for the trip planner ──────────────────────────────────

const R = 6371;   // km

export function haversineKm(a: Coord, b: Coord): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1  = (a.latitude * Math.PI) / 180;
  const la2  = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * How far a point sits off the route, and how far along the route the nearest
 * point on it is.
 *
 * Walks the polyline once and projects onto each segment in a local flat-earth
 * frame. Over a segment of a few hundred metres the curvature error is far
 * below the accuracy anyone needs to decide "is this charger on my way".
 */
export function projectOntoPolyline(
  point: Coord,
  line: Array<[number, number]>,
): { offsetKm: number; alongKm: number } {
  let best = { offsetKm: Infinity, alongKm: 0 };
  let travelled = 0;

  // Longitude degrees shrink towards the poles; scale them so the flat-earth
  // projection below is not stretched east-west.
  const lngScale = Math.cos((point.latitude * Math.PI) / 180);
  const toXY = (lat: number, lng: number) => ({ x: lng * lngScale, y: lat });
  const p = toXY(point.latitude, point.longitude);

  for (let i = 0; i < line.length - 1; i++) {
    const aLat = line[i][0],     aLng = line[i][1];
    const bLat = line[i + 1][0], bLng = line[i + 1][1];
    const segKm = haversineKm(
      { latitude: aLat, longitude: aLng },
      { latitude: bLat, longitude: bLng },
    );

    const a = toXY(aLat, aLng);
    const b = toXY(bLat, bLng);
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;

    // Fraction along this segment of the closest point, clamped to its ends.
    const tRaw = len2 === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
    const tt = Math.max(0, Math.min(1, tRaw));

    const closest = {
      latitude:  aLat + (bLat - aLat) * tt,
      longitude: aLng + (bLng - aLng) * tt,
    };
    const offsetKm = haversineKm(point, closest);
    if (offsetKm < best.offsetKm) {
      best = { offsetKm, alongKm: travelled + segKm * tt };
    }
    travelled += segKm;
  }

  return best;
}
