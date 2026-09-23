import { pool } from '../../db/pool';
import { readPackageDevice, switchPackageDevice } from '../../integrations/tuya';
import { PackageChargingService } from './charging.service';

export const packageCharging = new PackageChargingService(pool, {
  read: readPackageDevice,
  switch: switchPackageDevice,
});

// Skip overlapping ticks in this process; connector locks coordinate processes.
let polling: ReturnType<PackageChargingService['poll']> | null = null;
export function pollPackageCharging() {
  if (!polling) polling = packageCharging.poll().finally(() => { polling = null; });
  return polling;
}
