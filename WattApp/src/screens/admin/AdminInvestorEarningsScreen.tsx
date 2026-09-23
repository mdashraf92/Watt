import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../../lib/api';
import type { InvestorEarningsReport } from '../../lib/api';
import { COLORS } from '../../constants/colors';
import { useLang } from '../../context/LanguageContext';
import { ArrowLeftIcon, ShareIcon, ZapIcon, WalletIcon } from '../../components/icons';

/**
 * Per-investor, per-session earnings breakdown — the "report" an admin needs
 * before manually transferring a payout, so the amount being sent is backed
 * by an itemized list of exactly which charging sessions produced it.
 */
export default function AdminInvestorEarningsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { userId } = route.params as { userId: string };
  const { t } = useLang();

  const [report, setReport] = useState<InvestorEarningsReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await api.admin.investorEarnings(userId));
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const shareReport = async () => {
    if (!report) return;
    const lines = [
      `GO WATT — ${t.admin_earn_report_title}`,
      '',
      `${t.profile_name}: ${report.investor.full_name}`,
      `${t.profile_phone}: ${report.investor.phone}`,
      report.listing ? `${t.admin_earn_charger}: ${report.listing.station_name ?? report.listing.address}` : '',
      '',
      report.investor.payout_bank_name ? `${t.admin_earn_bank}: ${report.investor.payout_bank_name}` : '',
      report.investor.payout_account_holder ? `${t.admin_earn_account_holder}: ${report.investor.payout_account_holder}` : '',
      report.investor.payout_iban ? `IBAN: ${report.investor.payout_iban}` : '',
      '',
      `${t.admin_earn_sessions} (${report.transactions.length}):`,
      ...report.transactions.map(tx =>
        `  ${new Date(tx.created_at).toLocaleDateString()} · ${tx.charger_name ?? '—'} · ` +
        `${tx.kwh_delivered != null ? Number(tx.kwh_delivered).toFixed(2) + ' kWh · ' : ''}` +
        `+${Number(tx.amount).toFixed(3)} OMR`,
      ),
      '',
      `${t.admin_earn_total}: ${report.total_earnings.toFixed(3)} OMR`,
    ].filter(Boolean);
    try { await Share.share({ message: lines.join('\n') }); } catch { /* user dismissed */ }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{t.admin_earn_report_title}</Text>
        <TouchableOpacity style={s.iconBtn} onPress={shareReport} disabled={!report}>
          <ShareIcon size={18} color={report ? COLORS.primary : COLORS.textTertiary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : !report ? (
        <View style={s.center}><Text style={s.emptyText}>{t.admin_earn_none}</Text></View>
      ) : (
        <>
          <View style={s.summaryCard}>
            <View style={s.summaryIconWrap}><WalletIcon size={22} color={COLORS.primary} strokeWidth={2} /></View>
            <Text style={s.investorName}>{report.investor.full_name}</Text>
            <Text style={s.investorPhone}>{report.investor.phone}</Text>
            {report.listing && (
              <Text style={s.chargerName}>{report.listing.station_name ?? report.listing.address}</Text>
            )}
            <Text style={s.totalLabel}>{t.admin_earn_total}</Text>
            <Text style={s.totalValue}>{report.total_earnings.toFixed(3)} OMR</Text>
          </View>

          {(report.investor.payout_bank_name || report.investor.payout_iban) && (
            <View style={s.bankCard}>
              <Text style={s.bankRow}>{report.investor.payout_bank_name ?? '—'}</Text>
              <Text style={s.bankRow}>{report.investor.payout_account_holder ?? '—'}</Text>
              <Text style={s.bankIban}>{report.investor.payout_iban ?? '—'}</Text>
            </View>
          )}

          <Text style={s.sectionTitle}>{t.admin_earn_sessions} ({report.transactions.length})</Text>

          {report.transactions.length === 0 ? (
            <View style={s.center}><Text style={s.emptyText}>{t.admin_earn_none}</Text></View>
          ) : (
            <FlatListLike transactions={report.transactions} />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

// Small inline list (no need for FlatList — capped at 200 rows server-side,
// and this screen is only opened occasionally by an admin, not scrolled hard).
function FlatListLike({ transactions }: { transactions: InvestorEarningsReport['transactions'] }) {
  const { t } = useLang();
  return (
    <View style={{ paddingHorizontal: 16, gap: 8, paddingBottom: 32 }}>
      {transactions.map(tx => (
        <View key={tx.id} style={s.txRow}>
          <View style={s.txIconWrap}><ZapIcon size={16} color={COLORS.primary} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.txCharger} numberOfLines={1}>{tx.charger_name ?? '—'}</Text>
            <Text style={s.txDate}>
              {new Date(tx.created_at).toLocaleDateString()}
              {tx.kwh_delivered != null ? ` · ${Number(tx.kwh_delivered).toFixed(2)} kWh` : ''}
            </Text>
          </View>
          <Text style={s.txAmount}>+{Number(tx.amount).toFixed(3)}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.text, marginHorizontal: 8 },

  summaryCard: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: COLORS.card, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, padding: 20, alignItems: 'center', gap: 2,
  },
  summaryIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  investorName: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  investorPhone: { fontSize: 13, color: COLORS.textSecondary },
  chargerName: { fontSize: 12, color: COLORS.textTertiary, marginTop: 4 },
  totalLabel: { fontSize: 11, color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14 },
  totalValue: { fontSize: 30, fontWeight: '900', color: COLORS.primary, marginTop: 2 },

  bankCard: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: COLORS.background, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 3,
  },
  bankRow: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  bankIban: { fontSize: 13, color: COLORS.textSecondary, letterSpacing: 0.5, marginTop: 2 },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase',
    letterSpacing: 0.6, marginHorizontal: 16, marginBottom: 10,
  },

  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  txIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  txCharger: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  txDate: { fontSize: 11, color: COLORS.textTertiary, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '800', color: COLORS.success },
});
