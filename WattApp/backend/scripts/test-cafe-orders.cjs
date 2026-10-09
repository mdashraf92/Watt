const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Café order money invariants. Runs inside test-packages.cjs after the package
// venue migration, on the same isolated cluster. No gateway is called: the
// backend's Thawani step is represented by payment_sessions rows.
module.exports = async function cafeOrderTests(t, pool) {
  await pool.query(`create table if not exists payment_sessions(id uuid primary key default gen_random_uuid(),
    user_id uuid not null, session_id text not null unique, amount numeric not null, status text not null default 'pending',
    purpose text not null default 'topup', created_at timestamptz default now(), paid_at timestamptz)`);
  const migration = fs.readFileSync(path.join(__dirname, '../sql/backend-cafe-orders.sql'), 'utf8');
  await pool.query(migration);
  await pool.query(migration); // replay must be safe

  async function as(id, sql, args = [], admin = false) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: id, test_admin: String(admin) })]);
      const { rows } = await client.query(sql, args);
      await client.query('commit');
      return rows[0]?.result;
    } catch (e) { await client.query('rollback'); throw e; }
    finally { client.release(); }
  }
  const one = async (sql, args) => (await pool.query(sql, args)).rows[0];

  const customer = (await one(`insert into profiles(id,wallet_balance,held_balance) values(gen_random_uuid(),0,0) returning id`)).id;
  const barista = (await one(`insert into profiles(id,wallet_balance,held_balance) values(gen_random_uuid(),0,0) returning id`)).id;
  const stranger = (await one(`insert into profiles(id,wallet_balance,held_balance) values(gen_random_uuid(),0,0) returning id`)).id;
  const cafe = (await one(`insert into stations(id,name,name_ar,address,is_package_venue,cafe_enabled,
      charge_share_omr,commission_pct,beanz_fee_pct,menu_source)
    values(gen_random_uuid(),'Bean Cafe','Bean AR','Muscat',true,true,1.000,10,5,'beanz') returning id`)).id;
  await pool.query('insert into venue_staff(station_id,user_id) values($1,$2)', [cafe, barista]);
  const pkg = (await one(`insert into venue_packages(station_id,name,name_ar,partner_benefit,partner_benefit_ar,price,included_minutes,included_items)
    values($1,'Coffee + 60 min','AR','Coffee','AR',5.000,60,1) returning id, updated_at::text as v`, [cafe]));
  const options = JSON.stringify([
    { id: 'size', name: 'Size', name_ar: 'AR', required: true, max: 1, choices: [
      { id: 'm', name: 'Medium', name_ar: 'AR', price_delta: 0 }, { id: 'l', name: 'Large', name_ar: 'AR', price_delta: 0.3 }] },
    { id: 'extra', name: 'Extras', name_ar: 'AR', max: 2, choices: [
      { id: 'shot', name: 'Extra shot', name_ar: 'AR', price_delta: 0.2 }, { id: 'oat', name: 'Oat milk', name_ar: 'AR', price_delta: 0.25 }] },
  ]);
  const latte = (await one(`insert into cafe_menu_items(station_id,name,name_ar,price,options,package_upcharge)
    values($1,'Latte','AR',2.200,$2,0) returning id`, [cafe, options])).id;
  const v60 = (await one(`insert into cafe_menu_items(station_id,name,name_ar,price,package_upcharge)
    values($1,'V60','AR',3.000,0.500) returning id`, [cafe])).id;
  const cookie = (await one(`insert into cafe_menu_items(station_id,name,name_ar,price,package_upcharge)
    values($1,'Cookie','AR',1.000,null) returning id`, [cafe])).id;

  const order = (items, key, total, user = customer) => as(user,
    'select create_cafe_order($1,$2,$3,$4,$5,$6,$7) as result', [cafe, pkg.id, JSON.stringify(items), key, total, pkg.v, 'no sugar']);
  const pay = async (orderId, ref, amount) => {
    await pool.query(`insert into payment_sessions(user_id,session_id,amount,purpose,cafe_order_id) values($1,$2,$3,'cafe_order',$4)
      on conflict (session_id) do nothing`, [customer, ref, amount, orderId]);
    await pool.query('update cafe_orders set payment_reference=$2 where id=$1 and paid_reference is null', [orderId, ref]);
    return (await pool.query('select confirm_cafe_order_payment($1,$2) as result', [orderId, ref])).rows[0].result;
  };
  const basket = [
    { item_id: latte, quantity: 1, in_package: true, options: ['l', 'shot'] }, // 0 + 0.3 + 0.2
    { item_id: cookie, quantity: 2, in_package: false, options: [] },         // 2 × 1.000
  ];

  let first;
  await t.test('café order: server recomputes the total and is idempotent on the request key', async () => {
    await assert.rejects(order(basket, 'cafe-request-wrong-total', 7.0), /Prices changed/);
    const [a, b] = await Promise.all([order(basket, 'cafe-request-0000001', 7.5), order(basket, 'cafe-request-0000001', 7.5)]);
    assert.equal(a.id, b.id);
    assert.equal(Number(a.total), 7.5);
    assert.equal((await one('select count(*)::int n from cafe_orders')).n, 1);
    assert.equal((await one('select count(*)::int n from cafe_order_items where order_id=$1', [a.id])).n, 2);
    await assert.rejects(order(basket, 'cafe-request-0000001', 8), /another order/);
    first = a;
  });

  await t.test('café order: package and option rules are enforced', async () => {
    await assert.rejects(order([{ item_id: latte, quantity: 1, in_package: true, options: [] }], 'cafe-request-no-size', 5), /required options/);
    await assert.rejects(order([{ item_id: latte, quantity: 1, in_package: true, options: ['m', 'l'] }], 'cafe-request-two-sizes', 5.3), /required options/);
    await assert.rejects(order([{ item_id: latte, quantity: 1, in_package: true, options: ['nope'] }], 'cafe-request-bad-opt', 5), /Invalid item options/);
    await assert.rejects(order([{ item_id: cookie, quantity: 1, in_package: true, options: [] }], 'cafe-request-cookie-pkg', 5), /cannot be the package drink/);
    await assert.rejects(order([{ item_id: cookie, quantity: 1, options: [] }], 'cafe-request-no-drink', 6), /package drink/);
    const premium = await order([{ item_id: v60, quantity: 1, in_package: true, options: [] }], 'cafe-request-premium1', 5.5);
    assert.equal(Number(premium.total), 5.5);
    await pool.query('update cafe_menu_items set is_available=false where id=$1', [v60]);
    await assert.rejects(order([{ item_id: v60, quantity: 1, in_package: true, options: [] }], 'cafe-request-unavail1', 5.5), /no longer available/);
    await pool.query('update stations set orders_paused=true where id=$1', [cafe]);
    await assert.rejects(order(basket, 'cafe-request-paused01', 7.5), /not taking orders/);
    await pool.query('update stations set orders_paused=false where id=$1', [cafe]);
  });

  let paid;
  await t.test('café payment: confirmed once, issues one entitlement and a balanced ledger row', async () => {
    await assert.rejects(pool.query('select confirm_cafe_order_payment($1,$2)', [first.id, 'unknown-ref']), /does not belong/);
    const [a, b] = await Promise.all([pay(first.id, 'intent-001', 7.5), pay(first.id, 'intent-001', 7.5)]);
    assert.equal(a.order.entitlement_id, b.order.entitlement_id);
    assert.equal(a.duplicate_payment || b.duplicate_payment, false);
    assert.equal((await one(`select count(*)::int n from entitlements where purchase_key=$1`, ['cafe:' + first.id])).n, 1);
    const ent = await one('select * from entitlements where id=$1', [a.order.entitlement_id]);
    assert.equal(ent.partner_benefit, 'Latte');
    assert.equal(ent.minutes_total, 60);
    assert.equal(Number(ent.price_paid), 7.5);
    const l = await one('select * from cafe_ledger where order_id=$1', [first.id]);
    // 7.500 gross; 1.000 charging share; 10% and 5% of 6.500
    assert.deepEqual([l.gowatt_charge_share, l.gowatt_commission, l.beanz_fee, l.cafe_net].map(Number), [1, 0.65, 0.325, 5.525]);
    const second = await pay(first.id, 'intent-002', 7.5);
    assert.equal(second.duplicate_payment, true, 'a second charge must be flagged for refund');
    paid = a.order;
  });

  await t.test('café staff: only venue staff move orders, collect redeems the coffee', async () => {
    await assert.rejects(as(stranger, 'select cafe_order_action($1,$2) as result', [paid.id, 'accept']), /Not staff/);
    await assert.rejects(as(barista, 'select cafe_order_action($1,$2) as result', [paid.id, 'ready']), /cannot be marked ready/);
    const accepted = await as(barista, 'select cafe_order_action($1,$2) as result', [paid.id, 'accept']);
    assert.equal(accepted.status, 'accepted');
    assert.ok(accepted.ready_eta);
    await assert.rejects(as(customer, 'select cafe_order_action($1,$2) as result', [paid.id, 'cancel']), /already accepted/);
    await as(barista, 'select cafe_order_action($1,$2) as result', [paid.id, 'ready']);
    const done = await as(barista, 'select cafe_order_action($1,$2) as result', [paid.id, 'collect']);
    assert.equal(done.status, 'collected');
    assert.ok((await one('select benefit_redeemed_at from entitlements where id=$1', [paid.entitlement_id])).benefit_redeemed_at);
  });

  await t.test('café reject before accept: voids ledger, refunds entitlement, flags card refund', async () => {
    const o = await order(basket, 'cafe-request-reject01', 7.5);
    await pay(o.id, 'intent-reject-1', 7.5);
    const r = await as(barista, 'select cafe_order_action($1,$2,$3) as result', [o.id, 'reject', 'Out of milk']);
    assert.equal(r.status, 'rejected');
    assert.equal(r.refund_status, 'pending');
    assert.ok((await one('select voided_at from cafe_ledger where order_id=$1', [o.id])).voided_at);
    assert.equal((await one('select e.status from entitlements e join cafe_orders o on o.entitlement_id=e.id where o.id=$1', [o.id])).status, 'refunded');
    const rec = (await pool.query('select record_cafe_refund($1,true,$2) as result', [o.id, 'refund-1'])).rows[0].result;
    assert.equal(rec.refund_status, 'refunded');
  });

  await t.test('café cancel before payment arrives: late payment is flagged for refund', async () => {
    const o = await order(basket, 'cafe-request-latepay1', 7.5);
    await pool.query(`insert into payment_sessions(user_id,session_id,amount,purpose,cafe_order_id) values($1,'intent-late',7.5,'cafe_order',$2)`, [customer, o.id]);
    const c = await as(customer, 'select cafe_order_action($1,$2) as result', [o.id, 'cancel']);
    assert.equal(c.status, 'cancelled');
    const late = (await pool.query('select confirm_cafe_order_payment($1,$2) as result', [o.id, 'intent-late'])).rows[0].result;
    assert.equal(late.duplicate_payment, true);
    assert.equal(late.order.entitlement_id, null);
  });

  await t.test('café auto-reject: unanswered paid orders are rejected for refund', async () => {
    const o = await order(basket, 'cafe-request-stale001', 7.5);
    await pay(o.id, 'intent-stale', 7.5);
    await pool.query(`update cafe_orders set paid_at=now()-interval '10 minutes' where id=$1`, [o.id]);
    const ids = (await pool.query('select auto_reject_stale_cafe_orders(5) as id')).rows.map(r => r.id);
    assert.deepEqual(ids, [o.id]);
    assert.equal((await one('select status from cafe_orders where id=$1', [o.id])).status, 'rejected');
  });

  await t.test('café settlement: admin only, includes only final unvoided orders', async () => {
    await assert.rejects(as(barista, 'select create_cafe_settlement($1,now()) as result', [cafe]), /Admins only/);
    const s = await as(barista, `select create_cafe_settlement($1,now()+interval '1 minute') as result`, [cafe], true);
    assert.equal(s.order_count, 1);
    assert.equal(Number(s.cafe_net), 5.525);
    assert.equal(Number(s.beanz_fee), 0.325);
    await assert.rejects(as(barista, `select create_cafe_settlement($1,now()+interval '1 minute') as result`, [cafe], true), /Nothing to settle/);
  });

  await t.test('Beanz menu mapping: nested and flat payloads, bilingual names, invalid rows dropped', async () => {
    require('ts-node/register');
    const { extractItems } = require('../src/integrations/beanz.ts');
    const items = extractItems({ data: { categories: [{ name: { en: 'Coffee', ar: 'قهوة' }, items: [
      { id: 'b1', name: { en: 'Flat white', ar: 'فلات وايت' }, price: '2.300',
        modifier_groups: [{ id: 'g1', name: 'Milk', min: 1, max: 1, modifiers: [{ id: 'oat', name: 'Oat', price: 0.25 }] }] },
      { id: 'b2', name: 'No price' },
      { id: 'b1', name: 'Duplicate', price: 1 },
    ] }], items: [{ id: 'f1', name: 'Cookie', name_ar: 'كوكيز', category: 'Bakery', price: 1, available: false }] } });
    assert.equal(items.length, 2);
    assert.deepEqual([items[0].name, items[0].name_ar, items[0].category_ar, items[0].price], ['Flat white', 'فلات وايت', 'قهوة', 2.3]);
    assert.deepEqual(items[0].options[0], { id: 'g1', name: 'Milk', name_ar: 'Milk', required: true, max: 1,
      choices: [{ id: 'oat', name: 'Oat', name_ar: 'Oat', price_delta: 0.25 }] });
    assert.equal(items[1].available, false);
  });
};
