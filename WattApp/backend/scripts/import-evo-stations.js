// One-off import: EVO/Audi charger locations from the client's KML export into
// public.stations + public.connectors. Not wired into any app flow — run once
// with `node scripts/import-evo-stations.js` from backend/, then delete or
// leave as a record of how this data got in.
require('dotenv/config');
const fs = require('fs');
const { Pool } = require('pg');

const KML_PATH = process.argv[2] || 'C:/Users/MDASHR~1/AppData/Local/Temp/evo_kmz/doc.kml';

// governorate stored as the Arabic key (matches src/i18n/govMap.ts GOV_EN keys,
// since the app treats the stored value as Arabic and translates it for EN).
const GOV = {
  MUSCAT: 'مسقط',
  DAKHILIYAH: 'الداخلية',
  N_BATINAH: 'الباطنة الشمالية',
  S_BATINAH: 'الباطنة الجنوبية',
  N_SHARQIYAH: 'الشرقية الشمالية',
  S_SHARQIYAH: 'الشرقية الجنوبية',
  DHAHIRAH: 'الظاهرة',
  WUSTA: 'الوسطى',
  MUSANDAM: 'مسندم',
  BURAIMI: 'البريمي',
  DHOFAR: 'ظفار',
};

// Best-effort governorate by known place name — no reverse-geocoding pipeline
// exists yet (see mapchossing.md), so this is a manual lookup, not computed
// from coordinates. A few border-crossing points are genuine best guesses —
// flagged below in the import summary, worth double-checking with the client.
const GOVERNORATE_BY_NAME = {
  'Mutrah Corniche': GOV.MUSCAT,
  'Muscat Municipality': GOV.MUSCAT,
  'Qurum Park': GOV.MUSCAT,
  "Al Shati' Street": GOV.MUSCAT,
  'Ministry of Foreign Affairs': GOV.MUSCAT,
  "Jawharat Al Shati'": GOV.MUSCAT,
  'Grand Hayatt': GOV.MUSCAT,
  'Seeb Beach Dama Street': GOV.MUSCAT,
  'Oman Automobile Association': GOV.MUSCAT,
  'Central Bank Of Oman': GOV.MUSCAT,
  'Waterfront Muscat': GOV.MUSCAT,
  'Sifawi Boutique Hotel': GOV.MUSCAT,          // Quriyat — wilayat of Muscat governorate
  'Anantara Jabal Akhdar': GOV.DAKHILIYAH,
  'Kempinski Muscat': GOV.MUSCAT,
  'Khatmat Al Shukla': GOV.BURAIMI,             // best guess — border area
  'Nizwa, Golden Tulip': GOV.DAKHILIYAH,
  'Hatta, Oman Border': GOV.MUSANDAM,           // best guess — border crossing
  'Khatmat Milaha, Oman Border': GOV.MUSANDAM,  // best guess — Musandam access road
  'Sohar Falaj Al Qabail SS': GOV.N_BATINAH,
  'Expressway Halban SS': GOV.S_BATINAH,
  'Expressway Russayl SS': GOV.MUSCAT,
  'Sur Al Barr SS': GOV.S_SHARQIYAH,
  'Manah SS': GOV.DAKHILIYAH,
  'Haima SS': GOV.WUSTA,
  'Salalah Ittin SS': GOV.DHOFAR,
  'Duqm SS': GOV.WUSTA,
  'SQU SS': GOV.MUSCAT,
  'Mall Of Muscat': GOV.MUSCAT,
  'Crowne Plaza Qurum': GOV.MUSCAT,
  'OCEC Muscat': GOV.MUSCAT,
  'Salalah Anantara Al Baleed': GOV.DHOFAR,
  'Muscat International Airport': GOV.MUSCAT,
  'Maqshin SS Salalah Road': GOV.WUSTA,         // best guess — desert road midpoint
  'Saih Al Khayrat SS Salalah Road': GOV.DHOFAR,// best guess — near Dhofar boundary
  'Ibri new SS': GOV.DHAHIRAH,
};

function parseKml(xml) {
  const placemarks = [];
  const re = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const name = (block.match(/<name>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/name>/s) || [, ''])[1].trim();
    const desc = (block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [, ''])[1].trim();
    const coordMatch = block.match(/<coordinates>\s*([\-0-9.]+),([\-0-9.]+)/);
    if (!name || !coordMatch) continue;
    placemarks.push({
      name,
      description: desc,
      longitude: parseFloat(coordMatch[1]),
      latitude: parseFloat(coordMatch[2]),
    });
  }
  return placemarks;
}

// "2x 22KW AC" / "1x 120 kW DC" / "x1 120 kW DC" / "x8 22 kW AC" → connector specs.
function parseConnectors(desc) {
  const specs = [];
  const parts = desc.split(/<br\s*\/?>/i);
  for (const part of parts) {
    const m = part.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*k?w|x\s*(\d+)\s+(\d+(?:\.\d+)?)\s*k?w/i);
    if (!m) continue;
    const count = parseInt(m[1] ?? m[3], 10);
    const power = parseFloat(m[2] ?? m[4]);
    const isDc = /dc/i.test(part);
    specs.push({ count, power_kw: power, connector_type: isDc ? 'CCS' : 'Type2' });
  }
  return specs;
}

async function main() {
  const xml = fs.readFileSync(KML_PATH, 'utf8');
  const placemarks = parseKml(xml);
  console.log(`Parsed ${placemarks.length} placemarks from KML.`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const skippedGovernorate = [];

  try {
    await client.query('BEGIN');
    let inserted = 0;

    for (const p of placemarks) {
      const gov = GOVERNORATE_BY_NAME[p.name];
      if (!gov) { skippedGovernorate.push(p.name); continue; }

      const connectors = parseConnectors(p.description);
      const totalConnectors = connectors.reduce((n, c) => n + c.count, 0) || 1;
      const powerKw = connectors.length ? Math.max(...connectors.map(c => c.power_kw)) : 22;

      const { rows } = await client.query(
        `insert into public.stations
           (name, address, governorate, latitude, longitude, status,
            price_per_kwh, total_connectors, available_connectors, power_kw, operating_hours)
         values ($1,$2,$3,$4,$5,'available',$6,$7,$8,$9,'24/7')
         returning id`,
        [
          p.name,
          `${p.name}, Oman`,
          gov,
          p.latitude,
          p.longitude,
          0.028,               // placeholder — no real EVO/Audi tariff agreed yet
          totalConnectors,
          totalConnectors,
          powerKw,
        ],
      );
      const stationId = rows[0].id;

      for (const c of connectors) {
        for (let i = 0; i < c.count; i++) {
          await client.query(
            `insert into public.connectors (station_id, connector_type, power_kw, status)
             values ($1,$2,$3,'available')`,
            [stationId, c.connector_type, c.power_kw],
          );
        }
      }
      inserted++;
    }

    await client.query('COMMIT');
    console.log(`Inserted ${inserted} stations.`);
    if (skippedGovernorate.length) {
      console.log('Skipped (no governorate mapping):', skippedGovernorate);
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
