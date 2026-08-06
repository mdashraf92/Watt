import { query } from '../../db/pool';
import { haversineKm, projectOntoPolyline, type Coord, type OsrmRoute } from './osrm';

// The trip planner: given a route and a car, work out where the driver has to
// stop and what state of charge they arrive with.
//
// The honest framing is that this is an ESTIMATE. Consumption varies with speed,
// load, aircon and terrain, none of which we know. So the planner is
// deliberately pessimistic — it reserves a buffer, charges to 80 % rather than
// 100 % (the last 20 % is slow on DC and rarely worth the wait), and reports
// infeasibility loudly rather than quietly suggesting a stop that cannot be
// reached. Being wrong in the optimistic direction strands someone.

export type Candidate = {
  kind: 'station' | 'listing';
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  power_kw: number;
  price_per_kwh: number;
  /** Distance from the route start, along the road. */
  along_km: number;
  /** How far off the route it sits. */
  detour_km: number;
};

export type PlannedStop = Candidate & {
  arrive_soc_pct: number;
  depart_soc_pct: number;
  charge_kwh: number;
  charge_minutes: number;
  cost: number;
};

export type TripPlan = {
  feasible: boolean;
  distance_km: number;
  duration_min: number;
  /** Driving time plus every charging stop. */
  total_minutes: number;
  total_cost: number;
  total_kwh: number;
  arrive_soc_pct: number;
  stops: PlannedStop[];
  /** Set when feasible is false: the leg that cannot be covered. */
  gap?: { from_km: number; needed_km: number; reachable_km: number };
};

export type PlanParams = {
  battery_kwh: number;
  start_soc_pct: number;
  /** Reserve to arrive with, and never to dip below en route. */
  reserve_soc_pct: number;
  consumption_kwh_per_100km: number;
  connector_type?: string | null;
};

// Charging past 80 % is slow enough on most DC chargers that planning for it
// makes the trip look worse than driving it would be.
const MAX_CHARGE_SOC = 80;

/**
 * Chargers within `corridorKm` of the route, ordered by distance along it.
 *
 * A bounding box prefilter in SQL keeps the row count sane (no PostGIS in this
 * database), then the exact point-to-polyline distance is computed here.
 */
export async function findCorridorChargers(
  route: OsrmRoute,
  corridorKm: number,
  connectorType?: string | null,
): Promise<Candidate[]> {
  const lats = route.coordinates.map(c => c[0]);
  const lngs = route.coordinates.map(c => c[1]);
  if (!lats.length) return [];

  // Pad the box by the corridor width. One degree of latitude is ~111 km; for
  // longitude the same degree covers less ground as you move away from the
  // equator, so divide by cos(lat) to keep the padding honest at Oman's ~23°N.
  const padLat = corridorKm / 111;
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const padLng = corridorKm / (111 * Math.max(Math.cos((midLat * Math.PI) / 180), 0.2));

  const box = {
    minLat: Math.min(...lats) - padLat, maxLat: Math.max(...lats) + padLat,
    minLng: Math.min(...lngs) - padLng, maxLng: Math.max(...lngs) + padLng,
  };

  const { rows } = await query(
    `select 'station' as kind, s.id::text, s.name, s.address,
            s.latitude, s.longitude, s.power_kw, s.price_per_kwh
       from public.stations s
      where s.latitude between $1 and $2 and s.longitude between $3 and $4
        and s.status in ('available', 'busy')
     union all
     select 'listing' as kind, cl.id::text,
            coalesce(cl.station_name, cl.address) as name, cl.address,
            cl.latitude, cl.longitude, cl.power_kw, cl.price_per_kwh
       from public.charger_listings cl
      where cl.latitude between $1 and $2 and cl.longitude between $3 and $4
        and cl.status = 'available'
        and ($5::text is null or cl.charger_type = $5)`,
    [box.minLat, box.maxLat, box.minLng, box.maxLng, connectorType ?? null],
  );

  const out: Candidate[] = [];
  for (const r of rows as any[]) {
    const { offsetKm, alongKm } = projectOntoPolyline(
      { latitude: Number(r.latitude), longitude: Number(r.longitude) },
      route.coordinates,
    );
    if (offsetKm > corridorKm) continue;
    out.push({
      kind: r.kind,
      id: r.id,
      name: r.name ?? 'Charger',
      address: r.address ?? null,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      power_kw: Number(r.power_kw ?? 22),
      price_per_kwh: Number(r.price_per_kwh ?? 0.028),
      along_km: alongKm,
      detour_km: offsetKm,
    });
  }

  out.sort((a, b) => a.along_km - b.along_km);
  return out;
}

