import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../../middleware/error';
import { env } from '../../config/env';
import { pool, query, callFn } from '../../db/pool';
import { unauthorized } from '../../lib/errors';
import * as tuya from '../../integrations/tuya';
import * as thawani from '../../integrations/thawani';
import { sendPush } from '../../integrations/push';
import { notify } from '../../integrations/notify';
import { runDispatch } from '../mobile/dispatch';

// Cron endpoints — called on a timer (server crontab / systemd timer) with the
// x-job-secret header. Not part of the public app API.
const router = Router();

function requireJobSecret(req: Request, _res: Response, next: NextFunction) {
  if ((req.headers['x-job-secret'] ?? '') !== env.JOB_SECRET) return next(unauthorized());
  next();
}
router.use(requireJobSecret);

// Every ~1 min: stop sessions whose booking window has ended, bill them, push.
//
// Overstay-aware: a session isn't force-finalized the instant its booking ends
// any more — it's left running through the grace period and up to
// overstay_max_minutes past that (so the customer has a real chance to come
// back and stop cleanly, and any overstay fee has time to reflect what
// actually happened). Only once that combined window is exceeded does this
// job step in. See sql/backend-overstay-and-refund.sql.
router.post('/auto-shutoff', asyncHandler(async (_req, res) => {
  const { rows: expired } = await query(`select * from public.expired_active_sessions`);
  const { rows: cfg } = await pool.query(
    `select key, value from public.app_config where key in ('overstay_grace_minutes','overstay_max_minutes')`,
  );
  const cfgMap = Object.fromEntries(cfg.map((r: any) => [r.key, Number(r.value)]));
  const graceMin = cfgMap.overstay_grace_minutes ?? 10;
  const maxMin   = cfgMap.overstay_max_minutes ?? 60;
  const cutoffMs = (graceMin + maxMin) * 60_000;

  const results: any[] = [];
  for (const row of expired as any[]) {
    // Still within grace + max-overstay — leave it running.
    if (Date.now() - new Date(row.booking_ends_at).getTime() < cutoffMs) continue;
    try {
      // Turn off the physical switch if it's on.
      if (row.tuya_device_id && row.switch_status && tuya.tuyaConfigured()) {
        await tuya.setSwitch(row.tuya_device_id, false).catch(() => {});
        await pool.query(`update public.charger_listings set switch_status=false where id=$1`, [row.listing_id]);
      }
      // Estimate kWh up to booking end (prefer synced meter reading) — unchanged;
      // the overstay FEE (not kWh) is what accounts for the extra time, computed
      // server-side inside _finalize_charging_session from the real end time below.
      const { rows: lr } = await pool.query(`select power_kw from public.charger_listings where id=$1`, [row.listing_id]);
      const power = Number(lr[0]?.power_kw ?? 22);
      const hours = Math.max(0, (new Date(row.booking_ends_at).getTime() - new Date(row.started_at).getTime()) / 3_600_000);
      const est = hours * power;
      const synced = Number(row.kwh_delivered ?? 0);
      const kwh = Math.min(synced > 0 ? synced : est, est * 1.25);

      // Finalize through the shared billing function (releases hold, caps at hold,
      // debits customer, pays host — atomic + idempotent). Passing null lets it
      // default to the real current time, so the overstay-minutes calculation
      // measures against when this actually ran, not the original booking end.
      const { rows: fin } = await pool.query(
        `select public._finalize_charging_session($1,$2,$3,$4,$5) as result`,
        [row.session_id, kwh, null, 'Charging session (auto-stop)', null],
      );
      const cost = Number(fin[0]?.result?.cost ?? 0);
      await notify({
        userIds: [row.user_id],
        category: 'charging',
        kind: 'charge_finished',
        title: 'Charging finished',
        body: `Your charging session ended. Charged ${cost.toFixed(3)} OMR.`,
        data: { session_id: row.session_id },
        dedupeKey: `charge_finished:${row.session_id}`,
      }).catch(() => {});
      results.push({ session_id: row.session_id, status: 'completed' });
    } catch (e: any) {
      results.push({ session_id: row.session_id, status: 'error', error: e.message });
    }
  }
  res.json({ processed: results.length, results });
}));

