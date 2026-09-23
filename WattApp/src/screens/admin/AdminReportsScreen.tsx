import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../constants/colors';
import { useLang } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import type { AdminStackParamList, SupportReport, ReportStatus } from '../../types';
import { ArrowLeftIcon, AlertTriangleIcon, ChevronRightIcon } from '../../components/icons';

type Nav = NativeStackNavigationProp<AdminStackParamList, 'AdminReports'>;

type StatusFilter = 'all' | ReportStatus;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open:      { bg: '#FFFBEB', text: '#D97706' },
  in_review: { bg: '#EFF6FF', text: '#2563EB' },
  resolved:  { bg: '#ECFDF5', text: '#059669' },
};

export default function AdminReportsScreen() {
  const { t } = useLang();
  const navigation = useNavigation<Nav>();

  const [reports, setReports] = useState<SupportReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<StatusFilter>('all');

  const fetchReports = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.admin.reports(filter === 'all' ? undefined : filter);
      setReports(data ?? []);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) { firstFocus.current = false; return; }
      fetchReports(true);
    }, [fetchReports]),
  );

  const statusLabel = (status: string) => ({
    open: t.admin_reports_filter_open,
    in_review: t.admin_reports_filter_in_review,
    resolved: t.admin_reports_filter_resolved,
  } as Record<string, string>)[status] ?? status;

  const categoryLabel = (c: string) => ({
    charger_fault: t.report_category_charger_fault,
    payment: t.report_category_payment,
    safety: t.report_category_safety,
    damage: t.report_category_damage,
    other: t.report_category_other,
  } as Record<string, string>)[c] ?? c;

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all',       label: t.admin_reports_filter_all },
    { key: 'open',      label: t.admin_reports_filter_open },
    { key: 'in_review', label: t.admin_reports_filter_in_review },
    { key: 'resolved',  label: t.admin_reports_filter_resolved },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.admin_reports_title}</Text>
        <View style={styles.headerIcon}>
          <AlertTriangleIcon size={20} color={COLORS.textSecondary} strokeWidth={2} />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconWrap}>
            <AlertTriangleIcon size={32} color={COLORS.textTertiary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>{t.admin_reports_empty}</Text>
          <Text style={styles.emptySub}>{t.admin_reports_empty_sub}</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const sc = STATUS_COLORS[item.status] ?? STATUS_COLORS.open;
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('AdminReportDetail', { report: item })}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardCategory}>{categoryLabel(item.category)}</Text>
                    <Text style={styles.cardReporter} numberOfLines={1}>
                      {item.reporter?.full_name ?? '—'}{item.reporter?.phone ? ` · ${item.reporter.phone}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusChipText, { color: sc.text }]}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                  <ChevronRightIcon size={16} color={COLORS.textTertiary} strokeWidth={2} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: COLORS.text },
  headerIcon:  { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },

  filterBar: { flexGrow: 0, marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  filterChip: { height: 36, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  filterChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.backgroundAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptySub:   { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },

  card: { backgroundColor: COLORS.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardCategory: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  cardReporter: { fontSize: 12, color: COLORS.textSecondary },
  statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  cardDate: { fontSize: 11, color: COLORS.textTertiary },
});
