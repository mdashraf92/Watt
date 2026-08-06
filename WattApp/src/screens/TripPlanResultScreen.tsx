/**
 * TripPlanResultScreen — the plan, leg by leg.
 *
 * The infeasible case is given as much room as the happy one. A planner that
 * quietly returns "0 stops" for a trip the car cannot make is worse than no
 * planner at all, so when it cannot be done we say where the gap is, how far
 * short the range falls, and what to change.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import OSMMap, { OSMMapHandle, OSMMarkerSpec, OSMRegion } from '../components/OSMMap';
import GradientButton from '../components/GradientButton';
import { api } from '../lib/api';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import type { CustomerStackParamList, TripStop } from '../types';
import {
  ArrowLeftIcon, ZapIcon, ClockIcon, WalletIcon, MapPinIcon, CheckIcon,
  BatteryChargingIcon, InfoIcon, LeafIcon,
} from '../components/icons';

type Nav   = NativeStackNavigationProp<CustomerStackParamList, 'TripPlanResult'>;
type Route = RouteProp<CustomerStackParamList, 'TripPlanResult'>;

export default function TripPlanResultScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { plan, from, to } = route.params;
  const { t, isRTL } = useLang();
  const mapRef = useRef<OSMMapHandle>(null);

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  // Draw the road once the WebView is up.
  useEffect(() => {
    const id = setTimeout(() => {
      if (plan.coordinates?.length) mapRef.current?.setRoute(plan.coordinates);
    }, 400);
    return () => clearTimeout(id);
  }, [plan.coordinates]);

  const save = async () => {
    setSaving(true);
    try {
      const { coordinates, nearby, ...storable } = plan;
      const saved = await api.trips.save({
        name: `${from.label} → ${to.label}`,
        from, to,
        params: plan.params as any,
        plan: storable as any,
      });
      setSavedId(saved.id);
      Alert.alert(t.tp_saved, `${from.label} → ${to.label}`);
    } catch {
      Alert.alert(t.error, t.tp_err_generic);
    } finally { setSaving(false); }
  };

  const region: OSMRegion = {
    latitude: (from.latitude + to.latitude) / 2,
    longitude: (from.longitude + to.longitude) / 2,
    latitudeDelta: Math.max(Math.abs(from.latitude - to.latitude) * 1.6, 0.2),
    longitudeDelta: Math.max(Math.abs(from.longitude - to.longitude) * 1.6, 0.2),
  };

  const markers: OSMMarkerSpec[] = [
    { id: 'from', latitude: from.latitude, longitude: from.longitude, color: COLORS.primaryDark, icon: 'home' },
    ...plan.stops.map((s, i): OSMMarkerSpec => ({
      id: `stop-${i}`, latitude: s.latitude, longitude: s.longitude,
      color: COLORS.primary, icon: 'zap',
    })),
    { id: 'to', latitude: to.latitude, longitude: to.longitude, color: COLORS.gold, icon: 'star' },
  ];

  const hours = Math.floor(plan.total_minutes / 60);
  const mins  = plan.total_minutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.tp_result_title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        <View style={styles.mapWrap}>
          <OSMMap ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={region} markers={markers} />
        </View>

        {/* Summary */}
        <View style={[styles.summary, { flexDirection: rowDir }]}>
          <Metric Icon={MapPinIcon} label={t.tp_summary_distance} value={`${plan.distance_km} km`} />
          <View style={styles.metricDivider} />
          <Metric Icon={ClockIcon} label={t.tp_summary_time} value={timeStr} />
          <View style={styles.metricDivider} />
          <Metric Icon={WalletIcon} label={t.tp_summary_cost} value={`${plan.total_cost.toFixed(3)}`} />
        </View>

        {/* Infeasible — stated plainly, with the numbers that make it true. */}
        {!plan.feasible && plan.gap && (
          <View style={styles.gapCard}>
            <View style={[styles.gapHead, { flexDirection: rowDir }]}>
              <InfoIcon size={20} color={COLORS.error} strokeWidth={2.2} />
              <Text style={[styles.gapTitle, { textAlign: align }]}>{t.tp_infeasible_title}</Text>
            </View>
            <Text style={[styles.gapBody, { textAlign: align }]}>
              {t.tp_infeasible_sub
                .replace('{from}', String(plan.gap.from_km))
                .replace('{needed}', String(plan.gap.needed_km))
                .replace('{reachable}', String(plan.gap.reachable_km))}
            </Text>
            <Text style={[styles.gapHint, { textAlign: align }]}>{t.tp_infeasible_hint}</Text>
          </View>
        )}

        {/* No stops needed */}
        {plan.feasible && plan.stops.length === 0 && (
          <View style={styles.okCard}>
            <View style={styles.okIcon}>
              <CheckIcon size={24} color="#fff" strokeWidth={3} />
            </View>
            <Text style={styles.okTitle}>{t.tp_no_stops}</Text>
            <Text style={styles.okSub}>{t.tp_no_stops_sub}</Text>
            <Text style={styles.okArrive}>
              {t.tp_arrive_with.replace('{pct}', String(plan.arrive_soc_pct))}
            </Text>
          </View>
        )}

        {/* Stops */}
        {plan.stops.map((s, i) => (
          <StopCard
            key={`${s.kind}-${s.id}-${i}`}
            stop={s} index={i} t={t} dir={rowDir} align={align}
            isLast={i === plan.stops.length - 1}
          />
        ))}

        {plan.feasible && plan.stops.length > 0 && (
          <View style={[styles.arriveRow, { flexDirection: rowDir }]}>
            <BatteryChargingIcon size={17} color={COLORS.primary} strokeWidth={2.2} />
            <Text style={styles.arriveTxt}>
              {t.tp_arrive_with.replace('{pct}', String(plan.arrive_soc_pct))}
            </Text>
            <Text style={styles.arriveKwh}>
              {plan.total_kwh.toFixed(1)} kWh · {(plan.total_kwh * 0.5).toFixed(1)} kg CO₂
            </Text>
          </View>
        )}

        {/* Booking is per-stop, on the trip detail screen, and only ever the next
            one — see the note on the booking endpoint. Saving first is what
            makes those stops real rows to book against. */}
        {plan.feasible && (
          savedId ? (
            <GradientButton
              label={t.tp_my_trips}
              onPress={() => navigation.replace('TripDetail', { tripId: savedId })}
              style={{ marginTop: 18 }}
            />
          ) : (
            <GradientButton
              label={t.tp_save}
              onPress={save}
              loading={saving}
              icon={<ZapIcon size={18} color="#fff" strokeWidth={2.4} />}
              style={{ marginTop: 18 }}
            />
          )
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

function StopCard({ stop, index, t, dir, align, isLast }: {
  stop: TripStop; index: number; t: any;
  dir: 'row' | 'row-reverse'; align: 'left' | 'right'; isLast: boolean;
}) {
  return (
    <View style={styles.stopCard}>
      <View style={[styles.stopHead, { flexDirection: dir }]}>
        <View style={styles.stopBadge}>
          <Text style={styles.stopBadgeTxt}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.stopName, { textAlign: align }]} numberOfLines={1}>{stop.name}</Text>
          <Text style={[styles.stopMeta, { textAlign: align }]}>
            {t.tp_at_km.replace('{km}', String(Math.round(stop.along_km)))}
            {stop.detour_km >= 0.5
              ? ` · ${t.tp_stop_detour.replace('{km}', stop.detour_km.toFixed(1))}`
              : ''}
          </Text>
        </View>
        <Text style={styles.stopPower}>{stop.power_kw} kW</Text>
      </View>

      {/* Arrive → leave, the bit that makes it a plan rather than a list */}
      <View style={[styles.socRow, { flexDirection: dir }]}>
        <View style={styles.socBox}>
          <Text style={styles.socBoxVal}>{stop.arrive_soc_pct}%</Text>
          <Text style={styles.socBoxLbl}>{t.tp_stop_arrive.replace(' {pct}%', '')}</Text>
        </View>
        <View style={styles.socArrow}>
          <Text style={styles.socArrowTxt}>{dir === 'row-reverse' ? '←' : '→'}</Text>
          <Text style={styles.socArrowSub}>
            {t.tp_stop_charge
              .replace('{kwh}', stop.charge_kwh.toFixed(1))
              .replace('{min}', String(stop.charge_minutes))}
          </Text>
        </View>
        <View style={styles.socBox}>
          <Text style={[styles.socBoxVal, { color: COLORS.primary }]}>{stop.depart_soc_pct}%</Text>
          <Text style={styles.socBoxLbl}>{t.tp_stop_depart.replace(' {pct}%', '')}</Text>
        </View>
        <Text style={styles.stopCost}>{stop.cost.toFixed(3)} OMR</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text },
  scroll: { padding: 16, gap: 12 },

  mapWrap: {
    height: 220, borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundAlt,
  },

  summary: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 16, alignItems: 'center',
  },
  metric: { flex: 1, alignItems: 'center', gap: 4 },
  metricValue: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text },
  metricLabel: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textTertiary },
  metricDivider: { width: 1, height: 34, backgroundColor: COLORS.border },

  gapCard: {
    backgroundColor: '#fdf2f2', borderRadius: 18, borderWidth: 1, borderColor: '#f6cfcf', padding: 18,
  },
  gapHead: { alignItems: 'center', gap: 10, marginBottom: 8 },
  gapTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 15.5, color: COLORS.error },
  gapBody: { fontFamily: FONTS.regular, fontSize: 13.5, color: COLORS.text, lineHeight: 20 },
  gapHint: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textSecondary, marginTop: 10 },

  okCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.primaryTint,
    padding: 24, alignItems: 'center',
  },
  okIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  okTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text },
  okSub: {
    fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 5, lineHeight: 19,
  },
  okArrive: { fontFamily: FONTS.bold, fontSize: 13.5, color: COLORS.primary, marginTop: 10 },

  stopCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  stopHead: { alignItems: 'center', gap: 11 },
  stopBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stopBadgeTxt: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  stopName: { fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.text },
  stopMeta: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 },
  stopPower: { fontFamily: FONTS.bold, fontSize: 12.5, color: COLORS.primary },

  socRow: {
    alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  socBox: { alignItems: 'center' },
  socBoxVal: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text },
  socBoxLbl: { fontFamily: FONTS.regular, fontSize: 10.5, color: COLORS.textTertiary },
  socArrow: { flex: 1, alignItems: 'center' },
  socArrowTxt: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textTertiary },
  socArrowSub: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  stopCost: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.text },

  arriveRow: {
    alignItems: 'center', gap: 9, padding: 14,
    backgroundColor: COLORS.primaryBg, borderRadius: 14,
  },
  arriveTxt: { flex: 1, fontFamily: FONTS.bold, fontSize: 13.5, color: COLORS.primary },
  arriveKwh: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textSecondary },
});
