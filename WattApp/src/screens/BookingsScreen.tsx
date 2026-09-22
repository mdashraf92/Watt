import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Booking, CustomerStackParamList, CustomerTabParamList } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import { translateGov, stationDisplayName } from '../i18n/govMap';
import { useTabBarHeight } from '../navigation/tabBarLayout';
import {
  CalendarIcon, ZapIcon, MapPinIcon, ClockIcon, TimerIcon,
  CoinsIcon, XIcon, CheckIcon,
} from '../components/icons';
import ErrorView from '../components/ErrorView';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<CustomerTabParamList, 'Bookings'>,
  NativeStackNavigationProp<CustomerStackParamList>
>;

// ── Status maps ───────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  pending:   COLORS.warning,
  confirmed: COLORS.primary,
  active:    COLORS.available,
  completed: COLORS.textSecondary,
  cancelled: COLORS.error,
  no_show:   COLORS.fault,
};

const STATUS_BG: Record<string, string> = {
  pending:   COLORS.warningBg,
  confirmed: COLORS.primaryBg,
  active:    COLORS.successBg,
  completed: COLORS.backgroundAlt,
  cancelled: COLORS.errorBg,
  no_show:   COLORS.errorBg,
};

const UPCOMING_STATUSES = new Set(['pending', 'confirmed', 'active']);
const PAST_STATUSES     = new Set(['completed', 'cancelled', 'no_show']);

// ── List item type ────────────────────────────────────────────

type ListItem =
  | { type: 'section'; label: string; count: number }
  | { type: 'booking'; data: Booking };

// ── Main screen ───────────────────────────────────────────────

