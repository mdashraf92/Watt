/**
 * MobileChargeTrackingScreen — "where is my van?"
 *
 * Live position comes over the per-job socket room (realtime.onJob), never the
 * broadcast channel, so only this customer and their driver see the van move.
 * A slow poll runs alongside it: sockets drop on flaky roadside signal, and the
 * one screen where the user must not be left guessing is this one.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import OSMMap, { OSMMapHandle, OSMMarkerSpec, OSMRegion } from '../components/OSMMap';
import { api } from '../lib/api';
import { realtime } from '../lib/realtime';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import type {
  CustomerStackParamList, MobileChargeRequest, MobileChargeStatus,
} from '../types';
import {
  ArrowLeftIcon, PhoneIcon, ZapIcon, CheckIcon, ClockIcon, XIcon,
} from '../components/icons';

type Nav   = NativeStackNavigationProp<CustomerStackParamList, 'MobileChargeTracking'>;
type Route = RouteProp<CustomerStackParamList, 'MobileChargeTracking'>;

// The visible journey, in order. 'pending'/'offered' collapse into one step —
// the customer does not care which van is being asked, only that we are asking.
const STEPS: MobileChargeStatus[] = ['pending', 'assigned', 'en_route', 'arrived', 'charging'];

const stepIndex = (s: MobileChargeStatus) =>
  s === 'offered' ? 0 : Math.max(0, STEPS.indexOf(s));

export default function MobileChargeTrackingScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { requestId } = route.params;
  const { t, isRTL } = useLang();
  const mapRef = useRef<OSMMapHandle>(null);

  const [req, setReq]         = useState<MobileChargeRequest | null>(null);
  const [van, setVan]         = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const data = await api.mobile.get(requestId).catch(() => null);
    if (!data) return;
    setReq(data);
    if (data.driver?.lat != null && data.driver?.lng != null) {
      setVan({ latitude: data.driver.lat, longitude: data.driver.lng });
    }
    return data;
  }, [requestId]);

  useEffect(() => {
    (async () => { await load(); setLoading(false); })();
  }, [load]);

  // Live updates, plus a 20 s safety poll in case the socket quietly dies.
  useEffect(() => {
    const off = realtime.onJob(requestId, {
      onLocation: (l) => setVan({ latitude: l.latitude, longitude: l.longitude }),
      onUpdate:   () => { load(); },
    });
    const timer = setInterval(load, 20_000);
    return () => { off(); clearInterval(timer); };
  }, [requestId, load]);

  // When the job finishes, hand straight over to the receipt.
  useEffect(() => {
    if (req?.status === 'completed') {
      navigation.replace('MobileChargeSummary', {
        requestId,
        kwh:  Number(req.kwh_delivered ?? 0),
        cost: Number(req.cost ?? 0),
      });
    }
  }, [req?.status, req?.kwh_delivered, req?.cost, requestId, navigation]);

  const cancel = () => {
    if (!req) return;
    const feeApplies = req.status === 'en_route' || req.status === 'arrived';
    Alert.alert(
      t.mc_cancel_title,
      feeApplies ? t.mc_cancel_fee.replace('{fee}', Number(req.cancel_fee || 2).toFixed(3)) : t.mc_cancel_free,
      [
        { text: t.mc_cancel_no, style: 'cancel' },
        {
          text: t.mc_cancel_yes, style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await api.mobile.cancel(requestId);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert(
                t.error,
                String(e?.message ?? '').startsWith('TOO_LATE') ? t.mc_cancel_too_late : t.mc_err_generic,
              );
            } finally { setCancelling(false); }
          },
        },
      ],
    );
  };

  if (loading || !req) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }

  const idx      = stepIndex(req.status);
  const finished = req.status === 'cancelled' || req.status === 'no_van';
  const canCancel = !finished && req.status !== 'charging' && req.status !== 'completed';

  const region: OSMRegion = {
    latitude: req.pickup_lat, longitude: req.pickup_lng,
    latitudeDelta: 0.02, longitudeDelta: 0.02,
  };

  const markers: OSMMarkerSpec[] = [
    { id: 'me', latitude: req.pickup_lat, longitude: req.pickup_lng, color: COLORS.primaryDark, icon: 'home' },
    ...(van ? [{ id: 'van', latitude: van.latitude, longitude: van.longitude, color: COLORS.gold, icon: 'zap' as const }] : []),
  ];

  const etaMin = req.eta_at
    ? Math.max(0, Math.round((new Date(req.eta_at).getTime() - Date.now()) / 60_000))
    : null;

  const statusTitle = (t as any)[`mc_status_${req.status}`] ?? '';
  const statusSub   = (t as any)[`mc_status_${req.status}_sub`] ?? '';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.mc_track_title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Status */}
        <View style={styles.statusCard}>
          <View style={[styles.statusTop, { flexDirection: rowDir }]}>
            <View style={[styles.statusIcon, finished && styles.statusIconMuted]}>
              {finished
                ? <XIcon size={22} color={COLORS.textSecondary} strokeWidth={2.5} />
                : req.status === 'charging'
                  ? <ZapIcon size={22} color="#fff" strokeWidth={2.5} />
                  : <ClockIcon size={22} color="#fff" strokeWidth={2.5} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { textAlign: align }]}>{statusTitle}</Text>
              <Text style={[styles.statusSub, { textAlign: align }]}>{statusSub}</Text>
            </View>
          </View>

          {etaMin != null && (req.status === 'en_route' || req.status === 'assigned') && (
            <Text style={[styles.eta, { textAlign: align }]}>
              {t.mc_eta.replace('{min}', String(etaMin))}
            </Text>
          )}

          {/* Progress rail */}
          {!finished && (
            <View style={[styles.rail, { flexDirection: rowDir }]}>
              {STEPS.map((s, i) => (
                <View key={s} style={styles.railItem}>
                  <View style={[styles.dot, i <= idx && styles.dotDone]}>
                    {i < idx && <CheckIcon size={10} color="#fff" strokeWidth={3} />}
                  </View>
                  {i < STEPS.length - 1 && <View style={[styles.bar, i < idx && styles.barDone]} />}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Map — pickup pin plus the van, once one is assigned. */}
        <View style={styles.mapWrap}>
          <OSMMap
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={region}
            markers={markers}
          />
        </View>

        {/* Driver */}
        {req.driver && (
          <View style={styles.driverCard}>
            <Text style={[styles.cardLabel, { textAlign: align }]}>{t.mc_driver_title}</Text>
            <View style={[styles.driverRow, { flexDirection: rowDir }]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTxt}>{(req.driver.name || '?').slice(0, 1)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, { textAlign: align }]}>{req.driver.name}</Text>
                <Text style={[styles.driverVan, { textAlign: align }]}>
                  {t.mc_van_label}: {req.driver.van} · {req.driver.plate}
                </Text>
              </View>
              {!!req.driver.phone && (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => Linking.openURL(`tel:${req.driver!.phone}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t.mc_call_driver}
                >
                  <PhoneIcon size={18} color="#fff" strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Order */}
        <View style={styles.orderCard}>
          <View style={[styles.orderRow, { flexDirection: rowDir }]}>
            <Text style={styles.orderKey}>{t.mc_ordered}</Text>
            <Text style={styles.orderVal}>{Number(req.requested_kwh).toFixed(0)} {t.mc_kwh_unit}</Text>
          </View>
          <View style={[styles.orderRow, { flexDirection: rowDir }]}>
            <Text style={styles.orderKey}>{t.mc_price_total}</Text>
            <Text style={styles.orderVal}>{Number(req.estimated_cost).toFixed(3)} OMR</Text>
          </View>
          <View style={[styles.orderRow, { flexDirection: rowDir }]}>
            <Text style={styles.orderKey}>{t.mc_held}</Text>
            <Text style={styles.orderVal}>{Number(req.held_amount).toFixed(3)} OMR</Text>
          </View>
          {!!req.address_text && (
            <Text style={[styles.orderAddr, { textAlign: align }]}>{req.address_text}</Text>
          )}
        </View>

        {canCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={cancel} disabled={cancelling}>
            {cancelling
              ? <ActivityIndicator size="small" color={COLORS.error} />
              : <Text style={styles.cancelTxt}>{t.mc_cancel}</Text>}
          </TouchableOpacity>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text },
  scroll: { padding: 16, gap: 14 },

  statusCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  statusTop: { alignItems: 'center', gap: 12 },
  statusIcon: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  statusIconMuted: { backgroundColor: COLORS.backgroundAlt },
  statusTitle: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.text },
  statusSub: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, marginTop: 2, lineHeight: 18 },
  eta: { fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.primary, marginTop: 10 },

  rail: { alignItems: 'center', marginTop: 16 },
  railItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  dotDone: { backgroundColor: COLORS.primary },
  bar: { flex: 1, height: 3, backgroundColor: COLORS.borderStrong, marginHorizontal: 3, borderRadius: 2 },
  barDone: { backgroundColor: COLORS.primary },

  mapWrap: {
    height: 220, borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundAlt,
  },

  driverCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  cardLabel: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textTertiary, marginBottom: 10 },
  driverRow: { alignItems: 'center', gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.primary },
  driverName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text },
  driverVan: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  callBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  orderCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  orderRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  orderKey: { fontFamily: FONTS.regular, fontSize: 13.5, color: COLORS.textSecondary },
  orderVal: { fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.text },
  orderAddr: {
    fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textTertiary,
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border,
  },

  cancelBtn: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.error, backgroundColor: COLORS.card,
  },
  cancelTxt: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.error },
});
