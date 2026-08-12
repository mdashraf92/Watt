import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { pool, callFn } from '../../db/pool';
import { AppError } from '../../lib/errors';
import * as thawani from '../../integrations/thawani';

const router = Router();
router.use(requireAuth);

/** The user's Thawani customer id, creating it on first use. */
async function ensureCustomer(userId: string): Promise<string> {
  const { rows } = await pool.query(
    `select thawani_customer_id from public.payment_customers where user_id = $1`, [userId],
  );
  if (rows[0]?.thawani_customer_id) return rows[0].thawani_customer_id as string;

  const customerId = await thawani.createCustomer(userId);
  await pool.query(
    `insert into public.payment_customers (user_id, thawani_customer_id) values ($1,$2)
     on conflict (user_id) do update set thawani_customer_id = excluded.thawani_customer_id`,
    [userId, customerId],
  );
  return customerId;
}

/** Pull the card list from Thawani and mirror it locally (Thawani is the truth). */
async function syncCards(userId: string, customerId: string) {
  const cards = await thawani.listCards(customerId);
  const tokens = cards.map(c => c.token);
  await pool.query(
    `delete from public.payment_cards where user_id = $1 and not (card_token = any($2::text[]))`,
    [userId, tokens],
  );
  for (const c of cards) {
    await pool.query(
      `insert into public.payment_cards (user_id, card_token, brand, last4, expiry)
       values ($1,$2,$3,$4,$5)
       on conflict (card_token) do update set brand = excluded.brand, last4 = excluded.last4, expiry = excluded.expiry`,
      [userId, c.token, c.brand, c.last4, c.expiry],
    );
  }
  // Always keep exactly one default while the user has any card at all.
  await pool.query(
    `update public.payment_cards set is_default = true
      where id = (select id from public.payment_cards where user_id = $1 order by created_at limit 1)
        and not exists (select 1 from public.payment_cards where user_id = $1 and is_default)`,
    [userId],
  );
  const { rows } = await pool.query(
    `select card_token, brand, last4, expiry, is_default from public.payment_cards
      where user_id = $1 order by created_at`, [userId],
  );
  return rows;
}

function requireConfigured() {
  if (!thawani.thawaniConfigured()) throw new AppError(503, 'not_configured', 'Payments not configured');
}

// Wallet top-up bounds. Deliberately stricter than — and layered on top of —
// thawani.validateAmount()'s general gateway limits (0.1-500 OMR), which stay
// loose because /cards/charge reuses the same check for covering a small
// insufficient-balance shortfall (as low as 0.1 OMR). The 1-50 rule is a
// product decision for this one flow, so it lives here, not in the shared
// Thawani integration.
const TOPUP_MIN_OMR = 1;
const TOPUP_MAX_OMR = 50;

