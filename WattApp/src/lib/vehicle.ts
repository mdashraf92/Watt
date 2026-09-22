// profiles.car_model holds either a plain model string (older rows, and rows
// written by CompleteProfileScreen) or a JSON blob written by the Profile
// screen's vehicle editor. Anything displaying a car must go through here, or
// the JSON leaks to the user as raw text.

export interface VehicleData { model: string; connector: string; year: string }

export function parseVehicle(raw?: string | null): VehicleData {
  if (!raw) return { model: '', connector: '', year: '' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.model !== undefined) {
      return parsed as VehicleData;
    }
  } catch {}
  return { model: raw, connector: '', year: '' };
}

export function serializeVehicle(v: VehicleData): string {
  return JSON.stringify(v);
}

/** Human-readable car name, e.g. "Tesla Model 3". Empty when nothing is set. */
export function vehicleLabel(make?: string | null, carModel?: string | null): string {
  const model = parseVehicle(carModel).model.trim();
  return [make?.trim(), model].filter(Boolean).join(' ');
}
