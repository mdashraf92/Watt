import * as WebBrowser from 'expo-web-browser';
import { api } from './api';
import type { CafePaymentStep } from '../types';

// Café orders are card-only. The server either charged the saved card already
// ('paid'), or hands back a page the customer must finish — the bank's OTP for
// a saved card, or Thawani's hosted checkout when no card is saved yet (which
// also saves it for one-tap next time). Same bounce-back deep link as top-ups.
export type CafePayOutcome = 'paid' | 'pending' | 'failed' | 'cancelled';

export async function finishCafePayment(step: CafePaymentStep): Promise<{ outcome: CafePayOutcome; message?: string }> {
  if (step.status === 'paid') return { outcome: 'paid' };
  if (step.status === 'failed') return { outcome: 'failed', message: step.message };
  if (step.status === 'action_required') {
    const result = await WebBrowser.openAuthSessionAsync(step.redirect_url, 'watt://wallet');
    if (result.type !== 'success' && result.type !== 'dismiss') return { outcome: 'cancelled' };
  }
  // The server, not the browser result, decides whether money arrived.
  const verified = await api.cafe.verify(step.order.id).catch(() => null);
  if (!verified) return { outcome: 'pending' };
  if (verified.status === 'paid') return { outcome: 'paid' };
  if (verified.status === 'failed') return { outcome: 'failed', message: verified.message };
  return { outcome: 'pending' };
}

/** Same arithmetic as create_cafe_order() in SQL — for display only; the server recomputes. */
export function lineUnitPrice(
  item: { price: number; package_upcharge: number | null; options: { choices: { id: string; price_delta: number }[] }[] },
  chosen: string[], inPackage: boolean,
): number {
  const delta = item.options.flatMap(g => g.choices).filter(c => chosen.includes(c.id))
    .reduce((sum, c) => sum + Number(c.price_delta), 0);
  return (inPackage ? Number(item.package_upcharge ?? 0) : Number(item.price)) + delta;
}

export const omr = (n: number) => `${(Math.round(n * 1000) / 1000).toFixed(3)} OMR`;