/**
 * Greedy furthest-reachable-stop walk.
 *
 * At each step, drive as far as the usable charge allows while keeping the
 * reserve, and stop at the furthest charger inside that range. Fewest stops for
 * a given battery, which is what a driver actually wants — and being greedy is
 * safe here because stopping earlier is always still possible.
 */
export function planTrip(
  route: OsrmRoute,
  candidates: Candidate[],
  p: PlanParams,
): TripPlan {
  const totalKm     = route.distance_m / 1000;
  const perKm       = p.consumption_kwh_per_100km / 100;
  const usableStart = (p.start_soc_pct / 100) * p.battery_kwh;
  const reserveKwh  = (p.reserve_soc_pct / 100) * p.battery_kwh;

  const kmFor  = (kwh: number) => Math.max(0, (kwh - reserveKwh) / perKm);
  const socOf  = (kwh: number) => Math.round((kwh / p.battery_kwh) * 100);

  const stops: PlannedStop[] = [];
  let position = 0;              // km along the route
  let charge   = usableStart;    // kWh in the pack
  let cost = 0, kwhBought = 0, chargeMinutes = 0;

  // Guard against a pathological input (no candidates, zero-length legs)
  // spinning forever; one stop per candidate is the natural ceiling.
  for (let guard = 0; guard <= candidates.length + 1; guard++) {
    const rangeKm = kmFor(charge);

    // Can we finish from here?
    if (position + rangeKm >= totalKm) {
      const used = (totalKm - position) * perKm;
      return {
        feasible: true,
        distance_km: Math.round(totalKm * 10) / 10,
        duration_min: Math.round(route.duration_s / 60),
        total_minutes: Math.round(route.duration_s / 60) + chargeMinutes,
        total_cost: Math.round(cost * 1000) / 1000,
        total_kwh: Math.round(kwhBought * 100) / 100,
        arrive_soc_pct: Math.max(0, socOf(charge - used)),
        stops,
      };
    }

    // Furthest charger we can still reach, that is actually ahead of us.
    const reachable = candidates.filter(
      c => c.along_km > position + 0.5 && c.along_km <= position + rangeKm,
    );
    if (!reachable.length) {
      const next = candidates.find(c => c.along_km > position + 0.5);
      return {
        feasible: false,
        distance_km: Math.round(totalKm * 10) / 10,
        duration_min: Math.round(route.duration_s / 60),
        total_minutes: Math.round(route.duration_s / 60) + chargeMinutes,
        total_cost: Math.round(cost * 1000) / 1000,
        total_kwh: Math.round(kwhBought * 100) / 100,
        arrive_soc_pct: 0,
        stops,
        gap: {
          from_km: Math.round(position * 10) / 10,
          // Distance to whatever comes next — the destination if there is no
          // further charger at all.
          needed_km: Math.round(((next?.along_km ?? totalKm) - position) * 10) / 10,
          reachable_km: Math.round(rangeKm * 10) / 10,
        },
      };
    }

    const stop = reachable[reachable.length - 1];
    const arriveKwh = charge - (stop.along_km - position) * perKm;

    // Charge enough to reach the destination, or to 80 %, whichever is less —
    // no point buying range that will be thrown away at the end.
    const kwhToFinish = (totalKm - stop.along_km) * perKm + reserveKwh;
    const targetKwh   = Math.min((MAX_CHARGE_SOC / 100) * p.battery_kwh, kwhToFinish);
    const addKwh      = Math.max(0, targetKwh - arriveKwh);
    const minutes     = Math.round((addKwh / Math.max(stop.power_kw, 1)) * 60);
    const stopCost    = addKwh * stop.price_per_kwh;

    stops.push({
      ...stop,
      arrive_soc_pct: Math.max(0, socOf(arriveKwh)),
      depart_soc_pct: socOf(arriveKwh + addKwh),
      charge_kwh: Math.round(addKwh * 100) / 100,
      charge_minutes: minutes,
      cost: Math.round(stopCost * 1000) / 1000,
    });

    cost += stopCost;
    kwhBought += addKwh;
    chargeMinutes += minutes;
    charge = arriveKwh + addKwh;
    position = stop.along_km;

    // A stop that adds nothing would loop forever. Treat it as unreachable
    // rather than pretending the trip works.
    if (addKwh <= 0.01) break;
  }

  return {
    feasible: false,
    distance_km: Math.round(totalKm * 10) / 10,
    duration_min: Math.round(route.duration_s / 60),
    total_minutes: Math.round(route.duration_s / 60) + chargeMinutes,
    total_cost: Math.round(cost * 1000) / 1000,
    total_kwh: Math.round(kwhBought * 100) / 100,
    arrive_soc_pct: 0,
    stops,
    gap: {
      from_km: Math.round(position * 10) / 10,
      needed_km: Math.round((totalKm - position) * 10) / 10,
      reachable_km: Math.round(kmFor(charge) * 10) / 10,
    },
  };
}