export default function BookingsScreen() {
  const { t, isRTL } = useLang();
  const tabBarHeight = useTabBarHeight();
  const locale = isRTL ? 'ar-OM' : 'en-GB';
  const navigation = useNavigation<Nav>();
  const { profile } = useAuth();

  const STATUS_LABEL: Record<string, string> = {
    pending:   t.bookings_status_pending,
    confirmed: t.bookings_status_confirmed,
    active:    t.bookings_status_active,
    completed: t.bookings_status_completed,
    cancelled: t.bookings_status_cancelled,
    no_show:   t.bookings_status_no_show,
  };

  const CANCEL_REASONS = [
    t.bookings_cancel_reason_plans,
    t.bookings_cancel_reason_time,
    t.bookings_cancel_reason_emergency,
    t.bookings_cancel_reason_other,
  ];

  const FILTER_KEYS = [
    { key: 'all',       label: t.bookings_filter_all },
    { key: 'active',    label: t.bookings_filter_active },
    { key: 'confirmed', label: t.bookings_filter_confirmed },
    { key: 'completed', label: t.bookings_filter_completed },
  ];

  const [bookings,      setBookings]      = useState<Booking[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [loadError,     setLoadError]     = useState(false);
  const [filter,        setFilter]        = useState('all');
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
  const [cancelReason,  setCancelReason]  = useState('');
  const [cancelNote,    setCancelNote]    = useState('');
  const [cancelling,    setCancelling]    = useState(false);

  // ── Data fetch ───────────────────────────────────────────────

  const fetchBookings = useCallback(async (quiet: boolean | 'silent' = false) => {
    if (!profile) return;
    if (quiet === false) setLoading(true);
    else if (quiet === true) setRefreshing(true);
    // 'silent': no spinner at all (focus refetch)
    try {
      const data = await api.bookings.list();
      setBookings(data as Booking[]);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // Silent refetch on tab focus so a booking made/cancelled elsewhere shows up.
  useFocusEffect(
    useCallback(() => { fetchBookings('silent'); }, [fetchBookings]),
  );

  // ── Derived data ─────────────────────────────────────────────

  const activeCount   = bookings.filter(b => b.status === 'active').length;
  const upcomingCount = bookings.filter(b => b.status === 'confirmed' || b.status === 'pending').length;

  // Per-filter counts, so an empty tab is visible before it's tapped.
  const FILTER_TABS = useMemo(
    () => FILTER_KEYS.map(f => ({
      ...f,
      count: f.key === 'all' ? bookings.length : bookings.filter(b => b.status === f.key).length,
    })),
    [bookings, t],   // eslint-disable-line react-hooks/exhaustive-deps
  );

  const listItems = useMemo((): ListItem[] => {
    if (filter !== 'all') {
      return bookings
        .filter(b => b.status === filter)
        .map(b => ({ type: 'booking', data: b }));
    }

    const upcoming = bookings.filter(b => UPCOMING_STATUSES.has(b.status));
    const past     = bookings.filter(b => PAST_STATUSES.has(b.status));
    const items: ListItem[] = [];

    if (upcoming.length > 0) {
      items.push({ type: 'section', label: t.bookings_section_upcoming, count: upcoming.length });
      upcoming.forEach(b => items.push({ type: 'booking', data: b }));
    }
    if (past.length > 0) {
      items.push({ type: 'section', label: t.bookings_section_past, count: past.length });
      past.forEach(b => items.push({ type: 'booking', data: b }));
    }
    return items;
  }, [bookings, filter, t]);

  // ── Cancel flow ──────────────────────────────────────────────

  const openCancel = (booking: Booking) => {
    setCancelReason('');
    setCancelNote('');
    setCancelBooking(booking);
  };

  // "Other" is only a real reason once they say what it is.
  const needsNote = cancelReason === t.bookings_cancel_reason_other;
  const canCancel = !!cancelReason && (!needsNote || cancelNote.trim().length > 0);

  const confirmCancel = async () => {
    if (!cancelBooking || !canCancel) return;
    setCancelling(true);
    try {
      const note = cancelNote.trim();
      const reason = note ? `${cancelReason}: ${note}` : cancelReason;
      await api.bookings.cancel(cancelBooking.id, reason);
      setCancelBooking(null);
      Alert.alert('', t.bookings_cancel_success);
      fetchBookings(true);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setCancelling(false);
    }
  };

  // ── Render item ──────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'section') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{item.label}</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{item.count}</Text>
          </View>
        </View>
      );
    }

    const b          = item.data;
    const bookedAt   = new Date(b.booked_at);
    const isActive   = b.status === 'active';
    const isConfirmed = b.status === 'confirmed';
    const isPast     = PAST_STATUSES.has(b.status);
    const stripeColor = STATUS_COLOR[b.status];

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isActive && styles.cardActive,
          isPast && styles.cardPast,
        ]}
        onPress={() => (isActive || isConfirmed) && navigation.navigate('ActiveBooking', { bookingId: b.id })}
        activeOpacity={isActive || isConfirmed ? 0.75 : 1}
      >
        {/* Left stripe */}
        <View style={[styles.stripe, { backgroundColor: stripeColor }]} />

        <View style={styles.cardInner}>
          {/* Top row */}
          <View style={styles.cardTop}>
            <View style={[styles.stationIcon, { backgroundColor: isActive ? COLORS.primaryTint : COLORS.backgroundAlt }]}>
              <ZapIcon size={20} color={isActive ? COLORS.primary : COLORS.textTertiary} strokeWidth={isActive ? 2.5 : 1.8} />
            </View>
            <View style={styles.cardMid}>
              <Text style={[styles.stationName, isPast && styles.textDimmed]} numberOfLines={1}>
                {b.station ? stationDisplayName(b.station, isRTL) : t.bookings_unknown_station}
              </Text>
              {b.station?.governorate ? (
                <View style={styles.govRow}>
                  <MapPinIcon size={11} color={COLORS.textTertiary} strokeWidth={1.8} />
                  <Text style={styles.govText}>{translateGov(b.station.governorate, isRTL)}</Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[b.status] }]}>
              <View style={[styles.statusDot, { backgroundColor: stripeColor }]} />
              <Text style={[styles.statusText, { color: stripeColor }]}>
                {STATUS_LABEL[b.status]}
              </Text>
            </View>
          </View>

          {/* Detail row */}
          <View style={styles.chipsRow}>
            <Chip Icon={CalendarIcon} label={bookedAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} />
            <Chip Icon={ClockIcon}    label={bookedAt.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true })} />
            <Chip Icon={TimerIcon}    label={`${b.duration_minutes >= 60 ? `${b.duration_minutes / 60}h` : `${b.duration_minutes}m`}`} />
            <Chip Icon={CoinsIcon}    label={`${(b.actual_cost ?? b.estimated_cost ?? 0).toFixed(3)} OMR`} highlight={isActive} />
          </View>

          {/* Action strip */}
          {isActive && (
            <View style={styles.activeStrip}>
              <ZapIcon size={13} color={COLORS.primary} strokeWidth={2.5} />
              <Text style={styles.activeStripText}>{t.bookings_session_active_clean}</Text>
            </View>
          )}

          {isConfirmed && (
            <View style={styles.confirmedStrip}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => openCancel(b)}
              >
                <XIcon size={12} color={COLORS.error} strokeWidth={2.5} />
                <Text style={styles.cancelBtnText}>{t.bookings_cancel_btn}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => navigation.navigate('ActiveBooking', { bookingId: b.id })}
              >
                <Text style={styles.viewBtnText}>{t.bookings_view_btn}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [navigation, t, isRTL, locale]);

  // ── Empty state ──────────────────────────────────────────────

  const isEmpty = listItems.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ──────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.bookings_header}</Text>
          <Text style={styles.headerSub}>{bookings.length} {t.bookings_count}</Text>
        </View>
        <View style={styles.headerIcon}>
          <CalendarIcon size={22} color={COLORS.primary} strokeWidth={2} />
        </View>
      </View>

      {/* ── Summary banner (only if there are bookings) ───── */}
      {bookings.length > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryDeco} />
          <SummaryBox value={activeCount}   label={t.bookings_summary_active}   color={COLORS.primary} />
          <View style={styles.summaryDivider} />
          <SummaryBox value={upcomingCount} label={t.bookings_summary_upcoming} color={COLORS.gold} />
          <View style={styles.summaryDivider} />
          <SummaryBox value={bookings.length} label={t.bookings_summary_total}  color="#94a3b8" />
        </View>
      )}

      {/* ── Filter tabs ──────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // row-reverse (not the FlatList-only `inverted` prop) puts the first
        // filter on the right for Arabic.
        contentContainerStyle={[styles.filterRow, isRTL && styles.filterRowRtl]}
        style={styles.filterScroll}
      >
        {FILTER_TABS.map(tab => {
          const on = filter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterTab, on && styles.filterTabActive]}
              onPress={() => setFilter(tab.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${tab.label} (${tab.count})`}
            >
              {/* numberOfLines + shrink:0 keep the label on one line and let the
                  pill size to its text instead of the text being clipped. */}
              <Text
                numberOfLines={1}
                style={[styles.filterText, on && styles.filterTextActive]}
              >
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View style={[styles.filterCount, on && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, on && styles.filterCountTextActive]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Content ──────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 48 }} />
      ) : loadError ? (
        <ErrorView onRetry={() => fetchBookings()} />
      ) : isEmpty ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <CalendarIcon size={36} color={COLORS.textTertiary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>{t.bookings_empty_title}</Text>
          <Text style={styles.emptySub}>
            {filter === 'all' ? t.bookings_empty_sub_all : t.bookings_empty_sub_filter}
          </Text>
          {filter === 'all' && (
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('Map')}>
              <Text style={styles.emptyBtnText}>{t.bookings_go_map}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, i) =>
            item.type === 'section' ? `section-${i}` : item.data.id
          }
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 16 }]}
          showsVerticalScrollIndicator={false}
          onRefresh={() => fetchBookings(true)}
          refreshing={refreshing}
        />
      )}

      {/* ══ Cancel Modal ══════════════════════════════════════ */}
      <Modal
        visible={!!cancelBooking}
        transparent
        animationType="slide"
        onRequestClose={() => setCancelBooking(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => !cancelling && setCancelBooking(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />

              {/* Title */}
              <View style={styles.modalTitleRow}>
                <Text style={styles.modalTitle}>{t.bookings_cancel_modal_title}</Text>
                <TouchableOpacity
                  onPress={() => !cancelling && setCancelBooking(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <XIcon size={20} color={COLORS.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {/* Station name — only when we actually have one to show */}
              {!!(cancelBooking?.station && stationDisplayName(cancelBooking.station, isRTL)) && (
                <View style={styles.cancelStationRow}>
                  <ZapIcon size={14} color={COLORS.primary} strokeWidth={2} />
                  <Text style={styles.cancelStationName} numberOfLines={1}>
                    {stationDisplayName(cancelBooking!.station, isRTL)}
                  </Text>
                </View>
              )}

              {/* Reason label */}
              <Text style={styles.reasonLabel}>{t.bookings_cancel_reason_label}</Text>

              {/* Reason chips. The tick is rendered in a fixed-width slot rather
                  than inserted on selection — inserting it re-flows the row and
                  squeezes the label until it truncates. */}
              <View style={styles.reasonGrid}>
                {CANCEL_REASONS.map(r => {
                  const on = cancelReason === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.reasonChip, on && styles.reasonChipActive]}
                      onPress={() => setCancelReason(r)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.reasonTick}>
                        {on && <CheckIcon size={12} color={COLORS.error} strokeWidth={3} />}
                      </View>
                      <Text style={[styles.reasonText, on && styles.reasonTextActive]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Free-text detail — required for "Other", optional otherwise. */}
              {!!cancelReason && (
                <TextInput
                  style={[styles.reasonInput, isRTL && { textAlign: 'right' }]}
                  value={cancelNote}
                  onChangeText={setCancelNote}
                  placeholder={needsNote ? t.bookings_cancel_note_required_ph : t.bookings_cancel_note_ph}
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                  textAlignVertical="top"
                  maxLength={300}
                />
              )}

              {/* Confirm button */}
              <TouchableOpacity
                style={[
                  styles.cancelConfirmBtn,
                  (!canCancel || cancelling) && styles.cancelConfirmBtnDisabled,
                ]}
                onPress={confirmCancel}
                disabled={!canCancel || cancelling}
              >
                {cancelling
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.cancelConfirmText}>{t.bookings_cancel_confirm}</Text>
                }
              </TouchableOpacity>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────

function SummaryBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.summaryBox}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Chip({ Icon, label, highlight = false }: { Icon: React.ComponentType<any>; label: string; highlight?: boolean }) {
  return (
    <View style={[styles.chip, highlight && styles.chipHighlight]}>
      <Icon size={11} color={highlight ? COLORS.primary : COLORS.textTertiary} strokeWidth={2} />
      <Text style={[styles.chipLabel, highlight && styles.chipLabelHighlight]}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  headerSub:   { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, fontWeight: '500' },
  headerIcon:  { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },

  // Summary banner
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.primaryDark,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  summaryDeco: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -30,
  },
  summaryBox:    { flex: 1, alignItems: 'center', gap: 3 },
  summaryValue:  { fontSize: 26, fontWeight: '800' },
  summaryLabel:  { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '500', textAlign: 'center' },
  summaryDivider:{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 4 },

  // Filter
  // No maxHeight: it clipped the row. The content defines the height instead.
  filterScroll: { flexGrow: 0, marginBottom: 6 },
  filterRow:    { paddingHorizontal: 16, gap: 8, paddingVertical: 4, alignItems: 'center' },
  filterRowRtl: { flexDirection: 'row-reverse' },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    // flexShrink:0 stops the pill being compressed below its text width, which
    // is what cut labels mid-word. Explicit fontFamily (not fontWeight) keeps
    // measurement and rendering on the same font — see constants/typography.
    flexShrink: 0,
    // Short labels ("All") would otherwise render as a tiny pill next to
    // "Completed". minWidth evens them out without forcing equal widths.
    minWidth: 92,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22,
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary, borderColor: COLORS.primary,
    shadowColor: COLORS.primary, shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 3,
  },
  filterText:      { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textSecondary },
  filterTextActive:{ color: '#fff' },
  filterCount: {
    minWidth: 20, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 10, backgroundColor: COLORS.backgroundAlt, alignItems: 'center',
  },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterCountText:   { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textSecondary },
  filterCountTextActive: { color: '#fff' },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 8 },
  sectionLabel:  { fontSize: 12, fontWeight: '800', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionCount:  { backgroundColor: COLORS.primaryBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  sectionCountText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  // Booking card
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardActive: { borderColor: COLORS.primary, borderWidth: 1.5, shadowOpacity: 0.12 },
  cardPast:   { opacity: 0.82 },

  stripe: { width: 4 },

  cardInner: { flex: 1, padding: 14 },

  // Card top
  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  stationIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardMid:     { flex: 1 },
  stationName: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  textDimmed:  { color: COLORS.textSecondary },
  govRow:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
  govText:     { fontSize: 12, color: COLORS.textTertiary },

  // Status badge
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },
  statusText:  { fontSize: 11, fontWeight: '700' },

  // Chips row
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.background, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipHighlight:      { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primaryTint },
  chipLabel:          { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  chipLabelHighlight: { color: COLORS.primary },

  // Active strip
  activeStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: COLORS.primaryTint,
  },
  activeStripText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  // Confirmed strip
  confirmedStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#fecaca',
    backgroundColor: COLORS.errorBg,
  },
  cancelBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.error },
  viewBtn:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: COLORS.primaryBg, borderWidth: 1.5, borderColor: COLORS.primaryTint },
  viewBtnText:  { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // List
  list: { padding: 16, gap: 10, paddingBottom: 40 },

  // Empty
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 36 },
  emptyIconWrap:{ width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.backgroundAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:   { fontSize: 17, fontWeight: '700', color: COLORS.text },
  emptySub:     { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyBtn:     { backgroundColor: COLORS.primary, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 13, marginTop: 6 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Cancel modal
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 28,
  },
  modalHandle:   { width: 40, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:    { fontSize: 20, fontWeight: '800', color: COLORS.text },

  cancelStationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primaryBg, borderRadius: 12, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: COLORS.primaryTint },
  cancelStationName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },

  reasonLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 12 },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  reasonChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  reasonChipActive: { borderColor: COLORS.error, backgroundColor: COLORS.errorBg },
  // Fixed slot so selecting a chip never changes its width (and so never
  // truncates the label).
  reasonTick:       { width: 12, alignItems: 'center', justifyContent: 'center' },
  reasonText:       { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, flexShrink: 0 },
  reasonTextActive: { color: COLORS.error },
  reasonInput: {
    backgroundColor: COLORS.background, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
    padding: 12, minHeight: 76, marginBottom: 20,
    fontSize: 14, color: COLORS.text,
  },

  cancelConfirmBtn:         { backgroundColor: COLORS.error, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  cancelConfirmBtnDisabled: { opacity: 0.45 },
  cancelConfirmText:        { color: '#fff', fontWeight: '700', fontSize: 16 },
});
