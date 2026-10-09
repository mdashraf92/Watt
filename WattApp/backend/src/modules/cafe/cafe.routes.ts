import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { env } from '../../config/env';
import { callFn, query } from '../../db/pool';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors';
import * as svc from './cafe.service';

/**
 * Go Watt Café — order coffee ahead at a café with a Go Watt charger and get a
 * charging pass. Customer, staff (/staff/*) and admin (/admin/*) routes.
 * Model and money rules: sql/backend-cafe-orders.sql. Payment: cafe.service.ts.
 */
const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const money = z.number().finite().min(0).max(9999.999).multipleOf(0.001);
function paramId(value: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw badRequest('Invalid identifier');
  return parsed.data;
}

// A café is orderable only when its charger can actually honour the pass —
// the same readiness rule as package purchases (packages.routes.ts /purchase).
const READY_SQL = `exists(select 1 from connectors c join package_devices d on d.connector_id=c.id and d.enabled where c.station_id=s.id)
  and exists(select 1 from package_monitor where checked_at>now()-interval '90 seconds')`;
const orderingOpen = () => env.CAFE_ORDERS_ENABLED && env.PACKAGES_CHARGING_ENABLED;

// ─── Customer ───────────────────────────────────────────────────────────────

// Cafés for the Coffee map. Only Go Watt package venues with café ordering on.
router.get('/cafes', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select s.id, s.name, s.name_ar, s.address, s.address_ar, s.latitude, s.longitude, s.image_url, s.cafe_logo_url,
            s.operating_hours, s.orders_paused, s.prep_minutes, s.rating,
            (${READY_SQL}) as charger_ready,
            p.price as from_price, p.included_minutes, p.included_kwh
       from stations s
       left join lateral (select price, included_minutes, included_kwh from venue_packages
                           where station_id=s.id and is_active order by price limit 1) p on true
      where s.cafe_enabled and s.is_package_venue
      order by s.name`);
  const open = orderingOpen();
  res.json(rows.map(r => ({ ...r, can_order: open && r.charger_ready && !r.orders_paused && r.from_price !== null })));
}));

router.get('/cafes/:id', asyncHandler(async (req, res) => {
  const id = paramId(req.params.id);
  const { rows } = await query(
    `select s.id, s.name, s.name_ar, s.address, s.address_ar, s.latitude, s.longitude, s.image_url, s.cafe_logo_url,
            s.operating_hours, s.orders_paused, s.prep_minutes, (${READY_SQL}) as charger_ready
       from stations s where s.id=$1 and s.cafe_enabled and s.is_package_venue`, [id]);
  if (!rows[0]) throw notFound('Café not found');
  const [packages, menu] = await Promise.all([
    query(`select id, name, name_ar, description, description_ar, partner_benefit, partner_benefit_ar, price,
                  included_minutes, included_kwh, included_items, validity_hours, updated_at::text as offer_version
             from venue_packages where station_id=$1 and is_active order by sort_order, price`, [id]),
    query(`select id, category, category_ar, name, name_ar, description, description_ar, price, image_url, options, package_upcharge
             from cafe_menu_items where station_id=$1 and is_available and source_available
            order by category, sort_order, name`, [id]),
  ]);
  const cafe = rows[0];
  res.json({ ...cafe, can_order: orderingOpen() && cafe.charger_ready && !cafe.orders_paused,
             packages: packages.rows, menu: menu.rows });
}));

const orderBody = z.object({
  station_id: uuid,
  package_id: uuid,
  request_key: z.string().min(16).max(100),
  expected_total: money,
  offer_version: z.string().min(1).max(100),
  note: z.string().max(300).default(''),
  items: z.array(z.object({
    item_id: uuid,
    quantity: z.number().int().min(1).max(20),
    in_package: z.boolean(),
    options: z.array(z.string().min(1).max(100)).max(20).default([]),
  })).min(1).max(30),
});

// Create the order (idempotent on request_key) and start paying for it.
router.post('/orders', validateBody(orderBody), asyncHandler(async (req, res) => {
  if (!orderingOpen()) throw new AppError(503, 'cafe_unavailable', 'Café ordering is not open yet');
  const b = req.body;
  const { rows: ready } = await query(`select 1 from stations s where s.id=$1 and ${READY_SQL}`, [b.station_id]);
  if (!ready.length) throw new AppError(503, 'cafe_unavailable', 'This café’s charger is not ready for orders');
  const { result: order } = await callFn<{ result: any }>(req.user!.id,
    'select create_cafe_order($1,$2,$3,$4,$5,$6,$7) as result',
    [b.station_id, b.package_id, JSON.stringify(b.items), b.request_key, b.expected_total, b.offer_version, b.note]);
  res.status(201).json(await svc.startPayment(req.user!.id, order));
}));

// Retry payment for an unpaid order (declined card, abandoned checkout).
router.post('/orders/:id/pay', asyncHandler(async (req, res) => {
  if (!orderingOpen()) throw new AppError(503, 'cafe_unavailable', 'Café ordering is not open yet');
  const order = await svc.getOrderFor(req.user!.id, paramId(req.params.id));
  res.json(await svc.startPayment(req.user!.id, order));
}));

// After the bank's OTP page or hosted checkout.
router.post('/orders/:id/verify', asyncHandler(async (req, res) => {
  const order = await svc.getOrderFor(req.user!.id, paramId(req.params.id));
  res.json(await svc.checkPayment(order.id));
}));

router.post('/orders/:id/cancel', asyncHandler(async (req, res) => {
  const id = paramId(req.params.id);
  await svc.getOrderFor(req.user!.id, id);
  res.json(await svc.act(req.user!.id, id, 'cancel', 'Cancelled by customer'));
}));

const ORDER_VIEW = `select o.id, o.order_no % 1000 as number, o.status, o.station_id, o.package_id, o.package_price, o.items_total,
         o.total, o.note, o.refund_status, o.reject_reason, o.ready_eta, o.created_at, o.paid_at, o.accepted_at,
         o.ready_at, o.collected_at, o.entitlement_id,
         s.name as station_name, s.name_ar as station_name_ar, s.address,
         e.redeem_code, e.minutes_total, e.minutes_used, e.kwh_total, e.kwh_used, e.expires_at,
         case when e.status='active' and e.expires_at<=now() then 'expired' else e.status end as pass_status,
         p.name as package_name, p.name_ar as package_name_ar
    from cafe_orders o
    join stations s on s.id=o.station_id
    join venue_packages p on p.id=o.package_id
    left join entitlements e on e.id=o.entitlement_id`;

router.get('/orders', asyncHandler(async (req, res) => {
  const { rows } = await query(`${ORDER_VIEW} where o.user_id=$1 and (o.status not in ('pending_payment','payment_failed') or o.created_at>now()-interval '1 hour')
    order by o.created_at desc limit 50`, [req.user!.id]);
  res.json(rows);
}));

router.get('/orders/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`${ORDER_VIEW} where o.id=$1 and o.user_id=$2`, [paramId(req.params.id), req.user!.id]);
  if (!rows[0]) throw notFound('Order not found');
  const { rows: items } = await query('select name, name_ar, options, unit_price, quantity, in_package from cafe_order_items where order_id=$1 order by in_package desc, name', [rows[0].id]);
  res.json({ ...rows[0], items });
}));

// ─── Café staff ─────────────────────────────────────────────────────────────

async function assertStaff(userId: string, stationId: string) {
  const { rows } = await query('select 1 from venue_staff where station_id=$1 and user_id=$2', [stationId, userId]);
  if (!rows.length) throw forbidden('Not staff at this café');
}

router.get('/staff/venues', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select s.id, s.name, s.name_ar, s.orders_paused, s.prep_minutes from stations s
       join venue_staff v on v.station_id=s.id where v.user_id=$1 and s.cafe_enabled order by s.name`, [req.user!.id]);
  res.json(rows);
}));

