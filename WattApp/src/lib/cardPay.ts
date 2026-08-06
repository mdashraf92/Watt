import * as WebBrowser from 'expo-web-browser';
import { api } from './api';

// Charging the saved card is a two-step affair: Thawani confirms the intent,
// and the bank usually still wants an OTP. When it does we hand the customer
// the bank's page and re-check the intent once they come back.
export type CardPayOutcome = { paid: boolean; balance?: number; cancelled?: boolean };

export async function payWithSavedCard(amountOmr: number): Promise<CardPayOutcome> {
  const charge = await api.payments.chargeCard(amountOmr);

  if (charge.status === 'paid') return { paid: true, balance: charge.balance };

  if (!charge.redirect_url) return { paid: false };

  const result = await WebBrowser.openAuthSessionAsync(charge.redirect_url, 'watt://wallet');
  if (result.type !== 'success' && result.type !== 'dismiss') return { paid: false, cancelled: true };

  const verified = await api.payments.verifyCardCharge(charge.reference);
  return { paid: verified.status === 'paid', balance: verified.balance };
}

// The server raises "INSUFFICIENT_BALANCE|required=..|available=..|shortfall=.."
// whenever a wallet hold cannot be placed — booking a session or calling out a
// van. Returns the shortfall in OMR, or null when this was a different error.
export function parseInsufficient(message?: string): number | null {
  if (!message || !message.includes('INSUFFICIENT_BALANCE')) return null;
  const m = message.match(/shortfall=([0-9.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Top the wallet up by the shortfall using the saved card, so the caller can
 * retry whatever just failed for lack of funds.
 *
 * Returns 'paid' when the money is in and a retry should happen, 'no_card' when
 * there is nothing to charge (caller should send the user to top up by hand),
 * or 'failed' when the customer abandoned or the bank declined — in which case
 * the caller should stop quietly, since the user has already seen the bank's UI.
 */
export async function coverShortfall(shortfallOmr: number): Promise<'paid' | 'no_card' | 'failed'> {
  const methods = await api.payments.methods().catch(() => null);
  if (methods?.method !== 'card' || !methods.cards.length) return 'no_card';
  // Thawani rejects trivially small amounts; 0.1 OMR is the practical floor.
  const outcome = await payWithSavedCard(Math.max(shortfallOmr, 0.1)).catch(() => ({ paid: false }));
  return outcome.paid ? 'paid' : 'failed';
}
