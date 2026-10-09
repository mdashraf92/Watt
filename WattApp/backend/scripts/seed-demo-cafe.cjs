#!/usr/bin/env node
// LOCAL ONLY: turn one charging station into a demo Go Watt café so the Coffee
// tab, the staff order board and the dashboard's café pages have something to show.
//
//   node scripts/seed-demo-cafe.cjs                       first station alphabetically
//   node scripts/seed-demo-cafe.cjs "Qurum Park" staff@example.com
//
// Creates: package venue + café settings, a "Coffee + 60 min" package (5.000 OMR),
// a small menu, and (optionally) makes an existing account café staff.
// Safe to re-run. Ordering still needs a configured charger device, a fresh package
// monitor heartbeat and Thawani keys — see docs/RUN_LOCALLY.md.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { Client } = require('pg');

const url = process.env.DATABASE_URL || '';
let host = '';
try { host = new URL(url).hostname; } catch { /* reported below */ }
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error('✖ seed-demo-cafe only runs against a local DATABASE_URL.');
  process.exit(1);
}
const [stationName, staffEmail] = process.argv.slice(2);

const size = { id: 'size', name: 'Size', name_ar: 'الحجم', required: true, max: 1, choices: [
  { id: 'reg', name: 'Regular', name_ar: 'عادي', price_delta: 0 },
  { id: 'lg', name: 'Large', name_ar: 'كبير', price_delta: 0.3 }] };
const milk = { id: 'milk', name: 'Milk', name_ar: 'الحليب', max: 1, choices: [
  { id: 'oat', name: 'Oat milk', name_ar: 'حليب الشوفان', price_delta: 0.25 },
  { id: 'almond', name: 'Almond milk', name_ar: 'حليب اللوز', price_delta: 0.25 }] };
const MENU = [
  ['Coffee', 'قهوة', 'Spanish latte', 'سبانش لاتيه', 2.2, 0, [size, milk]],
  ['Coffee', 'قهوة', 'Flat white', 'فلات وايت', 2.0, 0, [size, milk]],
  ['Coffee', 'قهوة', 'Americano', 'أمريكانو', 1.6, 0, [size]],
  ['Coffee', 'قهوة', 'V60 single origin', 'V60 محصول واحد', 3.0, 0.5, []],
  ['Cold', 'باردة', 'Iced latte', 'آيس لاتيه', 2.4, 0.2, [milk]],
  ['Bakery', 'مخبوزات', 'Butter croissant', 'كرواسون بالزبدة', 1.2, null, []],
  ['Bakery', 'مخبوزات', 'Date cake', 'كيكة التمر', 1.5, null, []],
];

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('begin');
    const st = (await c.query(
      stationName ? 'select id, name from stations where name ilike $1 order by name limit 1' : 'select id, name from stations order by name limit 1',
      stationName ? [`%${stationName}%`] : [])).rows[0];
    if (!st) throw new Error(stationName ? `No station matching "${stationName}"` : 'No stations — import them first (see docs/RUN_LOCALLY.md)');
    // Package-venue mode is refused while metered bookings/sessions are open; clear demo data only on local.
    await c.query(`update stations set is_package_venue=true, cafe_enabled=true, prep_minutes=8, menu_source='manual',
                   charge_share_omr=1.000, commission_pct=10, beanz_fee_pct=0, orders_paused=false where id=$1`, [st.id]);
    const pkg = (await c.query(`select id from venue_packages where station_id=$1 and name='Coffee + 60 min'`, [st.id])).rows[0];
    if (!pkg) await c.query(`insert into venue_packages (station_id, name, name_ar, description, description_ar, partner_benefit, partner_benefit_ar,
                               price, included_minutes, included_items, validity_hours, is_active, sort_order)
                             values ($1,'Coffee + 60 min','قهوة + ٦٠ دقيقة','Any coffee from the menu and an hour on the charger.',
                               'أي قهوة من القائمة وساعة على الشاحن.','Coffee of your choice','قهوة من اختيارك',5.000,60,1,24,true,0)`, [st.id]);
    if (!(await c.query('select 1 from cafe_menu_items where station_id=$1 limit 1', [st.id])).rows.length) {
      let order = 0;
      for (const [cat, catAr, name, nameAr, price, upcharge, options] of MENU) {
        await c.query(`insert into cafe_menu_items (station_id, category, category_ar, name, name_ar, price, package_upcharge, options, sort_order)
                       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [st.id, cat, catAr, name, nameAr, price, upcharge, JSON.stringify(options), order++]);
      }
    }
    if (staffEmail) {
      const u = (await c.query('select id from auth.users where lower(email)=lower($1)', [staffEmail])).rows[0];
      if (!u) throw new Error(`No account with email ${staffEmail}`);
      await c.query('insert into venue_staff (station_id, user_id) values ($1,$2) on conflict do nothing', [st.id, u.id]);
    }
    await c.query('commit');
    console.log(`✔ Demo café ready at "${st.name}"${staffEmail ? ` · staff: ${staffEmail}` : ''}`);
  } catch (e) {
    await c.query('rollback').catch(() => {});
    console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  } finally { await c.end(); }
})();
