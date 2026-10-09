#!/usr/bin/env node
// DEMO CONTENT: two demo cafés (Coffee tab) and two demo sellers with products and
// services (Shop tab), all with photos. Every row uses a fixed id from DEMO below,
// so re-running updates in place and --remove deletes exactly these rows.
//
//   node scripts/seed-demo-content.cjs            add / refresh
//   node scripts/seed-demo-content.cjs --remove   delete everything this script added
//
// Runs against whatever DATABASE_URL points at, including the shared cloud DB.
// The catalog hides products not updated in 30 days: re-run to keep them visible.
// Cafés list with "soon" (not orderable): ordering needs a charger device + heartbeat.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { Client } = require('pg');

const img = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80`;
const id = (n) => `de000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DEMO = {
  users: { shop: id(1), care: id(2) },
  vendors: { shop: id(11), care: id(12) },
  stations: { qurum: id(21), mouj: id(22) },
};

const CAFES = [
  { id: DEMO.stations.qurum, name: 'Demo Café — Qurum', name_ar: 'مقهى تجريبي — القرم',
    address: 'Qurum Beach Road, Muscat', address_ar: 'شارع شاطئ القرم، مسقط', wilayat: 'Bawshar',
    lat: 23.6145, lng: 58.4750, image: img('1554118811-1e0d58224f24') },
  { id: DEMO.stations.mouj, name: 'Demo Café — Al Mouj', name_ar: 'مقهى تجريبي — الموج',
    address: 'The Walk, Al Mouj, Muscat', address_ar: 'الممشى، الموج، مسقط', wilayat: 'Seeb',
    lat: 23.6280, lng: 58.2830, image: img('1600093463592-8e36ae95ef56') },
];

const PACKAGES = [
  ['Coffee + 60 min', 'قهوة + 60 دقيقة', 5.0, 60, 1, 'Any coffee from the menu', 'أي قهوة من القائمة'],
  ['Coffee + 30 min', 'قهوة + 30 دقيقة', 3.0, 30, 1, 'Any coffee from the menu', 'أي قهوة من القائمة'],
];

const size = { id: 'size', name: 'Size', name_ar: 'الحجم', required: true, max: 1, choices: [
  { id: 'reg', name: 'Regular', name_ar: 'عادي', price_delta: 0 },
  { id: 'lg', name: 'Large', name_ar: 'كبير', price_delta: 0.3 }] };
const milk = { id: 'milk', name: 'Milk', name_ar: 'الحليب', max: 1, choices: [
  { id: 'oat', name: 'Oat milk', name_ar: 'حليب الشوفان', price_delta: 0.25 },
  { id: 'almond', name: 'Almond milk', name_ar: 'حليب اللوز', price_delta: 0.25 }] };
// [key, category, category_ar, name, name_ar, description, description_ar, price, package_upcharge, options, image]
const MENU = [
  ['spanish', 'Coffee', 'قهوة', 'Spanish latte', 'سبانش لاتيه', 'Espresso, milk and condensed milk', 'إسبريسو مع الحليب والحليب المكثف', 2.2, 0, [size, milk], img('1495474472287-4d71bcdd2085')],
  ['flat', 'Coffee', 'قهوة', 'Flat white', 'فلات وايت', 'Double shot with silky milk', 'جرعتان من الإسبريسو مع حليب ناعم', 2.0, 0, [size, milk], img('1541167760496-1628856ab772')],
  ['cappuccino', 'Coffee', 'قهوة', 'Cappuccino', 'كابتشينو', 'Espresso with thick milk foam', 'إسبريسو مع رغوة حليب كثيفة', 1.9, 0, [size, milk], img('1509042239860-f550ce710b93')],
  ['americano', 'Coffee', 'قهوة', 'Americano', 'أمريكانو', 'Espresso with hot water', 'إسبريسو مع ماء ساخن', 1.6, 0, [size], img('1514432324607-a09d9b4aefdd')],
  ['v60', 'Coffee', 'قهوة', 'V60 single origin', 'V60 محصول واحد', 'Hand-poured filter coffee', 'قهوة مقطرة يدوياً', 3.0, 0.5, [], img('1511920170033-f8396924c348')],
  ['iced-latte', 'Cold', 'باردة', 'Iced latte', 'آيس لاتيه', 'Espresso and cold milk over ice', 'إسبريسو وحليب بارد مع الثلج', 2.4, 0.2, [milk], img('1517701604599-bb29b565090c')],
  ['cold-brew', 'Cold', 'باردة', 'Cold brew', 'كولد برو', 'Steeped for 18 hours', 'منقوعة لمدة 18 ساعة', 2.5, 0.3, [milk], img('1461023058943-07fcbe16d735')],
  ['croissant', 'Bakery', 'مخبوزات', 'Butter croissant', 'كرواسون بالزبدة', 'Baked fresh every morning', 'يُخبز طازجاً كل صباح', 1.2, null, [], img('1555507036-ab1f4038808a')],
];

