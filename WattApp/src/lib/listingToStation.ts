import type { ChargerListing, Station } from '../types';

// Renders a private charger listing through the same UI as an official
// station (map pins, list cards, StationDetailsScreen) by mapping it onto
// the Station shape. A listing is always exactly one connector/plug, so
// total/available connectors collapse to 1/0-or-1 based on availability.
export function listingToStation(l: ChargerListing): Station {
  return {
    id: l.id,
    name: l.station_name ? `🏠 ${l.station_name}` : `🏠 ${l.host_name ?? 'Private Charger'}`,
    address: l.address,
    latitude: l.latitude,
    longitude: l.longitude,
    status: l.is_available ? 'available' : 'offline',
    price_per_kwh: l.price_per_kwh,
    total_connectors: 1,
    available_connectors: l.is_available ? 1 : 0,
    rating: l.rating,
    total_ratings: l.total_ratings,
    power_kw: l.power_kw,
    operating_hours: `${l.availability_start ?? '08:00'} – ${l.availability_end ?? '22:00'}`,
    governorate: '',
    created_at: l.created_at,
  };
}