// The order board. Opening it marks new orders as seen (stops the SMS fallback).
router.get('/staff/venues/:id/orders', asyncHandler(async (req, res) => {
  const stationId = paramId(req.params.id);
  await assertStaff(req.user!.id, stationId);
  await query(`update cafe_orders set staff_seen_at=now() where station_id=$1 and status='paid' and staff_seen_at is null`, [stationId]);
  const { rows: orders } = await query(
    `select o.id, o.order_no % 1000 as number, o.status, o.total, o.note, o.created_at, o.paid_at, o.ready_eta,
            pr.full_name as customer_name,
            coalesce((select json_agg(json_build_object('name',i.name,'name_ar',i.name_ar,'options',i.options,'quantity',i.quantity,'in_package',i.in_package)
                        order by i.in_package desc, i.name) from cafe_order_items i where i.order_id=o.id), '[]') as items
       from cafe_orders o join profiles pr on pr.id=o.user_id
      where o.station_id=$1 and o.status in ('paid','accepted','ready')
      order by o.paid_at`, [stationId]);
  const { rows: today } = await query(
    `select count(*)::int as collected, coalesce(sum(l.cafe_net),0) as cafe_net
       from cafe_orders o join cafe_ledger l on l.order_id=o.id and l.voided_at is null
      where o.station_id=$1 and o.status='collected' and o.collected_at >= date_trunc('day', now())`, [stationId]);
  res.json({ orders, today: today[0] });
}));