// Create a Thawani checkout session for a wallet top-up. Bound to the user's
// Thawani customer so their saved cards are offered on the hosted page, and so
// `save_card` can tokenise the card they use.
router.post('/create',
  validateBody(z.object({ amount: z.number(), save_card: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    requireConfigured();
    const err = thawani.validateAmount(req.body.amount);
    if (err) throw new AppError(400, 'bad_request', err);
    if (req.body.amount < TOPUP_MIN_OMR || req.body.amount > TOPUP_MAX_OMR) {
      throw new AppError(400, 'bad_request', `Top-up amount must be between ${TOPUP_MIN_OMR} and ${TOPUP_MAX_OMR} OMR`);
    }

    const customerId = await ensureCustomer(req.user!.id);
    const created = await thawani.createCheckout(req.user!.id, req.body.amount, {
      customerId, saveCard: !!req.body.save_card,
    });
    await pool.query(
      `insert into public.payment_sessions (user_id, session_id, amount, status, purpose)
       values ($1,$2,$3,'pending',$4)`,
      [req.user!.id, created.session_id, req.body.amount, req.body.save_card ? 'save_card' : 'topup'],
    );
    res.json({ success: true, ...created });
  }),
);

// Verify a session; if paid, credit the wallet (idempotent via the SQL function).
router.post('/verify',
  validateBody(z.object({ session_id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `select user_id, amount, status, purpose from public.payment_sessions where session_id = $1`,
      [req.body.session_id],
    );
    const ps = rows[0];
    if (!ps || ps.user_id !== req.user!.id) throw new AppError(404, 'not_found', 'Session not found');
    if (ps.status === 'paid') return res.json({ success: true, status: 'paid', already: true });

    const status = await thawani.getPaymentStatus(req.body.session_id);
    if (status === 'paid') {
      const row = await callFn<{ balance: number }>(req.user!.id,
        'select public.credit_wallet_topup($1,$2,$3,$4) as balance',
        [req.user!.id, ps.amount, req.body.session_id, 'thawani']);
      // A tokenising session only shows up as a saved card once it is paid.
      let cards;
      if (ps.purpose === 'save_card') {
        const customerId = await ensureCustomer(req.user!.id);
        cards = await syncCards(req.user!.id, customerId).catch(() => undefined);
      }
      return res.json({ success: true, status: 'paid', balance: row.balance, ...(cards ? { cards } : {}) });
    }
    if (status === 'cancelled' || status === 'expired') {
      await pool.query(`update public.payment_sessions set status='failed' where session_id=$1`, [req.body.session_id]);
    }
    res.json({ success: true, status: status ?? 'pending' });
  }),
);

// ─── Saved cards ────────────────────────────────────────────────────────────

// Saved cards + the rail the user pays charging sessions with.
router.get('/methods', asyncHandler(async (req, res) => {
  const { rows: prefRows } = await pool.query(
    `select method from public.payment_prefs where user_id = $1`, [req.user!.id],
  );
  const method = prefRows[0]?.method ?? 'wallet';

  if (!thawani.thawaniConfigured()) return res.json({ method, cards: [], available: false });

  const { rows: custRows } = await pool.query(
    `select thawani_customer_id from public.payment_customers where user_id = $1`, [req.user!.id],
  );
  const customerId = custRows[0]?.thawani_customer_id as string | undefined;
  // No customer yet means no card can exist yet — skip the round trip.
  let cards: any[] = [];
  if (customerId) {
    cards = await syncCards(req.user!.id, customerId).catch(async () => {
      // Thawani unreachable: fall back to the local mirror rather than 500.
      const { rows } = await pool.query(
        `select card_token, brand, last4, expiry, is_default from public.payment_cards
          where user_id = $1 order by created_at`, [req.user!.id]);
      return rows;
    });
  }
  res.json({ method, cards, available: true });
}));

// Start a card-tokenising checkout. Thawani only saves a card on a real payment,
// so this charges the 0.100 OMR minimum — credited straight to the wallet.
router.post('/cards/add', asyncHandler(async (req, res) => {
  requireConfigured();
  const customerId = await ensureCustomer(req.user!.id);
  const created = await thawani.createCheckout(req.user!.id, thawani.CARD_VERIFY_OMR, {
    customerId, saveCard: true, label: 'Watt card verification',   // ≤40 chars (Thawani limit)
  });
  await pool.query(
    `insert into public.payment_sessions (user_id, session_id, amount, status, purpose)
     values ($1,$2,$3,'pending','save_card')`,
    [req.user!.id, created.session_id, thawani.CARD_VERIFY_OMR],
  );
  res.json({ success: true, amount: thawani.CARD_VERIFY_OMR, ...created });
}));

router.post('/cards/:token/default', asyncHandler(async (req, res) => {
  await pool.query(
    `update public.payment_cards set is_default = false where user_id = $1 and is_default`, [req.user!.id],
  );
  const upd = await pool.query(
    `update public.payment_cards set is_default = true where user_id = $1 and card_token = $2`,
    [req.user!.id, req.params.token],
  );
  if (!upd.rowCount) throw new AppError(404, 'not_found', 'Card not found');
  res.json({ success: true });
}));

router.delete('/cards/:token', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `select is_default from public.payment_cards where user_id = $1 and card_token = $2`,
    [req.user!.id, req.params.token],
  );
  if (!rows[0]) throw new AppError(404, 'not_found', 'Card not found');

  await thawani.deleteCard(req.params.token);
  await pool.query(`delete from public.payment_cards where user_id = $1 and card_token = $2`,
    [req.user!.id, req.params.token]);
  // Promote another card, or fall back to the wallet if that was the last one.
  await pool.query(
    `update public.payment_cards set is_default = true
      where id = (select id from public.payment_cards where user_id = $1 order by created_at limit 1)
        and not exists (select 1 from public.payment_cards where user_id = $1 and is_default)`,
    [req.user!.id],
  );
  const { rows: left } = await pool.query(
    `select 1 from public.payment_cards where user_id = $1 limit 1`, [req.user!.id]);
  if (!left[0]) {
    await pool.query(
      `insert into public.payment_prefs (user_id, method) values ($1,'wallet')
       on conflict (user_id) do update set method = 'wallet', updated_at = now()`, [req.user!.id]);
  }
  res.json({ success: true });
}));