const VENDORS = [
  { key: 'shop', id: DEMO.vendors.shop, owner: DEMO.users.shop, email: 'demo-shop@gowatt.invalid',
    name: 'Demo EV Store', name_ar: 'متجر السيارات الكهربائية التجريبي', seller_type: 'shop',
    about: 'Demo seller — chargers, cables and accessories.', about_ar: 'بائع تجريبي — شواحن وكابلات وإكسسوارات.',
    logo: img('1593941707874-ef25b8b4a92b') },
  { key: 'care', id: DEMO.vendors.care, owner: DEMO.users.care, email: 'demo-care@gowatt.invalid',
    name: 'Demo Auto Care', name_ar: 'العناية بالسيارات التجريبي', seller_type: 'service',
    about: 'Demo seller — installation, maintenance and detailing.', about_ar: 'بائع تجريبي — تركيب وصيانة وتنظيف.',
    logo: img('1486262715619-67b85e0b08d3') },
];

// [n, vendor, category, kind, name, name_ar, description, description_ar, price (OMR), stock, image, service {minutes, location}]
const PRODUCTS = [
  [31, 'shop', 'chargers', 'physical', 'Home Wall Charger 7.4 kW', 'شاحن منزلي جداري 7.4 كيلوواط',
    'Type 2 wall charger with app control and scheduled charging.', 'شاحن جداري Type 2 مع تحكم عبر التطبيق وجدولة الشحن.', 185, 5, img('1593941707874-ef25b8b4a92b')],
  [32, 'shop', 'cables', 'physical', 'Type 2 Charging Cable 5 m', 'كابل شحن Type 2 بطول 5 م',
    '32 A, three-phase, with carry bag.', '32 أمبير، ثلاثي الطور، مع حقيبة.', 45, 20, img('1593941707882-a5bba14938c7')],
  [33, 'shop', 'chargers', 'physical', 'Portable EV Charger 3.5 kW', 'شاحن متنقل 3.5 كيلوواط',
    'Charge from any household socket while travelling.', 'اشحن من أي مقبس منزلي أثناء السفر.', 95, 8, img('1617788138017-80ad40651399')],
  [34, 'shop', 'accessories', 'physical', 'Magnetic Phone Holder', 'حامل هاتف مغناطيسي',
    'Dashboard mount that keeps navigation in view.', 'حامل على لوحة القيادة يبقي الخريطة أمامك.', 6.5, 40, img('1600320254374-ce2d293c324e')],
  [41, 'care', 'installation', 'service', 'Home Charger Installation', 'تركيب شاحن منزلي',
    'A licensed electrician installs and tests your wall charger.', 'كهربائي مرخص يركّب الشاحن الجداري ويختبره.', 60, 0, img('1621905251189-08b45d6a269e'), { minutes: 180, location: 'mobile' }],
  [42, 'care', 'maintenance', 'service', 'EV Health Check', 'فحص شامل للسيارة الكهربائية',
    'Battery, brakes, cooling and software check.', 'فحص البطارية والفرامل والتبريد والبرمجيات.', 25, 0, img('1486262715619-67b85e0b08d3'), { minutes: 60, location: 'at_centre' }],
  [43, 'care', 'detailing', 'service', 'Premium Car Detailing', 'تنظيف وتلميع فاخر للسيارة',
    'Full wash, interior clean and wax.', 'غسيل كامل وتنظيف داخلي وتشميع.', 18, 0, img('1607860108855-64acf2078ed9'), { minutes: 120, location: 'at_centre' }],
  [44, 'care', 'tyre-service', 'service', 'Tyre Rotation & Check', 'تبديل وفحص الإطارات',
    'Rotate, balance and check tyre pressure.', 'تبديل الإطارات وموازنتها وفحص الضغط.', 8, 0, img('1619767886558-efdc259cde1a'), { minutes: 45, location: 'at_centre' }],
];

