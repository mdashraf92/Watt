/**
 * OperatorJobScreen — one callout, from "start driving" to "bill the customer".
 *
 * Exactly one action is available at a time, matching the server's state machine
 * (set_mobile_charge_status only permits assigned→en_route→arrived→charging).
 * A driver holding a phone at the roadside should never have to work out which
 * of five buttons applies.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as Location from 'expo-location';
import OSMMap, { OSMMapHandle, OSMMarkerSpec, OSMRegion } from '../../components/OSMMap';
import GradientButton from '../../components/GradientButton';
import { api } from '../../lib/api';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { useLang } from '../../context/LanguageContext';
import type { OperatorJob, OperatorStackParamList } from '../../types';
import {
  ArrowLeftIcon, PhoneIcon, NavigationIcon, MapPinIcon, ZapIcon,
} from '../../components/icons';

type Nav   = NativeStackNavigationProp<OperatorStackParamList, 'OperatorJob'>;
type Route = RouteProp<OperatorStackParamList, 'OperatorJob'>;

export default function OperatorJobScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { requestId } = route.params;
  const { t, isRTL } = useLang();
  const mapRef = useRef<OSMMapHandle>(null);

  const [job, setJob]         = useState<OperatorJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [routing, setRouting] = useState(false);

  // Completion inputs
  const [kwh, setKwh]         = useState('');
  const [meter, setMeter]     = useState('');
  const [battery, setBattery] = useState('');
  const [eta, setEta]         = useState('');

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const data = await api.operator.job(requestId).catch(() => null);
    if (data) {
      setJob(data);
      // Pre-fill with what was ordered — the usual case is delivering exactly
      // that, and the driver can still type a lower figure.
      setKwh(prev => prev || String(Number(data.requested_kwh).toFixed(0)));
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => { load(); }, [load]);

  const currentPosition = async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return undefined;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .catch(() => null);
    return loc ? { latitude: loc.coords.latitude, longitude: loc.coords.longitude } : undefined;
  };

  const advance = async (status: 'en_route' | 'arrived' | 'charging') => {
    setBusy(true);
    try {
      const at = await currentPosition();
      const etaMin = status === 'en_route' && eta ? parseInt(eta, 10) : undefined;
      await api.operator.setStatus(requestId, status, {
        ...at,
        ...(Number.isFinite(etaMin as number) ? { eta_minutes: etaMin } : {}),
      });
      await load();
    } catch (e: any) {
      Alert.alert(t.error, e?.message ?? t.mc_err_generic);
    } finally { setBusy(false); }
  };

  // Draw the road to the customer in-app, reusing the same OSRM proxy the
  // customer's directions use.
  const navigate = async () => {
    if (!job) return;
    setRouting(true);
    try {
      const at = await currentPosition();
      if (!at) { Alert.alert(t.error, t.map_directions_need_location); return; }
      const res: any = await api.routing.route(at, {
        latitude: job.pickup_lat, longitude: job.pickup_lng,
      });
      if (res?.coordinates?.length) mapRef.current?.setRoute(res.coordinates);
    } catch (e: any) {
      const notConfigured = e?.status === 503 || /not configured/i.test(e?.message ?? '');
      Alert.alert(t.error, notConfigured ? t.map_directions_unavailable : t.map_directions_failed);
    } finally { setRouting(false); }
  };

  const complete = async () => {
    if (!job) return;
    const delivered = parseFloat(kwh);
    if (!Number.isFinite(delivered) || delivered < 0) return;
    Alert.alert(
      t.op_complete,
      t.op_complete_confirm.replace('{kwh}', delivered.toFixed(1)),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.confirm,
          onPress: async () => {
            setBusy(true);
            try {
              await api.operator.complete(requestId, {
                kwh: delivered,
                battery_end: battery ? parseInt(battery, 10) : null,
                meter_kwh: meter ? parseFloat(meter) : null,
              });
              navigation.goBack();
            } catch (e: any) {
              Alert.alert(t.error, e?.message ?? t.mc_err_generic);
            } finally { setBusy(false); }
          },
        },
      ],
    );
  };

  if (loading || !job) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }

  const region: OSMRegion = {
    latitude: job.pickup_lat, longitude: job.pickup_lng,
    latitudeDelta: 0.02, longitudeDelta: 0.02,
  };
  const markers: OSMMarkerSpec[] = [
    { id: 'pickup', latitude: job.pickup_lat, longitude: job.pickup_lng, color: COLORS.primary, icon: 'zap' },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.op_current_job}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Status */}
          <View style={styles.statusPill}>
            <Text style={styles.statusPillTxt}>
              {(t as any)[`mc_status_${job.status}`] ?? job.status}
            </Text>
          </View>

          {/* Map + navigate */}
          <View style={styles.mapWrap}>
            <OSMMap
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              markers={markers}
              showsUserLocation
            />
          </View>
          <TouchableOpacity style={[styles.navBtn, { flexDirection: rowDir }]} onPress={navigate} disabled={routing}>
            {routing
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <NavigationIcon size={17} color={COLORS.primary} strokeWidth={2.4} />}
            <Text style={styles.navTxt}>{t.op_navigate}</Text>
          </TouchableOpacity>

          {/* Customer */}
          <View style={styles.card}>
            <Text style={[styles.cardLabel, { textAlign: align }]}>{t.op_customer}</Text>
            <View style={[styles.custRow, { flexDirection: rowDir }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.custName, { textAlign: align }]}>{job.customer_name}</Text>
                {!!(job.car_make || job.car_model) && (
                  <Text style={[styles.custCar, { textAlign: align }]}>
                    {[job.car_make, job.car_model, job.connector_type].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              {!!job.customer_phone && (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => Linking.openURL(`tel:${job.customer_phone}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t.op_call_customer}
                >
                  <PhoneIcon size={18} color="#fff" strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.addrRow, { flexDirection: rowDir }]}>
              <MapPinIcon size={15} color={COLORS.textSecondary} strokeWidth={2} />
              <Text style={[styles.addrTxt, { textAlign: align }]}>
                {job.address_text || `${job.pickup_lat.toFixed(5)}, ${job.pickup_lng.toFixed(5)}`}
              </Text>
            </View>
            {!!job.notes && <Text style={[styles.notes, { textAlign: align }]}>“{job.notes}”</Text>}
          </View>

          {/* Order */}
          <View style={styles.card}>
            <View style={[styles.orderRow, { flexDirection: rowDir }]}>
              <Text style={styles.orderKey}>{t.op_ordered_label}</Text>
              <Text style={styles.orderVal}>{Number(job.requested_kwh).toFixed(0)} {t.mc_kwh_unit}</Text>
            </View>
          </View>

          {/* The one action that applies right now */}
          {job.status === 'assigned' && (
            <>
              <TextInput
                style={[styles.input, { textAlign: align }]}
                placeholder={t.op_eta_label}
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="number-pad"
                value={eta}
                onChangeText={setEta}
                maxLength={3}
              />
              <GradientButton label={t.op_set_en_route} onPress={() => advance('en_route')} loading={busy}
                icon={<NavigationIcon size={18} color="#fff" strokeWidth={2.4} />} style={{ marginTop: 12 }} />
            </>
          )}
          {job.status === 'en_route' && (
            <GradientButton label={t.op_set_arrived} onPress={() => advance('arrived')} loading={busy}
              icon={<MapPinIcon size={18} color="#fff" strokeWidth={2.4} />} style={{ marginTop: 12 }} />
          )}
          {job.status === 'arrived' && (
            <GradientButton label={t.op_set_charging} onPress={() => advance('charging')} loading={busy}
              icon={<ZapIcon size={18} color="#fff" strokeWidth={2.5} />} style={{ marginTop: 12 }} />
          )}

          {/* Billing */}
          {job.status === 'charging' && (
            <View style={styles.card}>
              <Text style={[styles.cardLabel, { textAlign: align }]}>{t.op_delivered_label}</Text>
              <TextInput
                style={[styles.input, { textAlign: align, marginTop: 8 }]}
                keyboardType="decimal-pad"
                value={kwh}
                onChangeText={setKwh}
                maxLength={6}
              />
              <Text style={[styles.hint, { textAlign: align }]}>
                {t.op_complete_hint.replace('{kwh}', Number(job.requested_kwh).toFixed(0))}
              </Text>

              <Text style={[styles.cardLabel, { textAlign: align, marginTop: 14 }]}>{t.op_meter_label}</Text>
              <TextInput
                style={[styles.input, { textAlign: align, marginTop: 8 }]}
                keyboardType="decimal-pad"
                value={meter}
                onChangeText={setMeter}
                maxLength={6}
              />

              <Text style={[styles.cardLabel, { textAlign: align, marginTop: 14 }]}>{t.op_battery_label}</Text>
              <TextInput
                style={[styles.input, { textAlign: align, marginTop: 8 }]}
                keyboardType="number-pad"
                value={battery}
                onChangeText={setBattery}
                maxLength={3}
              />

              <GradientButton label={t.op_complete} onPress={complete} loading={busy} style={{ marginTop: 18 }} />
            </View>
          )}

          <View style={{ height: 28 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: { padding: 16, gap: 12 },

  statusPill: {
    alignSelf: 'center', backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
  },
  statusPillTxt: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.primary },

  mapWrap: {
    height: 200, borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundAlt,
  },
  navBtn: {
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.primaryTint, backgroundColor: COLORS.card,
  },
  navTxt: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary },

  card: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  cardLabel: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textTertiary },
  custRow: { alignItems: 'center', gap: 12, marginTop: 8 },
  custName: { fontFamily: FONTS.bold, fontSize: 15.5, color: COLORS.text },
  custCar: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  callBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  addrRow: {
    alignItems: 'flex-start', gap: 7, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  addrTxt: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  notes: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textTertiary, marginTop: 8, fontStyle: 'italic' },

  orderRow: { justifyContent: 'space-between', alignItems: 'center' },
  orderKey: { fontFamily: FONTS.regular, fontSize: 13.5, color: COLORS.textSecondary },
  orderVal: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text },

  input: {
    backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: FONTS.medium, fontSize: 16, color: COLORS.text,
  },
  hint: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary, marginTop: 6 },
});