// Every ~30 s: re-offer mobile-charge jobs whose offer timed out, and give up
// on requests no van took (releasing the customer's hold). Requests are also
// dispatched immediately on creation — this tick only handles the timeouts.
router.post('/mobile-dispatch', asyncHandler(async (_req, res) => {
  res.json(await runDispatch());
}));

// Every ~10 min: release no-show bookings (frees the slot).
router.post('/no-show', asyncHandler(async (_req, res) => {
  const { rows } = await query(`select public.release_no_show_bookings() as count`);
  res.json({ released: rows[0]?.count ?? 0 });
}));

// Daily: disburse due investor payouts (no-op unless enabled + provider set).
router.post('/disburse', asyncHandler(async (_req, res) => {
  const { rows: batch } = await query(`select * from public.enqueue_auto_payouts()`);
  const results: any[] = [];
  for (const row of batch as any[]) {
    // No payout provider wired yet → mark failed (auto-refunds). Wire the real
    // provider call here when available, then settle with ok=true + ref.
    await pool.query(`select public.settle_auto_payout($1,$2,$3,$4)`,
      [row.id, false, null, `No payout provider implemented for '${row.provider}'`]);
    results.push({ id: row.id, status: 'failed' });
  }
  res.json({ processed: results.length, results });
}));

// Every ~1 min: time-based charging reminders.
//
//   charge_start_soon — booking begins within 10 min and hasn't been started
//   charge_end_soon   — active session's booked window ends within 5 min
//
// Both windows are deliberately WIDER than the cron interval. Selecting an exact
// "10 minutes from now" minute would silently drop reminders whenever a run is
// late, the server restarts, or a job overruns. Instead we re-select the whole
// window every minute and let the notifications.dedupe_key unique index absorb
// the repeats — so each booking is reminded exactly once even though it matches
// the query ~10 times. Correctness comes from the index, not from cron accuracy.
router.post('/reminders', asyncHandler(async (_req, res) => {
  const results: any[] = [];

  // ── Starting soon ────────────────────────────────────────────────────────
  // Excludes bookings the user already started charging on — reminding someone
  // to start something they're doing is noise.
  const { rows: starting } = await query(
    `select b.id, b.user_id, b.booked_at
       from public.bookings b
      where b.status = 'confirmed'
        and b.booked_at between now() and now() + interval '10 minutes'
        and not exists (
          select 1 from public.charging_sessions cs
           where cs.booking_id = b.id and cs.status = 'active'
        )
      limit 200`,
  );
  for (const b of starting as any[]) {
    const mins = Math.max(1, Math.round((new Date(b.booked_at).getTime() - Date.now()) / 60_000));
    try {
      const r = await notify({
        userIds: [b.user_id],
        category: 'booking',
        kind: 'charge_start_soon',
        title: 'Your charging slot starts soon',
        body: `You can start charging in about ${mins} minute${mins === 1 ? '' : 's'}.`,
        data: { booking_id: b.id, booked_at: b.booked_at },
        dedupeKey: `charge_start_soon:${b.id}`,
      });
      if (r.created) results.push({ booking_id: b.id, kind: 'charge_start_soon' });
    } catch (e: any) {
      results.push({ booking_id: b.id, kind: 'charge_start_soon', error: e.message });
    }
  }

  // ── Ending soon ──────────────────────────────────────────────────────────
  // Paired with the auto-shutoff job: this is the warning that it is about to
  // run, giving the driver a chance to stop cleanly or extend.
  const { rows: ending } = await query(
    `select cs.id as session_id, cs.user_id, b.booked_end
       from public.charging_sessions cs
       join public.bookings b on b.id = cs.booking_id
      where cs.status = 'active'
        and b.booked_end between now() and now() + interval '5 minutes'
      limit 200`,
  );
  for (const s of ending as any[]) {
    const mins = Math.max(1, Math.round((new Date(s.booked_end).getTime() - Date.now()) / 60_000));
    try {
      const r = await notify({
        userIds: [s.user_id],
        category: 'charging',
        kind: 'charge_end_soon',
        title: 'Charging ends soon',
        body: `You have about ${mins} minute${mins === 1 ? '' : 's'} left before your session stops automatically.`,
        data: { session_id: s.session_id, booked_end: s.booked_end },
        dedupeKey: `charge_end_soon:${s.session_id}`,
      });
      if (r.created) results.push({ session_id: s.session_id, kind: 'charge_end_soon' });
    } catch (e: any) {
      results.push({ session_id: s.session_id, kind: 'charge_end_soon', error: e.message });
    }
  }

  // ── Overstay started ─────────────────────────────────────────────────────
  // Fires once a session's booked window has actually passed. Deliberately a
  // wide "already past end" match (not a narrow minute), same reasoning as
  // above — the dedupe key guarantees exactly one push per session.
  const { rows: overstaying } = await query(
    `select cs.id as session_id, cs.user_id, b.booked_end
       from public.charging_sessions cs
       join public.bookings b on b.id = cs.booking_id
      where cs.status = 'active'
        and b.booked_end < now()
      limit 200`,
  );
  for (const s of overstaying as any[]) {
    try {
      const r = await notify({
        userIds: [s.user_id],
        category: 'charging',
        kind: 'overstay_started',
        title: 'Your booked time has ended',
        body: 'You can stay a short grace period, but overstay charges may apply after that.',
        data: { session_id: s.session_id, booked_end: s.booked_end },
        dedupeKey: `overstay_started:${s.session_id}`,
      });
      if (r.created) results.push({ session_id: s.session_id, kind: 'overstay_started' });
    } catch (e: any) {
      results.push({ session_id: s.session_id, kind: 'overstay_started', error: e.message });
    }
  }

  res.json({ sent: results.length, results });
}));

