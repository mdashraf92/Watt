/**
 * EV catalog — the source for the car picker's make/model list and for
 * auto-filling battery size and connector type.
 *
 * Scope is the GCC/Oman market, and every entry is a *variant* rather than a
 * bare model, because battery size is a property of the trim, not the
 * nameplate ("Model 3" alone cannot fill in a kWh figure).
 *
 * Figures are usable-battery approximations from published specs and are only
 * ever a starting point: every field stays editable after picking, and the
 * trip planner's range maths is the user's own to correct. Prefer leaving a
 * car out over inventing a number for it.
 *
 * DC connector is what varies and what matters for planning. AC charging in
 * this region is Type 2 across the board, so it is not modelled separately.
 */

export type ConnectorCode = 'Type2' | 'CCS' | 'CHAdeMO' | 'GBT';

export interface EvEntry {
  make: string;
  /** Variant name shown under the make, e.g. "Model 3 Long Range". */
  model: string;
  batteryKwh: number;
  connector: ConnectorCode;
  /** First model year offered in this region. */
  yearFrom: number;
}

export const EV_CATALOG: EvEntry[] = [
  // ── Tesla ──
  { make: 'Tesla', model: 'Model 3 Standard Range', batteryKwh: 57.5, connector: 'CCS', yearFrom: 2019 },
  { make: 'Tesla', model: 'Model 3 Long Range',     batteryKwh: 75,   connector: 'CCS', yearFrom: 2019 },
  { make: 'Tesla', model: 'Model 3 Performance',    batteryKwh: 75,   connector: 'CCS', yearFrom: 2019 },
  { make: 'Tesla', model: 'Model Y Standard Range', batteryKwh: 60,   connector: 'CCS', yearFrom: 2021 },
  { make: 'Tesla', model: 'Model Y Long Range',     batteryKwh: 75,   connector: 'CCS', yearFrom: 2021 },
  { make: 'Tesla', model: 'Model Y Performance',    batteryKwh: 75,   connector: 'CCS', yearFrom: 2021 },
  { make: 'Tesla', model: 'Model S',                batteryKwh: 95,   connector: 'CCS', yearFrom: 2021 },
  { make: 'Tesla', model: 'Model X',                batteryKwh: 95,   connector: 'CCS', yearFrom: 2021 },

  // ── BYD ──
  { make: 'BYD', model: 'Atto 3',        batteryKwh: 60,   connector: 'CCS', yearFrom: 2022 },
  { make: 'BYD', model: 'Dolphin',       batteryKwh: 44.9, connector: 'CCS', yearFrom: 2023 },
  { make: 'BYD', model: 'Seal Dynamic',  batteryKwh: 61.4, connector: 'CCS', yearFrom: 2023 },
  { make: 'BYD', model: 'Seal AWD',      batteryKwh: 82.5, connector: 'CCS', yearFrom: 2023 },
  { make: 'BYD', model: 'Han EV',        batteryKwh: 85.4, connector: 'CCS', yearFrom: 2022 },
  { make: 'BYD', model: 'Tang EV',       batteryKwh: 86.4, connector: 'CCS', yearFrom: 2022 },
  { make: 'BYD', model: 'Song Plus EV',  batteryKwh: 71.8, connector: 'CCS', yearFrom: 2022 },
  { make: 'BYD', model: 'Seagull',       batteryKwh: 38.9, connector: 'CCS', yearFrom: 2024 },

  // ── MG ──
  { make: 'MG', model: 'ZS EV Standard', batteryKwh: 51.1, connector: 'CCS', yearFrom: 2022 },
  { make: 'MG', model: 'ZS EV Long Range', batteryKwh: 72, connector: 'CCS', yearFrom: 2022 },
  { make: 'MG', model: 'MG4 Standard',   batteryKwh: 51,   connector: 'CCS', yearFrom: 2023 },
  { make: 'MG', model: 'MG4 Long Range', batteryKwh: 64,   connector: 'CCS', yearFrom: 2023 },
  { make: 'MG', model: 'MG5 EV',         batteryKwh: 50.3, connector: 'CCS', yearFrom: 2022 },
  { make: 'MG', model: 'Marvel R',       batteryKwh: 70,   connector: 'CCS', yearFrom: 2022 },

  // ── Hyundai ──
  { make: 'Hyundai', model: 'Ioniq 5 Standard',  batteryKwh: 58,  connector: 'CCS', yearFrom: 2021 },
  { make: 'Hyundai', model: 'Ioniq 5 Long Range', batteryKwh: 77.4, connector: 'CCS', yearFrom: 2021 },
  { make: 'Hyundai', model: 'Ioniq 6',           batteryKwh: 77.4, connector: 'CCS', yearFrom: 2023 },
  { make: 'Hyundai', model: 'Kona Electric',     batteryKwh: 64,  connector: 'CCS', yearFrom: 2019 },

  // ── Kia ──
  { make: 'Kia', model: 'EV6',      batteryKwh: 77.4, connector: 'CCS', yearFrom: 2022 },
  { make: 'Kia', model: 'EV9',      batteryKwh: 99.8, connector: 'CCS', yearFrom: 2023 },
  { make: 'Kia', model: 'Niro EV',  batteryKwh: 64.8, connector: 'CCS', yearFrom: 2022 },

  // ── Nissan ──
  { make: 'Nissan', model: 'Leaf',      batteryKwh: 40, connector: 'CHAdeMO', yearFrom: 2018 },
  { make: 'Nissan', model: 'Leaf e+',   batteryKwh: 62, connector: 'CHAdeMO', yearFrom: 2019 },
  { make: 'Nissan', model: 'Ariya',     batteryKwh: 87, connector: 'CCS', yearFrom: 2023 },

  // ── Audi ──
  { make: 'Audi', model: 'Q4 e-tron',    batteryKwh: 77,  connector: 'CCS', yearFrom: 2022 },
  { make: 'Audi', model: 'Q8 e-tron',    batteryKwh: 106, connector: 'CCS', yearFrom: 2023 },
  { make: 'Audi', model: 'e-tron GT',    batteryKwh: 85,  connector: 'CCS', yearFrom: 2021 },

  // ── BMW ──
  { make: 'BMW', model: 'i4 eDrive40',  batteryKwh: 80.7, connector: 'CCS', yearFrom: 2022 },
  { make: 'BMW', model: 'iX xDrive40',  batteryKwh: 71,   connector: 'CCS', yearFrom: 2022 },
  { make: 'BMW', model: 'iX xDrive50',  batteryKwh: 105,  connector: 'CCS', yearFrom: 2022 },
  { make: 'BMW', model: 'iX3',          batteryKwh: 74,   connector: 'CCS', yearFrom: 2021 },
  { make: 'BMW', model: 'i7',           batteryKwh: 101.7, connector: 'CCS', yearFrom: 2023 },

  // ── Mercedes-Benz ──
  { make: 'Mercedes-Benz', model: 'EQB',  batteryKwh: 66.5, connector: 'CCS', yearFrom: 2022 },
  { make: 'Mercedes-Benz', model: 'EQC',  batteryKwh: 80,   connector: 'CCS', yearFrom: 2020 },
  { make: 'Mercedes-Benz', model: 'EQE',  batteryKwh: 90.6, connector: 'CCS', yearFrom: 2022 },
  { make: 'Mercedes-Benz', model: 'EQS',  batteryKwh: 107.8, connector: 'CCS', yearFrom: 2022 },

  // ── Porsche ──
  { make: 'Porsche', model: 'Taycan',              batteryKwh: 79.2, connector: 'CCS', yearFrom: 2020 },
  { make: 'Porsche', model: 'Taycan Performance Plus', batteryKwh: 93.4, connector: 'CCS', yearFrom: 2020 },

  // ── Volvo / Polestar ──
  { make: 'Volvo',    model: 'XC40 Recharge', batteryKwh: 78, connector: 'CCS', yearFrom: 2021 },
  { make: 'Volvo',    model: 'C40 Recharge',  batteryKwh: 78, connector: 'CCS', yearFrom: 2022 },
  { make: 'Volvo',    model: 'EX30',          batteryKwh: 69, connector: 'CCS', yearFrom: 2024 },
  { make: 'Polestar', model: '2 Long Range',  batteryKwh: 78, connector: 'CCS', yearFrom: 2021 },

  // ── Volkswagen ──
  { make: 'Volkswagen', model: 'ID.4',  batteryKwh: 77, connector: 'CCS', yearFrom: 2021 },
  { make: 'Volkswagen', model: 'ID.6',  batteryKwh: 83, connector: 'CCS', yearFrom: 2022 },

  // ── Chinese marques increasingly sold in the GCC ──
  { make: 'Zeekr',   model: '001',       batteryKwh: 100,  connector: 'CCS', yearFrom: 2023 },
  { make: 'Zeekr',   model: 'X',         batteryKwh: 66,   connector: 'CCS', yearFrom: 2024 },
  { make: 'Xpeng',   model: 'G9',        batteryKwh: 98,   connector: 'CCS', yearFrom: 2023 },
  { make: 'Xpeng',   model: 'P7',        batteryKwh: 86,   connector: 'CCS', yearFrom: 2022 },
  { make: 'NIO',     model: 'ES6',       batteryKwh: 75,   connector: 'CCS', yearFrom: 2023 },
  { make: 'GAC',     model: 'Aion Y',    batteryKwh: 63,   connector: 'CCS', yearFrom: 2023 },
  { make: 'GAC',     model: 'Aion V',    batteryKwh: 70,   connector: 'CCS', yearFrom: 2023 },
  { make: 'Changan', model: 'Eado EV',   batteryKwh: 52.6, connector: 'CCS', yearFrom: 2022 },
  { make: 'Jetour',  model: 'Dashing EV', batteryKwh: 64,  connector: 'CCS', yearFrom: 2024 },
  { make: 'Geely',   model: 'Geometry C', batteryKwh: 70,  connector: 'CCS', yearFrom: 2022 },
  { make: 'Jaecoo',  model: 'J6 EV',     batteryKwh: 69,   connector: 'CCS', yearFrom: 2024 },

  // ── Others ──
  { make: 'Lucid', model: 'Air Pure',        batteryKwh: 88,  connector: 'CCS', yearFrom: 2023 },
  { make: 'Lucid', model: 'Air Grand Touring', batteryKwh: 112, connector: 'CCS', yearFrom: 2022 },
  { make: 'Ford',  model: 'Mustang Mach-E',  batteryKwh: 88,  connector: 'CCS', yearFrom: 2022 },
  { make: 'Chevrolet', model: 'Bolt EV',     batteryKwh: 65,  connector: 'CCS', yearFrom: 2020 },
];

/** Makes, de-duplicated and alphabetical. */
export function evMakes(): string[] {
  return Array.from(new Set(EV_CATALOG.map(e => e.make))).sort((a, b) => a.localeCompare(b));
}

/** Variants for one make, alphabetical. */
export function evModelsFor(make: string): EvEntry[] {
  return EV_CATALOG
    .filter(e => e.make === make)
    .sort((a, b) => a.model.localeCompare(b.model));
}

export function findEv(make: string, model: string): EvEntry | undefined {
  return EV_CATALOG.find(e => e.make === make && e.model === model);
}

/**
 * Model years offered for a variant, newest first. Capped at next calendar
 * year so a car ordered ahead of its model year can still be selected.
 */
export function evYears(entry: EvEntry | undefined, now = new Date()): string[] {
  const max = now.getFullYear() + 1;
  const from = entry?.yearFrom ?? 2015;
  const years: string[] = [];
  for (let y = max; y >= from; y--) years.push(String(y));
  return years;
}
