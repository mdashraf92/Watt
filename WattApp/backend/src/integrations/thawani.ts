import { env } from '../config/env';

// Thawani Pay (Oman) — hosted checkout. Ported from the thawani-checkout edge fn.
const MIN_OMR = 0.1;
const MAX_OMR = 500;

async function thawani(method: string, path: string, body?: object) {
  const res = await fetch(`${env.THAWANI_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'thawani-api-key': env.THAWANI_SECRET_KEY ?? '' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json: json as any };
}

export function thawaniConfigured(): boolean {
  return !!(env.THAWANI_SECRET_KEY && env.THAWANI_PUBLISHABLE_KEY);
}

export function validateAmount(omr: number): string | null {
  if (!omr || omr < MIN_OMR || omr > MAX_OMR) return `Amount must be between ${MIN_OMR} and ${MAX_OMR} OMR`;
  return null;
}

// Smallest charge we can put through to tokenise a card. It is credited to the
// wallet like any other top-up, so the customer keeps the money.
export const CARD_VERIFY_OMR = MIN_OMR;

type CheckoutOpts = { customerId?: string; saveCard?: boolean; label?: string };

export async function createCheckout(userId: string, omr: number, opts: CheckoutOpts = {}) {
  const { ok, json } = await thawani('POST', '/api/v1/checkout/session', {
    client_reference_id: `${userId}:${Date.now()}`,
    mode: 'payment',
    products: [{ name: opts.label ?? 'Watt Wallet Top-up', unit_amount: Math.round(omr * 1000), quantity: 1 }],
    // Thawani requires valid http(s) return URLs (it rejects custom schemes like
    // watt://). These backend endpoints bounce the browser to the app deep link.
    success_url: `${env.PUBLIC_URL}/pay/success`,
    cancel_url: `${env.PUBLIC_URL}/pay/cancel`,
    metadata: { user_id: userId, amount: omr },
    // Binding the session to a customer makes Thawani offer the cards they have
    // already saved, and lets us tokenise a new one on success.
    ...(opts.customerId ? { customer_id: opts.customerId } : {}),
    ...(opts.saveCard ? { save_card_on_success: true } : {}),
  });
  const sid = json?.data?.session_id;
  if (!ok || !sid) throw new Error(`Thawani session error: ${json?.description ?? 'unknown'}`);
  return {
    session_id: sid as string,
    publishable_key: env.THAWANI_PUBLISHABLE_KEY,
    pay_url: `${env.THAWANI_BASE_URL}/pay/${sid}?key=${env.THAWANI_PUBLISHABLE_KEY}`,
  };
}

export async function getPaymentStatus(sessionId: string): Promise<string | null> {
  const { ok, json } = await thawani('GET', `/api/v1/checkout/session/${sessionId}`);
  if (!ok) throw new Error(`Thawani verify error: ${json?.description ?? 'unknown'}`);
  return json?.data?.payment_status ?? null;
}

// ─── Saved cards ────────────────────────────────────────────────────────────
// Thawani keeps the card; we only ever hold its tokens.

export type SavedCard = { token: string; brand: string | null; last4: string | null; expiry: string | null };

/** Create (or re-create) the Thawani customer that cards are saved against. */
export async function createCustomer(userId: string): Promise<string> {
  const { ok, json } = await thawani('POST', '/api/v1/customers', { client_customer_id: userId });
  const id = json?.data?.id ?? json?.data?.customer_id;
  if (!ok || !id) throw new Error(`Thawani customer error: ${json?.description ?? 'unknown'}`);
  return id as string;
}

// Payment_Method_Model: { id, bin, masked_card: 'XXXX XXXX XXXX 4242',
//                         expiry_month, expiry_year, brand, card_type, nickname }
function normaliseCard(raw: any): SavedCard | null {
  if (!raw?.id) return null;
  const digits = String(raw.masked_card ?? '').replace(/\D/g, '');
  return {
    token: String(raw.id),
    brand: raw.brand ?? null,
    last4: digits ? digits.slice(-4) : null,
    expiry: raw.expiry_month && raw.expiry_year
      ? `${String(raw.expiry_month).padStart(2, '0')}/${String(raw.expiry_year).slice(-2)}`
      : null,
  };
}

/** Cards currently saved for a Thawani customer. */
export async function listCards(customerId: string): Promise<SavedCard[]> {
  const { ok, json } = await thawani('GET', `/api/v1/payment_methods?customer_id=${encodeURIComponent(customerId)}`);
  if (!ok) throw new Error(`Thawani cards error: ${json?.description ?? 'unknown'}`);
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  return rows.map(normaliseCard).filter((c): c is SavedCard => !!c);
}

export async function deleteCard(cardToken: string): Promise<void> {
  const { ok, json } = await thawani('DELETE', `/api/v1/payment_methods/${encodeURIComponent(cardToken)}`);
  // 4003 = object not found: already gone at Thawani's end, nothing to do.
  if (!ok && json?.code !== 4003) throw new Error(`Thawani card delete error: ${json?.description ?? 'unknown'}`);
}

// Payment_Intent_Model.status
export type IntentStatus =
  | 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'succeeded' | 'cancelled';

export type IntentResult = {
  intentId: string;
  status: IntentStatus;
  /** Set when the bank asks for OTP / 3-D Secure — send the customer here. */
  actionUrl: string | null;
};

function readIntent(json: any): IntentResult | null {
  const d = json?.data;
  if (!d?.id) return null;
  return {
    intentId: String(d.id),
    status: (d.status ?? 'requires_payment_method') as IntentStatus,
    actionUrl: d.next_action?.url ?? null,
  };
}

/**
 * Charge a saved card. Creates a payment intent and confirms it with the card.
 * Omani banks routinely demand an OTP even for a saved card, so a
 * `requires_action` result is normal: the caller must send the customer to
 * `actionUrl` and then re-check with `getIntent`.
 */
export async function chargeSavedCard(
  userId: string, cardToken: string, omr: number,
): Promise<IntentResult> {
  const created = await thawani('POST', '/api/v1/payment_intents', {
    payment_method_id: cardToken,
    amount: Math.round(omr * 1000),          // baisa
    client_reference_id: `${userId}:${Date.now()}`,
    return_url: `${env.PUBLIC_URL}/pay/success`,
    metadata: { user_id: userId, amount: omr },
  });
  const intent = readIntent(created.json);
  if (!created.ok || !intent) throw new Error(`Thawani charge error: ${created.json?.description ?? 'unknown'}`);

  const confirmed = await thawani('POST', `/api/v1/payment_intents/${intent.intentId}/confirm`, {
    payment_method_id: cardToken,
  });
  const result = readIntent(confirmed.json) ?? intent;
  if (!confirmed.ok || result.status === 'cancelled' || result.status === 'requires_payment_method') {
    throw new Error(`Card declined${confirmed.json?.description ? `: ${confirmed.json.description}` : ''}`);
  }
  return result;
}

export async function getIntent(intentId: string): Promise<IntentResult> {
  const { ok, json } = await thawani('GET', `/api/v1/payment_intents/${encodeURIComponent(intentId)}`);
  const intent = readIntent(json);
  if (!ok || !intent) throw new Error(`Thawani intent error: ${json?.description ?? 'unknown'}`);
  return intent;
}