// Every ~5 min: reconcile top-ups the app never got to verify.
//
// /api/payments/verify only runs when the in-app browser makes it back to the
// app. If the customer kills the app, loses signal, or the deep link misfires,
// Thawani has taken their money but the wallet was never credited. This re-polls
// every still-pending session and settles it from the server side.
//
// Safety: crediting goes through credit_wallet_topup, which is idempotent on the
// session id, so racing with a late /verify call cannot double-credit.
router.post('/reconcile-payments', asyncHandler(async (_req, res) => {
  if (!thawani.thawaniConfigured()) return res.json({ skipped: 'thawani_not_configured' });

  // Skip the first 2 min so we don't fight the app's own verify call, and stop
  // chasing sessions after 24h — Thawani checkout sessions expire well before that.
  const { rows: pending } = await query(
    `select user_id, session_id, amount from public.payment_sessions
      where status = 'pending'
        and created_at < now() - interval '2 minutes'
        and created_at > now() - interval '24 hours'
      order by created_at
      limit 100`,
  );

  const results: any[] = [];
  for (const ps of pending as any[]) {
    try {
      const status = await thawani.getPaymentStatus(ps.session_id);
      if (status === 'paid') {
        await callFn(ps.user_id,
          'select public.credit_wallet_topup($1,$2,$3,$4) as balance',
          [ps.user_id, ps.amount, ps.session_id, 'thawani']);
        await notify({
          userIds: [ps.user_id],
          category: 'booking',
          kind: 'wallet_topped_up',
          title: 'Wallet topped up',
          body: `${Number(ps.amount).toFixed(3)} OMR has been added to your wallet.`,
          data: { session_id: ps.session_id, amount: ps.amount },
          dedupeKey: `wallet_topped_up:${ps.session_id}`,
        }).catch(() => {});
        results.push({ session_id: ps.session_id, status: 'credited' });
      } else if (status === 'cancelled' || status === 'expired') {
        await pool.query(`update public.payment_sessions set status='failed' where session_id=$1`, [ps.session_id]);
        results.push({ session_id: ps.session_id, status: 'failed' });
      } else {
        results.push({ session_id: ps.session_id, status: status ?? 'pending' });
      }
    } catch (e: any) {
      // Leave it pending — a later run retries it.
      results.push({ session_id: ps.session_id, status: 'error', error: e.message });
    }
  }
  res.json({ processed: results.length, results });
}));

export default router;
