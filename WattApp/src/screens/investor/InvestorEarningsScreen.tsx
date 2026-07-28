import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { useTabBarHeight } from '../../navigation/tabBarLayout';
import { api } from '../../lib/api';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import type { WalletTransaction, PayoutRequest } from '../../types';
import { TrendingUpIcon, WalletIcon, XIcon } from '../../components/icons';
import GradientButton from '../../components/GradientButton';
import ErrorView from '../../components/ErrorView';
import PayoutStatusBadge from '../../components/PayoutStatusBadge';

const TX_ICON: Record<string, string> = {
  topup: '⬆️', charge: '⚡', refund: '↩️', bonus: '🎁', earning: '💰', withdrawal: '🏦',
};

export default function InvestorEarningsScreen() {
  const { profile, updateProfile, refreshProfile } = useAuth();
  const { t, isRTL } = useLang();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [payouts, setPayouts]           = useState<PayoutRequest[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [loadError, setLoadError]       = useState(false);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [bankName, setBankName]   = useState('');
  const [holder, setHolder]       = useState('');
  const [iban, setIban]           = useState('');
  const [savingBank, setSavingBank]   = useState(false);

  const hasBank = !!(profile?.payout_iban && profile.payout_iban.trim());

  const fetchData = useCallback(async (silent = false) => {
    if (!profile) return;
    if (!silent) setLoading(true);
    try {
      const [tx, pr] = await Promise.all([
        api.wallet.transactions(),
        api.payouts.mine(),
      ]);
      setTransactions((tx ?? []) as WalletTransaction[]);
      setPayouts((pr ?? []) as PayoutRequest[]);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Silent refetch on tab focus: reflects new earnings/payout status changes.
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
      fetchData(true);
    }, [fetchData]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([refreshProfile(), fetchData()]); }
    finally { setRefreshing(false); }
  };

  // Prefill the bank form from the profile.
  useEffect(() => {
    if (profile) {
      setBankName(profile.payout_bank_name ?? '');
      setHolder(profile.payout_account_holder ?? '');
      setIban(profile.payout_iban ?? '');
    }
  }, [profile?.id]);

  const isEarning = (tx: WalletTransaction) => tx.type === 'earning' || tx.type === 'bonus';

  const thisMonthTotal = transactions
    .filter(tx => {
      const d = new Date(tx.created_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && isEarning(tx);
    })
    .reduce((sum, tx) => sum + tx.amount, 0);

  const allTimeTotal = transactions.filter(isEarning).reduce((sum, tx) => sum + tx.amount, 0);

  const saveBank = async () => {
    if (!bankName.trim() || !holder.trim() || !iban.trim()) {
      Alert.alert(t.error, t.payout_fill_all); return;
    }
    setSavingBank(true);
    try {
      await updateProfile({
        payout_bank_name: bankName.trim(),
        payout_account_holder: holder.trim(),
        payout_iban: iban.trim(),
      });
      Alert.alert('', t.payout_bank_saved);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setSavingBank(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.inv_earnings_title}</Text>
        <View style={styles.headerIcon}>
          <TrendingUpIcon size={22} color={COLORS.gold} strokeWidth={2} />
        </View>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <>
            {/* Balance card */}
            <LinearGradient colors={GRADIENTS.greenDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
              <View style={styles.balanceDeco1} />
              <View style={styles.balanceDeco2} />
              <Text style={styles.balanceLabel}>{t.inv_earnings_balance}</Text>
              <Text style={styles.balanceAmount}>{profile?.wallet_balance.toFixed(3) ?? '0.000'}</Text>
              <Text style={styles.balanceCurrency}>OMR</Text>
              <TouchableOpacity
                style={styles.withdrawBtn}
                onPress={() => setShowWithdraw(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.withdrawBtnText}>{t.inv_earnings_bank_btn}</Text>
              </TouchableOpacity>
            </LinearGradient>

            {/* Automatic payout info */}
            <View style={styles.autoInfo}>
              <Text style={styles.autoInfoText}>
                {hasBank ? t.inv_earnings_auto_on : t.inv_earnings_auto_setup}
              </Text>
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <TrendingUpIcon size={18} color={COLORS.gold} strokeWidth={2} />
                <Text style={styles.statValue}>{thisMonthTotal.toFixed(3)}</Text>
                <Text style={styles.statLabel}>{t.inv_earnings_this_month} (OMR)</Text>
              </View>
              <View style={styles.statCard}>
                <WalletIcon size={18} color={COLORS.primary} strokeWidth={2} />
                <Text style={[styles.statValue, { color: COLORS.primary }]}>{allTimeTotal.toFixed(3)}</Text>
                <Text style={styles.statLabel}>{t.inv_earnings_all_time} (OMR)</Text>
              </View>
            </View>

            {/* Payout requests */}
            {payouts.length > 0 && (
              <View style={styles.payoutSection}>
                <Text style={styles.sectionTitle}>{t.payout_history}</Text>
                {payouts.map(p => (
                  <View key={p.id} style={styles.payoutRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payoutAmount}>{p.amount.toFixed(3)} OMR</Text>
                      <Text style={styles.payoutDate}>{new Date(p.requested_at).toLocaleDateString()}</Text>
                    </View>
                    <PayoutStatusBadge status={p.status} />
                  </View>
                ))}
              </View>
            )}

            <View style={styles.txHeader}>
              <Text style={styles.txHeaderText}>{t.inv_earnings_tx_title}</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}><ActivityIndicator color={COLORS.primary} /></View>
          ) : loadError ? (
            <ErrorView onRetry={fetchData} />
          ) : (
            <View style={styles.emptyWrap}>
              <WalletIcon size={32} color={COLORS.textTertiary} strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t.wallet_empty_title}</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
        renderItem={({ item }) => (
          <View style={styles.txRow}>
            <View style={[styles.txIconWrap, item.amount > 0 ? styles.txIconPlus : styles.txIconMinus]}>
              <Text style={styles.txEmoji}>{TX_ICON[item.type] ?? '💳'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.txDesc}>{item.description}</Text>
              <Text style={styles.txDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            <View style={styles.txRight}>
              <Text style={[styles.txAmount, item.amount > 0 ? styles.txPos : styles.txNeg]}>
                {item.amount > 0 ? '+' : ''}{item.amount.toFixed(3)} OMR
              </Text>
              <Text style={styles.txBalance}>{item.balance_after.toFixed(3)}</Text>
            </View>
          </View>
        )}
      />

      {/* Withdraw modal */}
      <Modal visible={showWithdraw} transparent animationType="slide" onRequestClose={() => setShowWithdraw(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) + 8 }]}>
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>{t.payout_bank_title}</Text>
              <TouchableOpacity onPress={() => setShowWithdraw(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <XIcon size={20} color={COLORS.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* How automatic payouts work */}
              <View style={styles.autoBox}>
                <Text style={styles.autoBoxText}>{t.payout_auto_explain}</Text>
              </View>

              {/* Bank details — required so we can send your earnings */}
              <Text style={styles.formLabel}>{t.payout_bank_details}</Text>
              <TextInput style={styles.input} value={bankName} onChangeText={setBankName}
                placeholder={t.payout_bank_name} placeholderTextColor={COLORS.textTertiary} />
              <TextInput style={styles.input} value={holder} onChangeText={setHolder}
                placeholder={t.payout_account_holder} placeholderTextColor={COLORS.textTertiary} />
              <TextInput style={styles.input} value={iban} onChangeText={setIban}
                placeholder={t.payout_iban} placeholderTextColor={COLORS.textTertiary} autoCapitalize="characters" />

              <GradientButton label={t.payout_save_bank} onPress={saveBank} loading={savingBank} />
              <View style={{ height: 8 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  headerIcon:  { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.goldBg, alignItems: 'center', justifyContent: 'center' },

  balanceCard: {
    margin: 16, borderRadius: 24, padding: 24,
    backgroundColor: COLORS.primaryDark, alignItems: 'center', overflow: 'hidden', gap: 4,
  },
  balanceDeco1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -40 },
  balanceDeco2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.04)', bottom: -30, left: -20 },
  balanceLabel:  { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginBottom: 4 },
  balanceAmount: { fontFamily: FONTS.extrabold, fontSize: 46, color: '#fff' },
  balanceCurrency: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginBottom: 16 },
  withdrawBtn: { backgroundColor: COLORS.gold, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 14 },
  withdrawBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  autoInfo: {
    marginHorizontal: 16, marginBottom: 14, padding: 12, borderRadius: 12,
    backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryTint,
  },
  autoInfoText: { fontSize: 12, color: COLORS.primary, fontWeight: '600', lineHeight: 17, textAlign: 'center' },
  autoBox: {
    padding: 14, borderRadius: 14, marginBottom: 18,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  autoBoxText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 14, gap: 10 },
  statCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 18, padding: 16,
    alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.gold },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },

  payoutSection: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },
  payoutRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  payoutAmount: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  payoutDate:   { fontSize: 11, color: COLORS.textTertiary, marginTop: 2 },

  txHeader: { paddingHorizontal: 16, paddingBottom: 8 },
  txHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7 },

  loadingWrap: { padding: 40, alignItems: 'center' },
  emptyWrap:   { padding: 40, alignItems: 'center', gap: 10 },
  emptyText:   { fontSize: 14, color: COLORS.textSecondary },

  txRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  txIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txIconPlus: { backgroundColor: COLORS.successBg },
  txIconMinus:{ backgroundColor: COLORS.errorBg },
  txEmoji:    { fontSize: 18 },
  txDesc:     { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  txDate:     { fontSize: 11, color: COLORS.textTertiary },
  txRight:    { alignItems: 'flex-end' },
  txAmount:   { fontSize: 14, fontWeight: '800' },
  txPos:      { color: COLORS.success },
  txNeg:      { color: COLORS.error },
  txBalance:  { fontSize: 10, color: COLORS.textTertiary, marginTop: 2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, maxHeight: '88%',
  },
  modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  availRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.background, borderRadius: 14, padding: 14, marginBottom: 18,
    borderWidth: 1, borderColor: COLORS.border,
  },
  availLabel: { fontSize: 14, color: COLORS.textSecondary },
  availValue: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  formLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text, marginBottom: 10,
  },
  secondaryBtn: {
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg,
  },
  secondaryBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  note: { fontSize: 12, color: COLORS.textTertiary, lineHeight: 18, marginTop: 12, marginBottom: 14 },
  primaryBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