router.post('/staff/orders/:id/:action',
  validateBody(z.object({ reason: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const action = z.enum(['accept', 'ready', 'collect', 'reject']).safeParse(req.params.action);
    if (!action.success) throw badRequest('Unknown action');
    res.json(await svc.act(req.user!.id, paramId(req.params.id), action.data, req.body.reason));
  }));

// Scan or type the customer's code at the counter.
router.post('/staff/lookup', validateBody(z.object({ code: z.string().trim().min(1).max(100) })), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select o.id, o.order_no % 1000 as number, o.status, o.station_id from cafe_orders o
       join entitlements e on e.id=o.entitlement_id
       join venue_staff v on v.station_id=o.station_id and v.user_id=$2
      where e.redeem_code=$1`, [req.body.code.toUpperCase(), req.user!.id]);
  if (!rows[0]) throw notFound('No order with this code at your café');
  res.json(rows[0]);
}));

router.post('/staff/venues/:id/pause', validateBody(z.object({ paused: z.boolean() })), asyncHandler(async (req, res) => {
  const stationId = paramId(req.params.id);
  await assertStaff(req.user!.id, stationId);
  const { rows } = await query('update stations set orders_paused=$2 where id=$1 returning id, orders_paused', [stationId, req.body.paused]);
  res.json(rows[0]);
}));

// ─── Admin ──────────────────────────────────────────────────────────────────
const admin = Router();
admin.use(requireAdmin);

admin.get('/cafes', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select s.id, s.name, s.name_ar, s.is_package_venue, s.cafe_enabled, s.cafe_logo_url, s.image_url, s.orders_paused,
            s.prep_minutes, s.menu_source, s.beanz_store_id, s.beanz_synced_at, s.beanz_sync_error,
            s.charge_share_omr, s.commission_pct, s.beanz_fee_pct,
            (select count(*)::int from cafe_menu_items m where m.station_id=s.id) as menu_count,
            (select count(*)::int from cafe_orders o where o.station_id=s.id and o.refund_status='failed') as refunds_failed
       from stations s where s.is_package_venue order by s.name`);
  res.json(rows);
}));

admin.put('/cafes/:id', validateBody(z.object({
  cafe_enabled: z.boolean(),
  cafe_logo_url: z.string().url().max(1000).nullable(),
  image_url: z.string().url().max(1000).nullable(),
  prep_minutes: z.number().int().min(1).max(120),
  menu_source: z.enum(['manual', 'beanz']),
  beanz_store_id: z.string().trim().max(100).nullable(),
  charge_share_omr: money,
  commission_pct: z.number().min(0).max(100),
  beanz_fee_pct: z.number().min(0).max(100),
})), asyncHandler(async (req, res) => {
  const b = req.body;
  if (b.commission_pct + b.beanz_fee_pct > 100) throw badRequest('Commission and Beanz fee cannot exceed 100%');
  if (b.menu_source === 'beanz' && !b.beanz_store_id) throw badRequest('Enter the Beanz store ID');
  const { rows } = await query(
    `update stations set cafe_enabled=$2, cafe_logo_url=$3, image_url=$4, prep_minutes=$5, menu_source=$6, beanz_store_id=$7,
            charge_share_omr=$8, commission_pct=$9, beanz_fee_pct=$10
      where id=$1 and is_package_venue returning id`,
    [paramId(req.params.id), b.cafe_enabled, b.cafe_logo_url, b.image_url, b.prep_minutes, b.menu_source,
     b.beanz_store_id || null, b.charge_share_omr, b.commission_pct, b.beanz_fee_pct]);
  if (!rows[0]) throw notFound('Package venue not found — enable package mode first');
  res.json({ ok: true });
}));

