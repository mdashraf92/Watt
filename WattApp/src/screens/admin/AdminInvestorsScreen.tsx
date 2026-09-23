import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../constants/colors';
import { useLang } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTabBarHeight } from '../../navigation/tabBarLayout';
import { api } from '../../lib/api';
import type { ChargerApplication, AdminTabParamList, AdminStackParamList } from '../../types';
import {
  TrendingUpIcon, PhoneIcon, SearchIcon, XIcon, ChevronRightIcon,
} from '../../components/icons';
import NotificationBell from '../../components/NotificationBell';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<AdminTabParamList, 'AdminInvestors'>,
  NativeStackNavigationProp<AdminStackParamList>
>;

type StatusFilter = 'all' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'needs_info';

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending:      { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  under_review: { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  approved:     { bg: '#ECFDF5', text: '#059669', border: '#D1FAE5' },
  rejected:     { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  needs_info:   { bg: '#EFF6FF', text: '#2563EB', border: '#DBEAFE' },
};

// ── Main screen ────────────────────────────────────────────────

export default function AdminInvestorsScreen() {
  const { t } = useLang();
  const { profile } = useAuth();
  const navigation = useNavigation<Nav>();
  const tabBarHeight = useTabBarHeight();
  // Superadmin's version of this screen is the active-investor roster, not the
  // application review queue — pending/rejected/needs_info applications are
  // an admin operational concern, not something superadmin needs cluttering
  // their view of who is actually live on the platform.
  const isSuperadmin = profile?.role === 'superadmin';

  const [applications, setApplications] = useState<ChargerApplication[]>([]);
  const [filtered, setFiltered]         = useState<ChargerApplication[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState<StatusFilter>(isSuperadmin ? 'approved' : 'all');

  const fetchApplications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.admin.applications();
      setApplications((data ?? []) as ChargerApplication[]);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // Silently refresh when returning from the detail page.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) { firstFocus.current = false; return; }
      fetchApplications(true);
    }, [fetchApplications]),
  );

  useEffect(() => {
    // Superadmin's list is locked to active investors regardless of `filter`
    // state — there is no UI to change it away from that (chips are hidden).
    let list = isSuperadmin
      ? applications.filter(a => a.status === 'approved')
      : applications;
    if (!isSuperadmin && filter !== 'all') list = list.filter(a => a.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.full_name.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        a.governorate.toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [applications, filter, search, isSuperadmin]);

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending:      t.admin_inv_status_pending,
      under_review: t.admin_inv_status_under_review,
      approved:     t.admin_inv_status_approved,
      rejected:     t.admin_inv_status_rejected,
      needs_info:   t.admin_inv_status_needs_info,
    };
    return map[status] ?? status;
  };

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all',      label: t.admin_inv_filter_all },
    { key: 'pending',  label: t.admin_inv_filter_pending },
    { key: 'approved', label: t.admin_inv_filter_approved },
    { key: 'rejected', label: t.admin_inv_filter_rejected },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{isSuperadmin ? t.admin_inv_title_active : t.admin_investors_title}</Text>
        <NotificationBell size={40} />
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        {isSuperadmin ? (
          <View style={styles.statChip}>
            <Text style={styles.statNum}>{applications.filter(a => a.status === 'approved').length}</Text>
            <Text style={styles.statLbl}>{t.admin_inv_status_approved}</Text>
          </View>
        ) : (
          <>
            <View style={styles.statChip}>
              <Text style={styles.statNum}>{applications.length}</Text>
              <Text style={styles.statLbl}>{t.admin_inv_total}</Text>
            </View>
            {(['pending', 'approved', 'rejected'] as StatusFilter[]).map(s => (
              <View key={s} style={styles.statChip}>
                <Text style={styles.statNum}>
                  {applications.filter(a =>
                    a.status === s || (s === 'pending' && a.status === 'under_review')
                  ).length}
                </Text>
                <View style={styles.statLblRow}>
                  <View style={[styles.statDot, { backgroundColor: STATUS_COLORS[s]?.text }]} />
                  <Text style={styles.statLbl}>{statusLabel(s)}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <SearchIcon size={15} color={COLORS.textSecondary} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t.admin_inv_search}
          placeholderTextColor={COLORS.textTertiary}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <XIcon size={16} color={COLORS.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter chips — superadmin's list is locked to active investors, so
          there's nothing to switch between. */}
      {!isSuperadmin && (
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
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconWrap}>
            <TrendingUpIcon size={32} color={COLORS.textTertiary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>{t.admin_inv_empty}</Text>
          <Text style={styles.emptySub}>{t.admin_inv_empty_sub}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: tabBarHeight + 16 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ApplicationCard
              app={item}
              statusLabel={statusLabel(item.status)}
              statusColor={STATUS_COLORS[item.status] ?? STATUS_COLORS.pending}
              onPress={() => navigation.navigate('AdminApplicationDetail', { application: item })}
              t={t}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ApplicationCard({ app, statusLabel, statusColor, onPress }: {
  app: ChargerApplication;
  statusLabel: string;
  statusColor: { bg: string; text: string; border: string };
  onPress: () => void;
  t: any;
}) {
  const initial = app.full_name ? app.full_name[0].toUpperCase() : '?';
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardTop}>
        <View style={styles.cardAvatar}>
          <Text style={styles.cardAvatarText}>{initial}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{app.full_name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{app.governorate} · {app.city}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{app.charger_type}{app.power_kw ? ` · ${app.power_kw} kW` : ''}</Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: statusColor.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor.text }]} />
          <Text style={[styles.statusChipText, { color: statusColor.text }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>{new Date(app.created_at).toLocaleDateString()}</Text>
        <View style={styles.cardRight}>
          <PhoneIcon size={12} color={COLORS.textTertiary} strokeWidth={2} />
          <Text style={styles.cardPhone}>{app.phone}</Text>
        </View>
        <ChevronRightIcon size={16} color={COLORS.textTertiary} strokeWidth={2} />
      </View>
    </TouchableOpacity>
  );
}

// ── Styles: list screen ────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  headerIcon:  { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },

  statsBar: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  statChip: { flex: 1, alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border },
  statNum:  { fontSize: 19, fontWeight: '800', color: COLORS.text },
  statLblRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  statDot:  { width: 6, height: 6, borderRadius: 3 },
  statLbl:  { fontSize: 10, color: COLORS.textSecondary },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, backgroundColor: COLORS.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },

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

  card: { backgroundColor: COLORS.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  cardAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.backgroundAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardAvatarText: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  cardInfo:   { flex: 1, gap: 1 },
  cardName:   { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 1 },
  cardMeta:   { fontSize: 12, color: COLORS.textSecondary },
  statusChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot:      { width: 6, height: 6, borderRadius: 3 },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, gap: 8 },
  cardDate:   { fontSize: 11, color: COLORS.textTertiary, flex: 1 },
  cardRight:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardPhone:  { fontSize: 12, color: COLORS.textSecondary },
});
