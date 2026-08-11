import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { inOman } from './osrm';

// The one place that talks to Mapbox's Geocoding API, for the trip planner's
// "search any place" box. Kept server-side (rather than called from the app
// directly) so the token stays out of client network traffic and there is one
// place to add caching or swap providers later — same reasoning as osrm.ts.

export type GeocodeResult = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

/**
 * Free-text place search, biased to Oman. Returns [] rather than throwing
 * when the token is unset, so the trip planner's search box degrades to
 * "your own stations only" instead of breaking.
 */
export async function geocodeSearch(
  queryText: string,
  near?: { latitude: number; longitude: number },
): Promise<GeocodeResult[]> {
  if (!env.MAPBOX_TOKEN) return [];

  const params = new URLSearchParams({
    access_token: env.MAPBOX_TOKEN,
    country: 'om',
    language: 'ar,en',
    autocomplete: 'true',
    limit: '6',
  });
  if (near && inOman(near)) {
    params.set('proximity', `${near.longitude},${near.latitude}`);
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(queryText)}.json?${params}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  let payload: any;
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    payload = await r.json().catch(() => ({}));
    if (!r.ok) throw new AppError(502, 'geocode_failed', 'Search service error');
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    // A flaky search box is a worse experience than an empty one — never
    // surface a timeout/network blip to the driver as a hard error.
    return [];
  } finally {
    clearTimeout(timer);
  }

  const features: any[] = Array.isArray(payload?.features) ? payload.features : [];
  return features
    .filter(f => Array.isArray(f.center) && f.center.length === 2)
    .map(f => ({
      id: f.id ?? `${f.center[1]},${f.center[0]}`,
      name: f.text ?? f.place_name ?? queryText,
      address: f.place_name ?? '',
      latitude: f.center[1],
      longitude: f.center[0],
    }));
}