const choice = z.object({ id: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(100),
  name_ar: z.string().trim().min(1).max(100), price_delta: money });
const optionGroups = z.array(z.object({
  id: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(100), name_ar: z.string().trim().min(1).max(100),
  required: z.boolean().default(false), max: z.number().int().min(1).max(10).default(1),
  choices: z.array(choice).min(1).max(30),
})).max(10).refine(groups => {
  const ids = groups.flatMap(g => g.choices.map(c => c.id));
  return new Set(ids).size === ids.length;
}, 'Option choice IDs must be unique within an item');
const menuItem = z.object({
  category: z.string().trim().max(100).default(''), category_ar: z.string().trim().max(100).default(''),
  name: z.string().trim().min(1).max(150), name_ar: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).default(''), description_ar: z.string().trim().max(1000).default(''),
  price: money, image_url: z.string().url().max(1000).nullable().default(null),
  options: optionGroups.default([]),
  package_upcharge: money.nullable().default(null),
  is_available: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

admin.get('/cafes/:id/menu', asyncHandler(async (req, res) => {
  const { rows } = await query('select * from cafe_menu_items where station_id=$1 order by category, sort_order, name', [paramId(req.params.id)]);
  res.json(rows);
}));

admin.post('/cafes/:id/menu', validateBody(menuItem), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `insert into cafe_menu_items (station_id, category, category_ar, name, name_ar, description, description_ar, price,
        image_url, options, package_upcharge, is_available, sort_order, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual') returning *`,
    [paramId(req.params.id), b.category, b.category_ar, b.name, b.name_ar, b.description, b.description_ar, b.price,
     b.image_url, JSON.stringify(b.options), b.package_upcharge, b.is_available, b.sort_order]);
  res.status(201).json(rows[0]);
}));

// Beanz items: only the Go Watt-owned fields are editable; the rest re-syncs.
admin.patch('/menu/:itemId', validateBody(menuItem.partial()), asyncHandler(async (req, res) => {
  const id = paramId(req.params.itemId);
  const { rows: cur } = await query('select source from cafe_menu_items where id=$1', [id]);
  if (!cur[0]) throw notFound('Menu item not found');
  const local = ['package_upcharge', 'is_available', 'sort_order'];
  const fields = Object.keys(req.body).filter(k => req.body[k] !== undefined && (cur[0].source !== 'beanz' || local.includes(k)));
  if (!fields.length) throw badRequest(cur[0].source === 'beanz' ? 'Beanz items: edit availability, package upcharge or order only' : 'Nothing to update');
  // Keys come from the Zod schema above, so they cannot be attacker-chosen.
  const sets = fields.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const { rows } = await query(`update cafe_menu_items set ${sets}, updated_at=now() where id=$1 returning *`,
    [id, ...fields.map(k => k === 'options' ? JSON.stringify(req.body[k]) : req.body[k])]);
  res.json(rows[0]);
}));

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

