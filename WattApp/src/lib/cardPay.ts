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
