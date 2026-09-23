/**
 * TripDetailScreen — a saved trip, and booking its stops as you reach them.
 *
 * Only the next unbooked stop offers a Book button. Reserving a connector three
 * hundred kilometres ahead relies on an ETA that will drift by an hour, and a
 * missed reservation costs the customer a no-show penalty
 * (release_no_show_bookings). The server enforces the same rule, so this is the
 * UI agreeing with it rather than the only thing holding the line.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { api } from '../lib/api';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import type { CustomerStackParamList, SavedTrip, SavedTripStop, Station } from '../types';
import {
  ArrowLeftIcon, CheckIcon, MapPinIcon, ClockIcon, WalletIcon, InfoIcon, ZapIcon,
} from '../components/icons';

type Nav   = NativeStackNavigationProp<CustomerStackParamList, 'TripDetail'>;
type Route = RouteProp<CustomerStackParamList, 'TripDetail'>;

export default function TripDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { tripId } = route.params;
  const { t, isRTL } = useLang();

  const [trip, setTrip]   = useState<SavedTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]   = useState<number | null>(null);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const data = await api.trips.get(tripId).catch(() => null);
    setTrip(data);
    setLoading(false);
  }, [tripId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stops = trip?.stops ?? [];
  // The one stop that may be booked right now.
  const nextSeq = stops.find(s => s.status === 'planned')?.seq ?? null;

  // Booking a stop means opening the normal booking flow for that charger; the
  // trip only records which booking belongs to which stop.
  const book = async (stop: SavedTripStop) => {
    if (!stop.station_id) {
      // Private listings are booked from their own screen, which needs the
      // listing context this screen does not carry.
      Alert.alert(t.tp_book_next, t.tp_book_in_order);
      return;
    }
    setBusy(stop.seq);
    try {
      const station = await api.stations.get(stop.station_id) as Station;
      navigation.navigate('Booking', { station });
    } catch {
      Alert.alert(t.error, t.tp_err_generic);
    } finally { setBusy(null); }
  };

  const mark = async (stop: SavedTripStop, action: 'done' | 'skipped') => {
    setBusy(stop.seq);
    try { await api.trips.markStop(tripId, stop.seq, action); await load(); }
    catch { Alert.alert(t.error, t.tp_err_generic); }
    finally { setBusy(null); }
  };

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }

  const plan = trip.plan ?? ({} as any);
  const hours = Math.floor((plan.total_minutes ?? 0) / 60);
  const mins  = (plan.total_minutes ?? 0) % 60;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: align }]} numberOfLines={1}>
          {trip.name || `${trip.from_label} → ${trip.to_label}`}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.summary, { flexDirection: rowDir }]}>
          <Metric Icon={MapPinIcon} label={t.tp_summary_distance} value={`${plan.distance_km ?? 0} km`} />
          <View style={styles.metricDivider} />
          <Metric Icon={ClockIcon} label={t.tp_summary_time} value={hours > 0 ? `${hours}h ${mins}m` : `${mins}m`} />
          <View style={styles.metricDivider} />
          <Metric Icon={WalletIcon} label={t.tp_summary_cost} value={Number(plan.total_cost ?? 0).toFixed(3)} />
        </View>

        {stops.length === 0 ? (
          <View style={styles.okCard}>
            <Text style={styles.okTitle}>{t.tp_no_stops}</Text>
            <Text style={styles.okSub}>{t.tp_no_stops_sub}</Text>
          </View>
        ) : (
          <>
            <View style={[styles.hintRow, { flexDirection: rowDir }]}>
              <InfoIcon size={15} color={COLORS.textSecondary} strokeWidth={2} />
              <Text style={[styles.hintTxt, { textAlign: align }]}>{t.tp_book_in_order}</Text>
            </View>

            {stops.map(s => {
              const isNext = s.seq === nextSeq;
              const done   = s.status === 'done' || s.status === 'skipped';
              return (
                <View key={s.id} style={[styles.stopCard, isNext && styles.stopCardNext, done && styles.stopCardDone]}>
                  <View style={[styles.stopHead, { flexDirection: rowDir }]}>
                    <View style={[styles.badge, done && styles.badgeDone, s.status === 'booked' && styles.badgeBooked]}>
                      {done
                        ? <CheckIcon size={13} color="#fff" strokeWidth={3} />
                        : <Text style={styles.badgeTxt}>{s.seq + 1}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.stopName, { textAlign: align }]} numberOfLines={1}>{s.name}</Text>
                      <Text style={[styles.stopMeta, { textAlign: align }]}>
                        {t.tp_at_km.replace('{km}', String(Math.round(Number(s.along_km))))}
                        {s.arrive_soc != null ? ` · ${s.arrive_soc}% → ${s.depart_soc}%` : ''}
                      </Text>
                    </View>
                    {s.status === 'booked' && (
                      <View style={styles.bookedChip}>
                        <Text style={styles.bookedChipTxt}>{t.tp_booked}</Text>
                      </View>
                    )}
                  </View>

                  {!done && (
                    <View style={[styles.actions, { flexDirection: rowDir }]}>
                      {isNext && s.status === 'planned' && (
                        <TouchableOpacity
                          style={styles.primaryBtn}
                          onPress={() => book(s)}
                          disabled={busy === s.seq}
                        >
                          {busy === s.seq
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <>
                                <ZapIcon size={14} color="#fff" strokeWidth={2.4} />
                                <Text style={styles.primaryTxt}>{t.tp_book_next}</Text>
                              </>}
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.ghostBtn}
                        onPress={() => mark(s, 'done')}
                        disabled={busy === s.seq}
                      >
                        <Text style={styles.ghostTxt}>{t.tp_mark_done}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.ghostBtn}
                        onPress={() => mark(s, 'skipped')}
                        disabled={busy === s.seq}
                      >
                        <Text style={styles.ghostTxt}>{t.tp_skip}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
        <View style={{ height: 28 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ Icon, label, value }: { Icon: any; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Icon size={16} color={COLORS.primary} strokeWidth={2.2} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 17, color: COLORS.text },
  scroll: { padding: 16, gap: 12 },

  summary: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 16, alignItems: 'center',
  },
  metric: { flex: 1, alignItems: 'center', gap: 4 },
  metricValue: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text },
  metricLabel: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textTertiary },
  metricDivider: { width: 1, height: 34, backgroundColor: COLORS.border },

  okCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    padding: 22, alignItems: 'center',
  },
  okTitle: { fontFamily: FONTS.bold, fontSize: 15.5, color: COLORS.text },
  okSub: {
    fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 5, lineHeight: 19,
  },

  hintRow: { alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
  hintTxt: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },

  stopCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  stopCardNext: { borderColor: COLORS.primary, borderWidth: 1.5 },
  stopCardDone: { opacity: 0.6 },
  stopHead: { alignItems: 'center', gap: 11 },
  badge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeBooked: { backgroundColor: COLORS.gold },
  badgeDone: { backgroundColor: COLORS.primary },
  badgeTxt: { fontFamily: FONTS.bold, fontSize: 12, color: '#fff' },
  stopName: { fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.text },
  stopMeta: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 },
  bookedChip: {
    backgroundColor: COLORS.goldTint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  bookedChipTxt: { fontFamily: FONTS.bold, fontSize: 10.5, color: COLORS.goldDark },

  actions: { gap: 8, marginTop: 14 },
  primaryBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.primary,
  },
  primaryTxt: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  ghostBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  ghostTxt: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textSecondary },
});
