/**
 * NotificationsScreen — the in-app inbox behind the map bell.
 *
 * Role filtering is implicit: the API only ever returns rows addressed to the
 * signed-in user, so a host sees host events and an admin sees admin events
 * without the client needing to know anything about roles.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { api, type AppNotification } from '../lib/api';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import {
  ArrowLeftIcon, BellIcon, CalendarIcon, ZapIcon, WalletIcon,
  ClockIcon, TimerIcon, AwardIcon,
} from '../components/icons';
import ErrorView from '../components/ErrorView';

const PAGE = 30;

// Per-event visual treatment. Unknown kinds fall back to the bell, so a new
// backend event type renders sensibly without a client release.
const KIND_ICON: Record<string, { Icon: any; color: string; bg: string }> = {
  booking_confirmed: { Icon: CalendarIcon, color: COLORS.primary,   bg: COLORS.primaryBg },
  host_new_booking:  { Icon: CalendarIcon, color: COLORS.primary,   bg: COLORS.primaryBg },
  charge_start_soon: { Icon: ClockIcon,    color: COLORS.goldDark,  bg: COLORS.goldTint },
  charge_end_soon:   { Icon: TimerIcon,    color: COLORS.goldDark,  bg: COLORS.goldTint },
  charge_finished:   { Icon: ZapIcon,      color: COLORS.available, bg: COLORS.successBg },
  wallet_topped_up:  { Icon: WalletIcon,   color: COLORS.primary,   bg: COLORS.primaryBg },
  application_update:{ Icon: AwardIcon,    color: COLORS.primary,   bg: COLORS.primaryBg },
};

function relativeTime(iso: string, isRTL: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1)  return isRTL ? 'الآن' : 'now';
  if (m < 60) return isRTL ? `قبل ${m} د` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return isRTL ? `قبل ${h} س` : `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7)  return isRTL ? `قبل ${d} ي` : `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const { t, isRTL } = useLang();

  const [items,   setItems]   = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor,  setCursor]  = useState<string | null>(null);
  const [error,   setError]   = useState(false);
  // Guards against a second fetch firing while one is in flight (FlatList can
  // call onEndReached repeatedly during a single fling).
  const fetching = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'more') => {
    if (fetching.current) return;
    if (mode === 'more' && !cursor) return;   // no further pages
    fetching.current = true;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more')    setLoadingMore(true);
    try {
      const res: any = await api.notifications.list({
        limit: PAGE,
        before: mode === 'more' ? cursor : null,
      });
      const batch: AppNotification[] = res?.notifications ?? [];
      setItems(prev => (mode === 'more' ? [...prev, ...batch] : batch));
      setCursor(res?.next_before ?? null);
      setError(false);
    } catch {
      if (mode !== 'more') setError(true);
    } finally {
      fetching.current = false;
      setLoading(false); setRefreshing(false); setLoadingMore(false);
    }
  }, [cursor]);

  useEffect(() => { load('initial'); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // Opening the inbox marks everything read. Optimistic: the badge should clear
  // instantly, and a failed write just means they stay unread until next time.
  useEffect(() => {
    if (loading || error) return;
    if (!items.some(n => !n.read_at)) return;
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: now })));
    api.notifications.markAllRead().catch(() => {});
  }, [loading, error]);   // eslint-disable-line react-hooks/exhaustive-deps

  const renderItem = ({ item }: { item: AppNotification }) => {
    const v = KIND_ICON[item.kind] ?? { Icon: BellIcon, color: COLORS.textSecondary, bg: COLORS.backgroundAlt };
    const unread = !item.read_at;
    return (
      <View style={[styles.row, isRTL && styles.rowRev, unread && styles.rowUnread]}>
        <View style={[styles.iconWrap, { backgroundColor: v.bg }]}>
          <v.Icon size={18} color={v.color} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, isRTL && styles.rtlText]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.body, isRTL && styles.rtlText]}>{item.body}</Text>
          <Text style={[styles.time, isRTL && styles.rtlText]}>{relativeTime(item.created_at, isRTL)}</Text>
        </View>
        {unread && <View style={styles.dot} />}
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={[styles.header, isRTL && styles.rowRev]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t.a11y_back}
        >
          {/* Back always points "away" from the reading direction. Icons take no
              style prop, so the RTL flip lives on a wrapper. */}
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.notif_inbox_title}</Text>
        {/* Spacer keeps the title optically centred against the back button. */}
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : error ? (
        <View style={styles.center}><ErrorView onRetry={() => load('initial')} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={n => n.id}
          renderItem={renderItem}
          contentContainerStyle={items.length ? styles.list : styles.listEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.primary} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => load('more')}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={COLORS.primary} /> : null}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIcon}><BellIcon size={28} color={COLORS.textSecondary} strokeWidth={1.6} /></View>
              <Text style={styles.emptyTitle}>{t.notif_empty_title}</Text>
              <Text style={styles.emptyText}>{t.notif_empty_sub}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  headerTitle: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  list: { padding: 12, gap: 8 },
  listEmpty: { flexGrow: 1 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  rowRev: { flexDirection: 'row-reverse' },
  rowUnread: { borderColor: COLORS.primaryTint, backgroundColor: COLORS.primaryBg },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.text },
  body:  { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginTop: 2 },
  time:  { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textSecondary, marginTop: 6 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginTop: 6 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.backgroundAlt,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  emptyTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text },
  emptyText:  { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
});
