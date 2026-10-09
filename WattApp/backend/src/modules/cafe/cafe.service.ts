import { pool, query, callFn } from '../../db/pool';
import { AppError } from '../../lib/errors';
import * as thawani from '../../integrations/thawani';
import * as beanz from '../../integrations/beanz';
import { sendSms } from '../../integrations/sms';
import { notify } from '../../integrations/notify';
import { emitToUser } from '../../realtime/socket';
import { ensureCustomer } from '../payments/customer';

/**
 * Café orders — payment orchestration shared by the routes and the jobs.
 *
 * 🔴 MONEY-CRITICAL. Totals, entitlements, the ledger split and refund state
 * all live in SQL (sql/backend-cafe-orders.sql). This file only talks to the
 * gateway and reports what it said. Never compute an order total here.
 *
 * Payment references are stored in payment_sessions with cafe_order_id set:
 *   purpose 'cafe_card'     — a Thawani payment intent on a saved card
 *   purpose 'cafe_checkout' — a Thawani hosted checkout session (no saved card)
 * Wallet top-up paths explicitly ignore rows with cafe_order_id.
 */

export type PaymentStep =
  | { status: 'paid'; order: any }
  | { status: 'action_required'; order: any; redirect_url: string }
  | { status: 'pending'; order: any }
  | { status: 'failed'; order: any; message?: string };

const ACTIVE_STAFF_STATES = ['paid', 'accepted', 'ready'];

export async function getOrderFor(userId: string, orderId: string) {
  const { rows } = await query('select * from cafe_orders where id=$1 and user_id=$2', [orderId, userId]);
  if (!rows[0]) throw new AppError(404, 'not_found', 'Order not found');
  return rows[0];
}

/** Start (or restart) payment for an unpaid order. */
export async function startPayment(userId: string, order: any): Promise<PaymentStep> {
  if (order.status !== 'pending_payment' && order.status !== 'payment_failed') {
    return order.paid_reference ? { status: 'paid', order } : { status: 'failed', order, message: 'Order is closed' };
  }
  if (!thawani.thawaniConfigured()) throw new AppError(503, 'not_configured', 'Payments not configured');

  // A previous attempt may still be waiting on the bank's OTP page; check it
  // before charging the card a second time.
  const pending = await checkPayment(order.id);
  if (pending.status === 'paid') return pending;

  const amount = Number(order.total);
  const { rows: cards } = await query(
    `select card_token from payment_cards where user_id=$1 order by is_default desc, created_at limit 1`, [userId]);

  if (cards[0]) {
    let intent: thawani.IntentResult;
    try {
      intent = await thawani.chargeSavedCard(userId, cards[0].card_token, amount);
    } catch (e: any) {
      return { status: 'failed', order, message: e?.message ?? 'Card declined' };
    }
    await recordAttempt(userId, order.id, intent.intentId, amount, 'cafe_card');
    if (intent.status === 'succeeded') return settle(order.id, intent.intentId);
    if (intent.actionUrl) return { status: 'action_required', order, redirect_url: intent.actionUrl };
    return { status: 'pending', order };
  }

  // No saved card: hosted checkout, and save the card for one-tap next time.
  const customerId = await ensureCustomer(userId);
  const session = await thawani.createCheckout(userId, amount, {
    customerId, saveCard: true, label: `Go Watt Café #${Number(order.order_no) % 1000}`,
  });
  await recordAttempt(userId, order.id, session.session_id, amount, 'cafe_checkout');
  return { status: 'action_required', order, redirect_url: session.pay_url };
}

async function recordAttempt(userId: string, orderId: string, reference: string, amount: number, purpose: string) {
  await pool.query(
    `insert into payment_sessions (user_id, session_id, amount, status, purpose, cafe_order_id)
     values ($1,$2,$3,'pending',$4,$5) on conflict (session_id) do nothing`,
    [userId, reference, amount, purpose, orderId]);
  await pool.query(
    `update cafe_orders set payment_reference=$2, status='pending_payment'
      where id=$1 and status in ('pending_payment','payment_failed')`, [orderId, reference]);
}

/** Ask the gateway about the order's latest attempt and settle accordingly. */
export async function checkPayment(orderId: string): Promise<PaymentStep> {
  const { rows } = await query(
    `select o.*, ps.purpose as attempt_purpose, ps.status as attempt_status
       from cafe_orders o
       left join payment_sessions ps on ps.session_id = o.payment_reference and ps.cafe_order_id = o.id
      where o.id = $1`, [orderId]);
  const order = rows[0];
  if (!order) throw new AppError(404, 'not_found', 'Order not found');
  if (order.paid_reference) return { status: 'paid', order };
  if (!order.payment_reference || order.attempt_status !== 'pending') return { status: 'pending', order };

  const ref = order.payment_reference as string;
  let state: 'paid' | 'failed' | 'pending';
  if (order.attempt_purpose === 'cafe_card') {
    const intent = await thawani.getIntent(ref);
    state = intent.status === 'succeeded' ? 'paid'
      : intent.status === 'cancelled' || intent.status === 'requires_payment_method' ? 'failed' : 'pending';
  } else {
    const s = await thawani.getPaymentStatus(ref);
    state = s === 'paid' ? 'paid' : s === 'cancelled' || s === 'expired' ? 'failed' : 'pending';
  }
  if (state === 'paid') return settle(orderId, ref);
  if (state === 'failed') {
    const { rows: failed } = await query('select fail_cafe_order_payment($1,$2) as result', [orderId, ref]);
    return { status: 'failed', order: failed[0].result };
  }
  return { status: 'pending', order };
}