// Choose the rail: wallet, or the saved card (card requires one to exist).
router.post('/method',
  validateBody(z.object({ method: z.enum(['wallet', 'card']) })),
  asyncHandler(async (req, res) => {
    if (req.body.method === 'card') {
      const { rows } = await pool.query(
        `select 1 from public.payment_cards where user_id = $1 limit 1`, [req.user!.id]);
      if (!rows[0]) throw new AppError(400, 'no_card', 'Add a card first');
    }
    await pool.query(
      `insert into public.payment_prefs (user_id, method) values ($1,$2)
       on conflict (user_id) do update set method = excluded.method, updated_at = now()`,
      [req.user!.id, req.body.method],
    );
    res.json({ success: true, method: req.body.method });
  }),
);

// Credit a succeeded intent to the wallet. Idempotent: credit_wallet_topup
// ignores a reference it has already booked.
async function creditIntent(userId: string, intentId: string, amount: number) {
  await pool.query(
    `insert into public.payment_sessions (user_id, session_id, amount, status, purpose)
     values ($1,$2,$3,'pending','card_charge') on conflict do nothing`,
    [userId, intentId, amount],
  );
  const row = await callFn<{ balance: number }>(userId,
    'select public.credit_wallet_topup($1,$2,$3,$4) as balance',
    [userId, amount, intentId, 'thawani_card']);
  return row.balance;
}

// Charge the saved card and credit the wallet with the proceeds, so every
// existing billing path (bookings, live sessions) keeps working unchanged.
// Banks here usually still want an OTP, so the reply may ask the app to open
// `redirect_url` and then call /cards/charge/verify.
router.post('/cards/charge',
  validateBody(z.object({ amount: z.number(), card_token: z.string().optional() })),
  asyncHandler(async (req, res) => {
    requireConfigured();
    const err = thawani.validateAmount(req.body.amount);
    if (err) throw new AppError(400, 'bad_request', err);

    const { rows: cardRows } = await pool.query(
      req.body.card_token
        ? `select card_token from public.payment_cards where user_id = $1 and card_token = $2`
        : `select card_token from public.payment_cards where user_id = $1 order by is_default desc, created_at limit 1`,
      req.body.card_token ? [req.user!.id, req.body.card_token] : [req.user!.id],
    );
    const cardToken = cardRows[0]?.card_token as string | undefined;
    if (!cardToken) throw new AppError(400, 'no_card', 'No saved card');

    const intent = await thawani.chargeSavedCard(req.user!.id, cardToken, req.body.amount);

    if (intent.status === 'succeeded') {
      const balance = await creditIntent(req.user!.id, intent.intentId, req.body.amount);
      return res.json({ success: true, status: 'paid', balance, reference: intent.intentId });
    }
    // Needs OTP / 3-D Secure — nothing is credited until the customer clears it.
    await pool.query(
      `insert into public.payment_sessions (user_id, session_id, amount, status, purpose)
       values ($1,$2,$3,'pending','card_charge') on conflict do nothing`,
      [req.user!.id, intent.intentId, req.body.amount],
    );
    res.json({
      success: true, status: 'action_required',
      reference: intent.intentId, redirect_url: intent.actionUrl,
    });
  }),
);

// Re-check an intent after the customer has been through the bank's OTP page.
router.post('/cards/charge/verify',
  validateBody(z.object({ reference: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `select amount, status from public.payment_sessions
        where session_id = $1 and user_id = $2 and purpose = 'card_charge'`,
      [req.body.reference, req.user!.id],
    );
    const ps = rows[0];
    if (!ps) throw new AppError(404, 'not_found', 'Charge not found');
    if (ps.status === 'paid') return res.json({ success: true, status: 'paid', already: true });

    const intent = await thawani.getIntent(req.body.reference);
    if (intent.status === 'succeeded') {
      const balance = await creditIntent(req.user!.id, req.body.reference, ps.amount);
      return res.json({ success: true, status: 'paid', balance });
    }
    if (intent.status === 'cancelled' || intent.status === 'requires_payment_method') {
      await pool.query(`update public.payment_sessions set status='failed' where session_id=$1`,
        [req.body.reference]);
      return res.json({ success: true, status: 'failed' });
    }
    res.json({ success: true, status: 'pending' });
  }),
);

export default router;