const demoStationIds = Object.values(DEMO.stations);
const demoProductIds = PRODUCTS.map(([n]) => id(n));
const demoUserIds = Object.values(DEMO.users);

async function remove(c) {
  await c.query('delete from market_slots where product_id = any($1)', [demoProductIds]);
  await c.query('delete from market_variants where product_id = any($1)', [demoProductIds]);
  await c.query('delete from market_products where id = any($1)', [demoProductIds]);
  await c.query('delete from market_vendors where id = any($1)', [Object.values(DEMO.vendors)]);
  await c.query('delete from cafe_menu_items where station_id = any($1)', [demoStationIds]);
  await c.query('delete from venue_packages where station_id = any($1)', [demoStationIds]);
  await c.query('delete from stations where id = any($1)', [demoStationIds]);
  await c.query('delete from profiles where id = any($1)', [demoUserIds]);
  await c.query('delete from auth.users where id = any($1)', [demoUserIds]);
}

async function seed(c) {
  for (const s of CAFES) {
    await c.query(`insert into stations (id, name, name_ar, address, address_ar, governorate, wilayat, latitude, longitude, image_url,
        is_package_venue, cafe_enabled, prep_minutes, menu_source, charge_share_omr, commission_pct, beanz_fee_pct, orders_paused)
      values ($1,$2,$3,$4,$5,'Muscat',$6,$7,$8,$9, true, true, 8, 'manual', 1, 10, 0, false)
      on conflict (id) do update set name=excluded.name, name_ar=excluded.name_ar, address=excluded.address, address_ar=excluded.address_ar,
        image_url=excluded.image_url, is_package_venue=true, cafe_enabled=true`,
      [s.id, s.name, s.name_ar, s.address, s.address_ar, s.wilayat, s.lat, s.lng, s.image]);
    for (const [i, [name, name_ar, price, minutes, items, benefit, benefit_ar]] of PACKAGES.entries()) {
      const pid = id(100 + CAFES.indexOf(s) * 10 + i);
      await c.query(`insert into venue_packages (id, station_id, name, name_ar, partner_benefit, partner_benefit_ar, price, included_minutes, included_items, sort_order)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        on conflict (id) do update set name=excluded.name, name_ar=excluded.name_ar, price=excluded.price, included_minutes=excluded.included_minutes, is_active=true`,
        [pid, s.id, name, name_ar, benefit, benefit_ar, price, minutes, items, i]);
    }
    for (const [i, [key, cat, cat_ar, name, name_ar, desc, desc_ar, price, upcharge, options, image]] of MENU.entries()) {
      await c.query(`insert into cafe_menu_items (station_id, external_id, source, category, category_ar, name, name_ar, description, description_ar,
          price, package_upcharge, options, image_url, sort_order)
        values ($1,$2,'manual',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (station_id, external_id) where external_id is not null do update set name=excluded.name, name_ar=excluded.name_ar,
          description=excluded.description, description_ar=excluded.description_ar, price=excluded.price,
          package_upcharge=excluded.package_upcharge, options=excluded.options, image_url=excluded.image_url, is_available=true`,
        [s.id, `demo-${key}`, cat, cat_ar, name, name_ar, desc, desc_ar, price, upcharge, JSON.stringify(options), image, i]);
    }
  }

  for (const v of VENDORS) {
    // The auth trigger creates the profile; these accounts have no password, so nobody can sign in as them.
    await c.query(`insert into auth.users (id, email, created_at, updated_at) values ($1,$2,now(),now()) on conflict (id) do nothing`, [v.owner, v.email]);
    await c.query(`insert into profiles (id, full_name, role) values ($1,$2,'customer')
      on conflict (id) do update set full_name=excluded.full_name`, [v.owner, `${v.name} (demo)`]);
    await c.query(`insert into market_vendors (id, owner_id, name, name_ar, cr_number, contact_phone, address, status, commission_bps,
        seller_type, about, about_ar, logo_url, email, pickup_enabled)
      values ($1,$2,$3,$4,'DEMO-0000','+968 0000 0000','Muscat, Oman','approved',1000,$5,$6,$7,$8,$9,true)
      on conflict (id) do update set name=excluded.name, name_ar=excluded.name_ar, status='approved', commission_bps=1000,
        about=excluded.about, about_ar=excluded.about_ar, logo_url=excluded.logo_url`,
      [v.id, v.owner, v.name, v.name_ar, v.seller_type, v.about, v.about_ar, v.logo, v.email]);
  }

  for (const [n, vendor, category, kind, name, name_ar, desc, desc_ar, price, stock, image, svc] of PRODUCTS) {
    const pid = id(n);
    await c.query(`insert into market_products (id, vendor_id, category_id, kind, name, name_ar, description, description_ar, image_url, images,
        specifications, warranty, warranty_ar, return_days, status, duration_minutes, service_location, price_basis, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{"demo":"true"}',$11,$12,$13,'published',$14,$15,$16,now())
      on conflict (id) do update set name=excluded.name, name_ar=excluded.name_ar, description=excluded.description,
        description_ar=excluded.description_ar, image_url=excluded.image_url, images=excluded.images, status='published', updated_at=now()`,
      [pid, DEMO.vendors[vendor], category, kind, name, name_ar, desc, desc_ar, image, JSON.stringify([image]),
        kind === 'physical' ? '1 year' : '30 days on workmanship', kind === 'physical' ? 'سنة واحدة' : '30 يوماً على العمل',
        kind === 'physical' ? 14 : 0, svc?.minutes ?? null, svc?.location ?? 'at_centre', 'fixed']);
    // Variant prices are integer baisa (1 OMR = 1000 baisa).
    await c.query(`insert into market_variants (product_id, sku, name, name_ar, price, stock) values ($1,$2,'Standard','قياسي',$3,$4)
      on conflict (sku) do update set price=excluded.price, stock=excluded.stock`,
      [pid, `DEMO-${n}`, Math.round(price * 1000), stock]);
    if (svc) {
      for (let day = 1; day <= 14; day++) {
        for (const hour of [9, 13, 17]) {
          await c.query(`insert into market_slots (product_id, starts_at, capacity)
            values ($1, (current_date + $2::int) + make_interval(hours => $3::int - 4), 2)
            on conflict (product_id, starts_at) do nothing`, [pid, day, hour]); // hours in Oman time (UTC+4)
        }
      }
    }
  }
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const removing = process.argv.includes('--remove');
  try {
    await c.query('begin');
    if (removing) await remove(c); else await seed(c);
    await c.query('commit');
    console.log(removing ? '✔ Demo content removed.' : `✔ Demo content ready: ${CAFES.length} cafés, ${PRODUCTS.length} marketplace items.`);
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error('✖', e.message); process.exit(1); });