async function settle(orderId: string, reference: string): Promise<PaymentStep> {
  const { rows } = await query('select confirm_cafe_order_payment($1,$2) as result', [orderId, reference]);
  const { order, duplicate_payment } = rows[0].result;
  if (duplicate_payment) {
    // Paid twice, or paid after being cancelled — return that charge.
    const purpose = (await query('select purpose from payment_sessions where session_id=$1', [reference])).rows[0]?.purpose;
    const r = await thawani.refundPayment(reference, purpose === 'cafe_card' ? 'intent' : 'session', 'Duplicate café payment');
    if (!r.ok) console.error(`[cafe] duplicate payment ${reference} on order ${orderId} needs a manual refund: ${r.error}`);
    return order.paid_reference ? { status: 'paid', order } : { status: 'failed', order, message: 'Order was cancelled; payment refunded' };
  }
  await announcePaid(order).catch(() => {});
  return { status: 'paid', order };
}

// ─── Notifications ──────────────────────────────────────────────────────────

async function staffOf(stationId: string): Promise<{ id: string; phone: string | null }[]> {
  const { rows } = await query(
    `select p.id, p.phone from venue_staff v join profiles p on p.id = v.user_id where v.station_id = $1`, [stationId]);
  return rows;
}

async function announcePaid(order: any) {
  const staff = await staffOf(order.station_id);
  const no = Number(order.order_no) % 1000;
  for (const s of staff) emitToUser(s.id, 'cafe_order', { id: order.id, status: order.status, station_id: order.station_id });
  await notify({
    userIds: staff.map(s => s.id), category: 'booking', kind: 'cafe_order_new',
    title: `New Go Watt order #${no}`, body: 'Tap to accept it.',
    data: { cafe_order_id: order.id, screen: 'CafeStaffOrders' },
  }).catch(() => {});
}

const CUSTOMER_MESSAGES: Record<string, [string, string]> = {
  accepted:  ['Your order is being prepared', 'The café accepted your order.'],
  ready:     ['Your order is ready', 'Show your Go Watt code at the counter.'],
  rejected:  ['Order not accepted', 'The café could not take your order. Your card will be refunded.'],
  cancelled: ['Order cancelled', 'Your order was cancelled. Any payment will be refunded.'],
};

export async function announceStatus(order: any) {
  emitToUser(order.user_id, 'cafe_order', { id: order.id, status: order.status });
  for (const s of await staffOf(order.station_id)) emitToUser(s.id, 'cafe_order', { id: order.id, status: order.status, station_id: order.station_id });
  const msg = CUSTOMER_MESSAGES[order.status];
  if (msg) {
    await notify({
      userIds: [order.user_id], category: 'booking', kind: `cafe_order_${order.status}`,
      title: msg[0], body: msg[1], data: { cafe_order_id: order.id, screen: 'CafeOrder', params: { orderId: order.id } },
      dedupeKey: `cafe_order_${order.status}:${order.id}`,
    }).catch(() => {});
  }
}

// ─── Refunds ────────────────────────────────────────────────────────────────

/** Refund a rejected/cancelled order whose refund_status is pending (or failed, on retry). */
export async function refundOrder(orderId: string) {
  const { rows } = await query(
    `select o.id, o.paid_reference, o.refund_status, ps.purpose from cafe_orders o
       left join payment_sessions ps on ps.session_id = o.paid_reference
      where o.id = $1`, [orderId]);
  const o = rows[0];
  if (!o || !o.paid_reference || !['pending', 'failed'].includes(o.refund_status)) return o;
  const r = await thawani.refundPayment(o.paid_reference, o.purpose === 'cafe_card' ? 'intent' : 'session', 'Café order not fulfilled');
  const { rows: rec } = await query('select record_cafe_refund($1,$2,$3) as result', [orderId, r.ok, r.refundId]);
  if (!r.ok) console.error(`[cafe] refund failed for order ${orderId}: ${r.error}`);
  return rec[0].result;
}

/** Staff or customer action, then side effects (refund, notifications). */
export async function act(userId: string, orderId: string, action: string, reason?: string) {
  const { result } = await callFn<{ result: any }>(userId, 'select cafe_order_action($1,$2,$3) as result', [orderId, action, reason ?? null]);
  if (result.refund_status === 'pending') await refundOrder(orderId).catch(() => {});
  await announceStatus(result).catch(() => {});
  return result;
}

// ─── Beanz menu sync ────────────────────────────────────────────────────────

/**
 * Upsert a Beanz café's menu. Touches only source-owned columns, so admin
 * decisions (is_available, package_upcharge, sort_order) survive. Items no
 * longer on Beanz become source_available=false — never deleted.
 */
