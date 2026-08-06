/**
 * OperatorHomeScreen — the driver's whole working day on one screen.
 *
 * Three states, in priority order: a job in hand, an offer counting down, or
 * waiting. Location is streamed while on duty, which is what makes the customer's
 * tracking map move — see the heartbeat effect below for why it is foreground-only.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { api } from '../../lib/api';
import { realtime } from '../../lib/realtime';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { useLang } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTabBarHeight } from '../../navigation/tabBarLayout';
import type { OperatorJob, OperatorStackParamList, ServiceVan } from '../../types';
import {
  ZapIcon, MapPinIcon, ClockIcon, BatteryChargingIcon, InfoIcon, ChevronRightIcon,
} from '../../components/icons';

type Nav = NativeStackNavigationProp<OperatorStackParamList>;

// How often the van reports in. 15 s keeps the customer's map convincing without
// draining a phone that is on the road all day.
const HEARTBEAT_MS = 15_000;

export default function OperatorHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { t, isRTL } = useLang();
  const { profile } = useAuth();
  const tabBarHeight = useTabBarHeight();

  const [van, setVan]         = useState<ServiceVan | null>(null);
  const [job, setJob]         = useState<OperatorJob | null>(null);
  const [offer, setOffer]     = useState<(OperatorJob & { distance_km: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [countdown, setCountdown] = useState(0);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const [me, jobs] = await Promise.all([
      api.operator.me().catch(() => null),
      api.operator.jobs().catch(() => null),
    ]);
    if (me) { setVan(me.van); setJob(me.active_job); }
    setOffer(jobs?.offered ?? null);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // A new offer can arrive while the driver is staring at the screen, so listen
  // as well as poll — the push alone would only help if the app were closed.
  useEffect(() => {
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  // Offer countdown. The server is the authority on expiry; this just stops the
  // driver from tapping Accept on something that has already lapsed.
  useEffect(() => {
    if (!offer?.offer_expires_at) { setCountdown(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.round(
        (new Date(offer.offer_expires_at!).getTime() - Date.now()) / 1000));
      setCountdown(left);
      if (left === 0) { setOffer(null); load(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offer?.offer_expires_at, load]);

  // ── Location heartbeat ───────────────────────────────────────────────────
  // Foreground only, deliberately. Background location would need
  // expo-task-manager plus a "collects location in the background" declaration
  // in both stores, which is a bigger review conversation than this feature
  // needs on day one. The driver keeps the app open on the dash mount; when the
  // app is backgrounded the customer simply sees the last known position.
  const onDuty = van?.status === 'available' || van?.status === 'on_job';
  const watcher = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!onDuty) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      watcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: HEARTBEAT_MS, distanceInterval: 25 },
        (loc) => {
          api.operator.location(loc.coords.latitude, loc.coords.longitude).catch(() => {
            /* a dropped ping is not worth telling the driver about — the next
               one lands in 15 s, and the customer keeps the last position */
          });
        },
      );
    })();
    return () => {
      cancelled = true;
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [onDuty]);

  // Job state changes pushed from the server (e.g. the customer cancelled).
  useEffect(() => {
    if (!job) return;
    const off = realtime.onJob(job.id, { onUpdate: () => load() });
    return off;
  }, [job?.id, load]);

  const toggleDuty = async (next: boolean) => {
    setBusy(true);
    try {
      let at: { latitude: number; longitude: number } | undefined;
      if (next) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            .catch(() => null);
          if (loc) at = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        }
      }
      const updated = await api.operator.duty(next, at);
      setVan(updated);
      load();
    } catch (e: any) {
      Alert.alert(t.error, String(e?.message ?? '').startsWith('BUSY') ? t.op_duty_busy : t.mc_err_generic);
    } finally { setBusy(false); }
  };

  const accept = async () => {
    if (!offer) return;
    setBusy(true);
    try {
      const res = await api.operator.accept(offer.id);
      if (res.taken) {
        Alert.alert(t.op_home_title, t.op_job_taken);
        setOffer(null);
        load();
        return;
      }
      setOffer(null);
      navigation.navigate('OperatorJob', { requestId: offer.id });
    } catch { Alert.alert(t.error, t.mc_err_generic); }
    finally { setBusy(false); }
  };

  const decline = async () => {
    if (!offer) return;
    setBusy(true);
    try { await api.operator.decline(offer.id); setOffer(null); load(); }
    catch { /* the offer lapses on its own anyway */ }
    finally { setBusy(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }

  const chargePct = van ? Math.round((van.current_kwh / Math.max(van.capacity_kwh, 1)) * 100) : 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor={COLORS.primary}
          />
        }
      >
        <Text style={[styles.greeting, { textAlign: align }]}>
          {profile?.full_name || t.op_home_title}
        </Text>

        {!van ? (
          <View style={styles.noVanCard}>
            <InfoIcon size={22} color={COLORS.goldDark} strokeWidth={2} />
            <Text style={[styles.noVanTitle, { textAlign: align }]}>{t.op_no_van_title}</Text>
            <Text style={[styles.noVanSub, { textAlign: align }]}>{t.op_no_van_sub}</Text>
          </View>
        ) : (
          <>
            {/* Duty + van */}
            <View style={styles.dutyCard}>
              <View style={[styles.dutyRow, { flexDirection: rowDir }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dutyLabel, { textAlign: align }]}>
                    {onDuty ? t.op_duty_on : t.op_duty_off}
                  </Text>
                  <Text style={[styles.dutyHint, { textAlign: align }]}>
                    {onDuty ? t.op_duty_on_hint : t.op_duty_off_hint}
                  </Text>
                </View>
                <Switch
                  value={onDuty}
                  onValueChange={toggleDuty}
                  disabled={busy}
                  trackColor={{ false: COLORS.borderStrong, true: COLORS.primaryTint }}
                  thumbColor={onDuty ? COLORS.primary : '#f4f4f4'}
                />
              </View>

              <View style={styles.vanDivider} />

              <View style={[styles.vanRow, { flexDirection: rowDir }]}>
                <BatteryChargingIcon size={18} color={COLORS.primary} strokeWidth={2} />
                <Text style={[styles.vanName, { textAlign: align }]}>
                  {van.label} · {van.plate}
                </Text>
                <Text style={styles.vanKwh}>
                  {Number(van.current_kwh).toFixed(0)} / {Number(van.capacity_kwh).toFixed(0)} kWh
                </Text>
              </View>
              <View style={styles.gaugeTrack}>
                <View style={[styles.gaugeFill, { width: `${chargePct}%` }]} />
              </View>
            </View>

            {/* Job in hand — always wins the screen */}
            {job ? (
              <TouchableOpacity
                style={styles.jobCard}
                onPress={() => navigation.navigate('OperatorJob', { requestId: job.id })}
                activeOpacity={0.85}
              >
                <View style={[styles.jobHead, { flexDirection: rowDir }]}>
                  <View style={styles.jobIcon}>
                    <ZapIcon size={20} color="#fff" strokeWidth={2.5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.jobLabel, { textAlign: align }]}>{t.op_current_job}</Text>
                    <Text style={[styles.jobStatus, { textAlign: align }]}>
                      {(t as any)[`mc_status_${job.status}`] ?? job.status}
                    </Text>
                  </View>
                  <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
                    <ChevronRightIcon size={18} color={COLORS.textTertiary} strokeWidth={2} />
                  </View>
                </View>
                <View style={[styles.jobMeta, { flexDirection: rowDir }]}>
                  <MapPinIcon size={15} color={COLORS.textSecondary} strokeWidth={2} />
                  <Text style={[styles.jobAddr, { textAlign: align }]} numberOfLines={2}>
                    {job.address_text || `${job.pickup_lat.toFixed(4)}, ${job.pickup_lng.toFixed(4)}`}
                  </Text>
                </View>
              </TouchableOpacity>

            ) : offer ? (
              /* Offer on the table */
              <View style={styles.offerCard}>
                <View style={[styles.offerHead, { flexDirection: rowDir }]}>
                  <Text style={styles.offerTag}>{t.op_new_job}</Text>
                  <View style={[styles.offerTimer, { flexDirection: rowDir }]}>
                    <ClockIcon size={13} color={COLORS.goldDark} strokeWidth={2.4} />
                    <Text style={styles.offerTimerTxt}>
                      {t.op_job_expires.replace('{s}', String(countdown))}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.offerKwh, { textAlign: align }]}>
                  {Number(offer.requested_kwh).toFixed(0)} {t.mc_kwh_unit}
                </Text>
                <Text style={[styles.offerDist, { textAlign: align }]}>
                  {t.op_job_distance.replace('{km}', Number(offer.distance_km ?? 0).toFixed(1))}
                </Text>
                {!!offer.address_text && (
                  <Text style={[styles.offerAddr, { textAlign: align }]}>{offer.address_text}</Text>
                )}
                {!!(offer.car_make || offer.car_model) && (
                  <Text style={[styles.offerCar, { textAlign: align }]}>
                    {[offer.car_make, offer.car_model, offer.connector_type].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {!!offer.notes && (
                  <Text style={[styles.offerNotes, { textAlign: align }]}>“{offer.notes}”</Text>
                )}

                <View style={[styles.offerBtns, { flexDirection: rowDir }]}>
                  <TouchableOpacity style={styles.declineBtn} onPress={decline} disabled={busy}>
                    <Text style={styles.declineTxt}>{t.op_job_decline}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.acceptBtn, (busy || countdown === 0) && { opacity: 0.5 }]}
                    onPress={accept}
                    disabled={busy || countdown === 0}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.acceptTxt}>{t.op_job_accept}</Text>}
                  </TouchableOpacity>
                </View>
              </View>

            ) : (
              <View style={styles.waitCard}>
                <View style={styles.waitIcon}>
                  <ClockIcon size={26} color={COLORS.primary} strokeWidth={2} />
                </View>
                <Text style={styles.waitTitle}>
                  {onDuty ? t.op_waiting_title : t.op_duty_off}
                </Text>
                <Text style={styles.waitSub}>
                  {onDuty ? t.op_waiting_sub : t.op_duty_off_hint}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 14 },
  greeting: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text, marginBottom: 2 },

  noVanCard: {
    backgroundColor: COLORS.goldBg, borderRadius: 18, borderWidth: 1, borderColor: COLORS.goldTint,
    padding: 18, gap: 8,
  },
  noVanTitle: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.goldDark },
  noVanSub: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  dutyCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  dutyRow: { alignItems: 'center', gap: 12 },
  dutyLabel: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text },
  dutyHint: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  vanDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14 },
  vanRow: { alignItems: 'center', gap: 8 },
  vanName: { flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.text },
  vanKwh: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.primary },
  gaugeTrack: {
    height: 7, borderRadius: 4, backgroundColor: COLORS.backgroundAlt, marginTop: 10, overflow: 'hidden',
  },
  gaugeFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.primary },

  jobCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1.5, borderColor: COLORS.primary, padding: 16,
  },
  jobHead: { alignItems: 'center', gap: 12 },
  jobIcon: {
    width: 44, height: 44, borderRadius: 15, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  jobLabel: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textTertiary },
  jobStatus: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text, marginTop: 2 },
  jobMeta: { alignItems: 'flex-start', gap: 7, marginTop: 12 },
  jobAddr: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },

  offerCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 2, borderColor: COLORS.gold, padding: 18,
  },
  offerHead: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  offerTag: {
    fontFamily: FONTS.bold, fontSize: 11, color: COLORS.goldDark, letterSpacing: 0.6,
    backgroundColor: COLORS.goldTint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    overflow: 'hidden',
  },
  offerTimer: { alignItems: 'center', gap: 5 },
  offerTimerTxt: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.goldDark },
  offerKwh: { fontFamily: FONTS.bold, fontSize: 30, color: COLORS.text },
  offerDist: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.primary, marginTop: 2 },
  offerAddr: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, marginTop: 8, lineHeight: 18 },
  offerCar: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textSecondary, marginTop: 6 },
  offerNotes: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textTertiary, marginTop: 6, fontStyle: 'italic' },
  offerBtns: { gap: 10, marginTop: 16 },
  declineBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  declineTxt: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textSecondary },
  acceptBtn: {
    flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
    borderRadius: 14, backgroundColor: COLORS.primary,
  },
  acceptTxt: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },

  waitCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    padding: 28, alignItems: 'center',
  },
  waitIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  waitTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text },
  waitSub: {
    fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 6, lineHeight: 19,
  },
});