// CSV columns (header row required, any order):
//   category, category_ar, name, name_ar, price, package_upcharge, description, description_ar
// package_upcharge: blank = cannot be the package drink, 0 = included, 0.500 = extra.
admin.post('/cafes/:id/menu/import', validateBody(z.object({ csv: z.string().min(1).max(500_000) })), asyncHandler(async (req, res) => {
  const stationId = paramId(req.params.id);
  const [header, ...lines] = parseCsv(req.body.csv.replace(/^﻿/, ''));
  const cols = (header ?? []).map(h => h.trim().toLowerCase());
  if (!cols.includes('name') || !cols.includes('name_ar') || !cols.includes('price')) {
    throw badRequest('The first row must name the columns: name, name_ar, price (plus optional category, category_ar, package_upcharge, description, description_ar)');
  }
  if (lines.length > 500) throw badRequest('Import at most 500 items at a time');
  const results: { row: number; status: 'created' | 'failed'; message?: string }[] = [];
  for (let n = 0; n < lines.length; n++) {
    const get = (k: string) => (lines[n][cols.indexOf(k)] ?? '').trim();
    const upcharge = get('package_upcharge');
    const parsed = menuItem.safeParse({
      category: get('category'), category_ar: get('category_ar'), name: get('name'), name_ar: get('name_ar'),
      description: get('description'), description_ar: get('description_ar'),
      price: Number(get('price')), package_upcharge: upcharge === '' ? null : Number(upcharge), sort_order: n,
    });
    if (!parsed.success) { results.push({ row: n + 2, status: 'failed', message: parsed.error.issues[0]?.message }); continue; }
    const b = parsed.data;
    await query(
      `insert into cafe_menu_items (station_id, category, category_ar, name, name_ar, description, description_ar, price,
          package_upcharge, sort_order, source) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'csv')`,
      [stationId, b.category, b.category_ar, b.name, b.name_ar, b.description, b.description_ar, b.price, b.package_upcharge, b.sort_order]);
    results.push({ row: n + 2, status: 'created' });
  }
  res.json({ created: results.filter(r => r.status === 'created').length, results });
}));

admin.post('/cafes/:id/sync-beanz', asyncHandler(async (req, res) => {
  res.json(await svc.syncBeanzMenu(paramId(req.params.id)));
}));

admin.get('/cafes/:id/settlement', asyncHandler(async (req, res) => {
  const id = paramId(req.params.id);
  const [open, settlements, refunds] = await Promise.all([
    query(`select count(*)::int as orders, coalesce(sum(gross),0) as gross, coalesce(sum(gowatt_charge_share),0) as charge_share,
                  coalesce(sum(gowatt_commission),0) as commission, coalesce(sum(beanz_fee),0) as beanz_fee, coalesce(sum(cafe_net),0) as cafe_net
             from cafe_ledger where station_id=$1 and settlement_id is null and voided_at is null`, [id]),
    query('select * from cafe_settlements where station_id=$1 order by created_at desc limit 50', [id]),
    query(`select id, order_no % 1000 as number, total, refund_status, reject_reason, closed_at from cafe_orders
            where station_id=$1 and refund_status in ('failed','pending') order by closed_at desc`, [id]),
  ]);
  res.json({ unsettled: open.rows[0], settlements: settlements.rows, refunds: refunds.rows });
}));

admin.post('/cafes/:id/settlements', asyncHandler(async (req, res) => {
  const { result } = await callFn<{ result: any }>(req.user!.id, 'select create_cafe_settlement($1, now()) as result', [paramId(req.params.id)]);
  res.status(201).json(result);
}));

admin.post('/settlements/:id/paid', validateBody(z.object({ bank_reference: z.string().trim().min(1).max(200) })), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `update cafe_settlements set status='paid', paid_at=now(), bank_reference=$2 where id=$1 and status='open' returning *`,
    [paramId(req.params.id), req.body.bank_reference]);
  if (!rows[0]) throw notFound('Open settlement not found');
  res.json(rows[0]);
}));

// A refund the gateway refused: retry, or mark it handled in the Thawani dashboard.
admin.post('/orders/:id/refund', validateBody(z.object({ manual_reference: z.string().trim().max(200).optional() })), asyncHandler(async (req, res) => {
  const id = paramId(req.params.id);
  if (req.body.manual_reference) {
    const { rows } = await query('select record_cafe_refund($1,true,$2) as result', [id, `manual:${req.body.manual_reference}`]);
    return res.json(rows[0].result);
  }
  res.json(await svc.refundOrder(id));
}));

router.use('/admin', admin);

export default router;