export async function syncBeanzMenu(stationId: string) {
  const { rows } = await query(`select beanz_store_id from stations where id=$1 and menu_source='beanz'`, [stationId]);
  const storeId = rows[0]?.beanz_store_id;
  if (!storeId) throw new AppError(400, 'bad_request', 'This café is not linked to a Beanz store');
  let items: beanz.NormalizedMenuItem[];
  try { items = await beanz.fetchMenu(storeId); }
  catch (e: any) {
    await query('update stations set beanz_sync_error=$2 where id=$1', [stationId, String(e?.message ?? e).slice(0, 300)]);
    throw new AppError(502, 'beanz_error', e?.message ?? 'Beanz sync failed');
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const i of items) {
      await client.query(
        `insert into cafe_menu_items (station_id, external_id, source, category, category_ar, name, name_ar,
            description, description_ar, price, image_url, options, source_available, synced_at)
         values ($1,$2,'beanz',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
         on conflict (station_id, external_id) where external_id is not null do update set
           category=excluded.category, category_ar=excluded.category_ar, name=excluded.name, name_ar=excluded.name_ar,
           description=excluded.description, description_ar=excluded.description_ar, price=excluded.price,
           image_url=excluded.image_url, options=excluded.options, source_available=excluded.source_available,
           synced_at=now(), updated_at=now()`,
        [stationId, i.external_id, i.category, i.category_ar, i.name, i.name_ar, i.description, i.description_ar,
         i.price, i.image_url, JSON.stringify(i.options), i.available]);
    }
    await client.query(
      `update cafe_menu_items set source_available=false, updated_at=now()
        where station_id=$1 and source='beanz' and not (external_id = any($2::text[]))`,
      [stationId, items.map(i => i.external_id)]);
    await client.query('update stations set beanz_synced_at=now(), beanz_sync_error=null where id=$1', [stationId]);
    await client.query('commit');
  } catch (e) { await client.query('rollback'); throw e; }
  finally { client.release(); }
  return { items: items.length };
}

// ─── Background sweep (jobs: every ~1 min) ──────────────────────────────────

export async function sweep(opts: { acceptMinutes?: number; smsAfterMinutes?: number } = {}) {
  const acceptMinutes = opts.acceptMinutes ?? 5;
  const smsAfter = opts.smsAfterMinutes ?? 2;
  const out = { settled: 0, rejected: 0, refunds: 0, sms: 0, errors: [] as string[] };

  // 1) Payments the app never came back to verify.
  if (thawani.thawaniConfigured()) {
    const { rows } = await query(
      `select id from cafe_orders where status='pending_payment' and payment_reference is not null
         and created_at < now() - interval '1 minute' and created_at > now() - interval '24 hours' limit 100`);
    for (const r of rows) {
      try { if ((await checkPayment(r.id)).status === 'paid') out.settled++; }
      catch (e: any) { out.errors.push(`${r.id}: ${e.message}`); }
    }
  }

  // 2) Paid orders the café ignored: reject so the customer is not left waiting.
  const { rows: stale } = await query('select auto_reject_stale_cafe_orders($1) as id', [acceptMinutes]);
  for (const r of stale) {
    out.rejected++;
    const { rows: o } = await query('select * from cafe_orders where id=$1', [r.id]);
    await announceStatus(o[0]).catch(() => {});
  }

  // 3) Refunds still pending (fresh rejections, or a crash between steps).
  const { rows: refunds } = await query(
    `select id from cafe_orders where refund_status='pending' and paid_reference is not null limit 50`);
  for (const r of refunds) {
    try { if ((await refundOrder(r.id))?.refund_status === 'refunded') out.refunds++; }
    catch (e: any) { out.errors.push(`${r.id}: ${e.message}`); }
  }

  // 4) Nobody has looked at a paid order: text the café's staff once.
  const { rows: unseen } = await query(
    `update cafe_orders set sms_alerted_at=now()
      where status='paid' and staff_seen_at is null and sms_alerted_at is null
        and paid_at < now() - make_interval(mins => $1::int)
      returning id, station_id, order_no`, [smsAfter]);
  for (const o of unseen) {
    for (const s of await staffOf(o.station_id)) {
      if (!s.phone) continue;
      await sendSms(s.phone, `Go Watt: new order #${Number(o.order_no) % 1000} is waiting. Open the Go Watt app to accept it.`)
        .then(() => { out.sms++; }).catch(() => {});
    }
  }
  return out;
}

export async function syncAllBeanzMenus() {
  if (!beanz.beanzConfigured()) return { skipped: 'beanz_not_configured' };
  const { rows } = await query(`select id from stations where cafe_enabled and menu_source='beanz' and beanz_store_id is not null`);
  const results: any[] = [];
  for (const r of rows) {
    try { results.push({ station_id: r.id, ...(await syncBeanzMenu(r.id)) }); }
    catch (e: any) { results.push({ station_id: r.id, error: e.message }); }
  }
  return { results };
}

export { ACTIVE_STAFF_STATES };
