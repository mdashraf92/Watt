import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { api } from '../lib/api';
import type { PaymentMethods } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { COLORS } from '../constants/colors';
import { CheckIcon, CreditCardIcon, WalletIcon } from '../components/icons';

/**
 * Wallet-vs-card payment method picker + saved-card management (add / select /
 * remove). Extracted from CompleteProfileScreen so the same Thawani add-card
 * flow can also live on the Wallet screen — one feature, two entry points,
 * instead of two copies of this logic drifting apart.
 */
interface PaymentMethodsSectionProps {
  /** Include the Wallet row + its quick top-up button. Off by default since a
   *  screen that already has its own top-up flow (e.g. WalletScreen) doesn't
   *  need a second, smaller one here. */
  showWalletRow?: boolean;
  quickTopUpAmount?: number;
}

export default function PaymentMethodsSection({
  showWalletRow = false,
  quickTopUpAmount = 10,
}: PaymentMethodsSectionProps) {
  const { profile, refreshProfile } = useAuth();
  const { t } = useLang();

  const [methods, setMethods] = useState<PaymentMethods>({ method: 'wallet', cards: [], available: true });
  const [addingCard, setAddingCard] = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(false);

  const loadMethods = useCallback(async () => {
    try { setMethods(await api.payments.methods()); }
    catch { /* leave the wallet-only default in place */ }
  }, []);

  useFocusEffect(useCallback(() => { loadMethods(); }, [loadMethods]));

  const topUp = async () => {
    setTopUpLoading(true);
    try {
      const created: any = await api.payments.create(quickTopUpAmount);
      if (!created?.pay_url) throw new Error(t.wallet_payment_error);
      const result = await WebBrowser.openAuthSessionAsync(created.pay_url, 'watt://wallet');
      if (result.type === 'success' || result.type === 'dismiss') {
        await api.payments.verify(created.session_id);
        await refreshProfile();
      }
    } catch (e: any) {
      Alert.alert(t.error, e.message ?? t.wallet_payment_error);
    } finally { setTopUpLoading(false); }
  };

  // Thawani only tokenises a card on a real payment, so adding one runs the
  // minimum charge through hosted checkout — and credits it to the wallet.
  const addCard = async () => {
    setAddingCard(true);
    try {
      const created: any = await api.payments.addCard();
      if (!created?.pay_url) throw new Error(t.wallet_payment_error);
      const result = await WebBrowser.openAuthSessionAsync(created.pay_url, 'watt://wallet');
      if (result.type === 'success' || result.type === 'dismiss') {
        const verified: any = await api.payments.verify(created.session_id);
        await refreshProfile();
        await loadMethods();
        if (verified?.status === 'paid') {
          // A first card becomes the payment method straight away.
          try { await api.payments.setMethod('card'); setMethods(m => ({ ...m, method: 'card' })); } catch { /* keep wallet */ }
          Alert.alert(t.cp_card_added, '');
        }
      }
    } catch (e: any) {
      Alert.alert(t.error, e.message ?? t.wallet_payment_error);
    } finally { setAddingCard(false); }
  };

  const chooseMethod = async (method: 'wallet' | 'card') => {
    if (method === methods.method) return;
    if (method === 'card' && methods.cards.length === 0) { addCard(); return; }
    const previous = methods.method;
    setMethods(m => ({ ...m, method }));
    try { await api.payments.setMethod(method); }
    catch (e: any) { setMethods(m => ({ ...m, method: previous })); Alert.alert(t.error, e.message); }
  };

  const useCard = async (token: string) => {
    const previous = methods.cards;
    setMethods(m => ({
      ...m, method: 'card',
      cards: m.cards.map(c => ({ ...c, is_default: c.card_token === token })),
    }));
    try {
      await api.payments.setDefaultCard(token);
      await api.payments.setMethod('card');
    } catch (e: any) {
      setMethods(m => ({ ...m, cards: previous }));
      Alert.alert(t.error, e.message);
    }
  };

  const removeCard = (token: string) => {
    Alert.alert(t.cp_card_remove_title, t.cp_card_remove_msg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.cp_card_remove, style: 'destructive',
        onPress: async () => {
          try { await api.payments.removeCard(token); await loadMethods(); }
          catch (e: any) { Alert.alert(t.error, e.message); }
        },
      },
    ]);
  };

  return (
    <>
      {showWalletRow && (
        <TouchableOpacity
          style={[s.payCard, methods.method === 'wallet' && s.payCardActive]}
          onPress={() => chooseMethod('wallet')}
          activeOpacity={0.9}
        >
          <View style={s.payRow}>
            <View style={s.payIcon}><WalletIcon size={20} color={COLORS.primary} strokeWidth={2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.payTitle}>{t.cp_wallet}</Text>
              <Text style={s.payBalance}>{profile?.wallet_balance?.toFixed(3) ?? '0.000'} OMR</Text>
            </View>
            {methods.method === 'wallet' && (
              <View style={s.selectedDot}><CheckIcon size={13} color="#fff" strokeWidth={3} /></View>
            )}
          </View>
          <TouchableOpacity style={s.topUpBtn} onPress={topUp} disabled={topUpLoading} activeOpacity={0.85}>
            {topUpLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.topUpText}>{t.cp_topup}</Text>}
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Saved card — Thawani tokenised, charged off-session when a session
          needs more than the wallet holds. */}
      <TouchableOpacity
        style={[
          s.payCard,
          methods.method === 'card' && s.payCardActive,
          !methods.available && s.payCardDisabled,
        ]}
        onPress={() => methods.available
          ? chooseMethod('card')
          : Alert.alert(t.cp_card, t.cp_card_unavailable)}
        activeOpacity={0.9}
      >
        <View style={s.payRow}>
          <View style={s.payIcon}>
            <CreditCardIcon size={20} color={methods.available ? COLORS.primary : COLORS.textTertiary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.payTitle, !methods.available && { color: COLORS.textSecondary }]}>{t.cp_card}</Text>
            {!methods.available && <Text style={s.paySoon}>{t.cp_card_soon}</Text>}
            {methods.available && methods.cards.length === 0 && (
              <Text style={s.paySoon}>{t.cp_card_none}</Text>
            )}
          </View>
          {methods.method === 'card' && (
            <View style={s.selectedDot}><CheckIcon size={13} color="#fff" strokeWidth={3} /></View>
          )}
        </View>

        {methods.available && (
          <>
            {methods.cards.map(c => (
              <View key={c.card_token} style={s.cardRow}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => useCard(c.card_token)} activeOpacity={0.7}>
                  <Text style={s.cardLabel}>
                    {(c.brand ?? 'Card')} •••• {c.last4 ?? '****'}{c.expiry ? `  ${c.expiry}` : ''}
                  </Text>
                  <Text style={s.cardSub}>{c.is_default ? t.cp_card_default : t.cp_card_use}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeCard(c.card_token)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.cardRemove}>{t.cp_card_remove}</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.addCardBtn} onPress={addCard} disabled={addingCard} activeOpacity={0.85}>
              {addingCard
                ? <ActivityIndicator color={COLORS.primary} />
                : <Text style={s.addCardText}>+ {t.cp_card_add}</Text>}
            </TouchableOpacity>
            <Text style={s.cardNote}>{t.cp_card_add_note.replace('{amount}', '0.100')}</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={s.payNote}>{t.cp_pay_note}</Text>
    </>
  );
}

const s = StyleSheet.create({
  payCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  payCardActive: { borderColor: COLORS.primary, borderWidth: 1.5, backgroundColor: COLORS.primaryBg },
  payCardDisabled: { opacity: 0.7 },
  selectedDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  cardLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textTertiary, marginTop: 2 },
  cardRemove: { fontSize: 12, fontWeight: '700', color: COLORS.error },
  addCardBtn: { borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.primary, marginTop: 10 },
  addCardText: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  cardNote: { fontSize: 11, color: COLORS.textTertiary, marginTop: 8, lineHeight: 16 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  payIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  payTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  payBalance: { fontSize: 18, fontWeight: '800', color: COLORS.primary, marginTop: 2 },
  paySoon: { fontSize: 12, color: COLORS.textTertiary, marginTop: 2, fontStyle: 'italic' },
  topUpBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  topUpText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  payNote: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginTop: 4, textAlign: 'center' },
});
