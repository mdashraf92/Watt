/**
 * TripPlannerScreen — where you are going, and what you are driving.
 *
 * The car comes from the profile, because the alternative is asking a driver to
 * type their battery size every time they plan a trip. If it is missing we say
 * so plainly and link to the car profile rather than guessing a number: a wrong
 * battery size produces a confident plan that strands someone.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import OSMMap, { OSMMapHandle, OSMMarkerSpec, OSMRegion } from '../components/OSMMap';
import GradientButton from '../components/GradientButton';
import { api } from '../lib/api';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import type { CustomerStackParamList, Station } from '../types';
import {
  ArrowLeftIcon, MapPinIcon, LocateIcon, NavigationIcon, CarIcon, SearchIcon, XIcon,
} from '../components/icons';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'TripPlanner'>;

type Point = { latitude: number; longitude: number; label: string } | null;

const OMAN: OSMRegion = {
  latitude: 23.588, longitude: 58.383, latitudeDelta: 3.5, longitudeDelta: 3.5,
};

export default function TripPlannerScreen() {
  const navigation = useNavigation<Nav>();
  const { t, isRTL } = useLang();
  const { profile } = useAuth();
  const mapRef = useRef<OSMMapHandle>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [from, setFrom]   = useState<Point>(null);
  const [to, setTo]       = useState<Point>(null);
  // Which field the map/search is currently filling.
  const [picking, setPicking] = useState<'from' | 'to'>('to');
  const [search, setSearch]   = useState('');
  const [startSoc, setStartSoc] = useState(80);
  const [planning, setPlanning] = useState(false);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const batteryKwh = Number(profile?.battery_kwh ?? 0);
  const hasBattery = batteryKwh > 0;

  useEffect(() => {
    api.stations.list().then((s: any) => setStations(s ?? [])).catch(() => {});
    useMyLocation('from');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = useCallback(async (which: 'from' | 'to') => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = {
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        label: t.tp_use_current,
      };
      which === 'from' ? setFrom(p) : setTo(p);
    } catch { /* leave the field empty; the user can still pick on the map */ }
  }, [t]);

  const results = search.trim().length >= 2
    ? stations.filter(s =>
        s.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (s.address ?? '').toLowerCase().includes(search.trim().toLowerCase()),
      ).slice(0, 6)
    : [];

  const pickStation = (s: Station) => {
    const p = { latitude: s.latitude, longitude: s.longitude, label: s.name };
    picking === 'from' ? setFrom(p) : setTo(p);
    setSearch('');
  };

  const plan = async () => {
    if (!from || !to || !hasBattery) return;
    setPlanning(true);
    try {
      const result = await api.trips.plan({
        from: { latitude: from.latitude, longitude: from.longitude },
        to:   { latitude: to.latitude,   longitude: to.longitude },
        battery_kwh: batteryKwh,
        start_soc_pct: startSoc,
        connector_type: profile?.connector_type ?? null,
      });
      navigation.navigate('TripPlanResult', { plan: result, from, to });
    } catch (e: any) {
      const code = e?.code ?? '';
      Alert.alert(
        t.error,
        code === 'no_route' ? t.tp_err_no_route
        : code === 'not_configured' ? t.map_directions_unavailable
        : t.tp_err_generic,
      );
    } finally { setPlanning(false); }
  };

  const markers: OSMMarkerSpec[] = [
    ...(from ? [{ id: 'from', latitude: from.latitude, longitude: from.longitude, color: COLORS.primaryDark, icon: 'home' as const }] : []),
    ...(to   ? [{ id: 'to',   latitude: to.latitude,   longitude: to.longitude,   color: COLORS.gold,        icon: 'star' as const }] : []),
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.tp_title}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* From / To */}
          <View style={styles.card}>
            <PointRow
              label={t.tp_from} point={from} active={picking === 'from'}
              onFocus={() => setPicking('from')}
              onLocate={() => useMyLocation('from')}
              onClear={() => setFrom(null)}
              dir={rowDir} align={align} t={t}
            />
            <View style={styles.rowDivider} />
            <PointRow
              label={t.tp_to} point={to} active={picking === 'to'}
              onFocus={() => setPicking('to')}
              onLocate={() => useMyLocation('to')}
              onClear={() => setTo(null)}
              dir={rowDir} align={align} t={t}
            />
          </View>

          {/* Search our own stations as destinations. No third-party geocoder is
              wired up, so this is honest about what it can find. */}
          <View style={[styles.searchWrap, { flexDirection: rowDir }]}>
            <SearchIcon size={17} color={COLORS.textTertiary} strokeWidth={2} />
            <TextInput
              style={[styles.searchInput, { textAlign: align }]}
              placeholder={t.tp_search_ph}
              placeholderTextColor={COLORS.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <XIcon size={16} color={COLORS.textTertiary} strokeWidth={2.4} />
              </TouchableOpacity>
            )}
          </View>
          {results.map(s => (
            <TouchableOpacity key={s.id} style={styles.resultRow} onPress={() => pickStation(s)}>
              <MapPinIcon size={15} color={COLORS.primary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultName, { textAlign: align }]} numberOfLines={1}>{s.name}</Text>
                <Text style={[styles.resultAddr, { textAlign: align }]} numberOfLines={1}>{s.address}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Map — tapping sets whichever field is active */}
          <View style={styles.mapWrap}>
            <OSMMap
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={OMAN}
              markers={markers}
              onRegionChangeComplete={(r) => {
                const p = { latitude: r.latitude, longitude: r.longitude, label: t.tp_pick_on_map };
                picking === 'from' ? setFrom(p) : setTo(p);
              }}
            />
            <View pointerEvents="none" style={styles.centrePin}>
              <MapPinIcon size={34} color={picking === 'from' ? COLORS.primaryDark : COLORS.gold} strokeWidth={2.2} />
            </View>
            <View style={styles.pickBadge}>
              <Text style={styles.pickBadgeTxt}>
                {picking === 'from' ? t.tp_from : t.tp_to}
              </Text>
            </View>
          </View>

          {/* Car */}
          <Text style={[styles.sectionTitle, { textAlign: align }]}>{t.tp_car_title}</Text>
          {!hasBattery ? (
            <TouchableOpacity
              style={styles.warnCard}
              onPress={() => navigation.navigate('CompleteProfile')}
              activeOpacity={0.85}
            >
              <CarIcon size={20} color={COLORS.goldDark} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.warnTxt, { textAlign: align }]}>{t.tp_no_battery}</Text>
                <Text style={[styles.warnLink, { textAlign: align }]}>{t.tp_edit_car} ›</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.card}>
              <View style={[styles.carRow, { flexDirection: rowDir }]}>
                <CarIcon size={18} color={COLORS.primary} strokeWidth={2} />
                <Text style={[styles.carName, { textAlign: align }]}>
                  {[profile?.car_make, profile?.car_model].filter(Boolean).join(' ') || t.tp_car_title}
                </Text>
                <Text style={styles.carBattery}>{batteryKwh} kWh</Text>
              </View>

              <View style={styles.rowDivider} />

              <View style={[styles.socHead, { flexDirection: rowDir }]}>
                <Text style={styles.socLabel}>{t.tp_start_soc}</Text>
                <Text style={styles.socValue}>{startSoc}%</Text>
              </View>
              <View style={[styles.socSteps, { flexDirection: rowDir }]}>
                {[20, 40, 60, 80, 100].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.socChip, startSoc === v && styles.socChipOn]}
                    onPress={() => setStartSoc(v)}
                  >
                    <Text style={[styles.socChipTxt, startSoc === v && styles.socChipTxtOn]}>{v}%</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <GradientButton
            label={planning ? t.tp_planning : t.tp_plan_btn}
            onPress={plan}
            loading={planning}
            disabled={!from || !to || !hasBattery || planning}
            icon={<NavigationIcon size={18} color="#fff" strokeWidth={2.4} />}
            style={{ marginTop: 20 }}
          />
          <View style={{ height: 28 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PointRow({ label, point, active, onFocus, onLocate, onClear, dir, align, t }: {
  label: string; point: Point; active: boolean;
  onFocus: () => void; onLocate: () => void; onClear: () => void;
  dir: 'row' | 'row-reverse'; align: 'left' | 'right'; t: any;
}) {
  return (
    <TouchableOpacity style={[styles.pointRow, { flexDirection: dir }]} onPress={onFocus} activeOpacity={0.8}>
      <View style={[styles.pointDot, active && styles.pointDotOn]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.pointLabel, { textAlign: align }]}>{label}</Text>
        <Text style={[styles.pointValue, { textAlign: align }]} numberOfLines={1}>
          {point ? point.label : t.tp_pick_on_map}
        </Text>
      </View>
      {point ? (
        <TouchableOpacity onPress={onClear} hitSlop={8}>
          <XIcon size={16} color={COLORS.textTertiary} strokeWidth={2.4} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onLocate} hitSlop={8}>
          <LocateIcon size={17} color={COLORS.primary} strokeWidth={2} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text },
  scroll: { padding: 16 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  rowDivider: { height: 1, backgroundColor: COLORS.border },
  pointRow: { alignItems: 'center', gap: 12, paddingVertical: 13 },
  pointDot: {
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 2.5, borderColor: COLORS.borderStrong, backgroundColor: COLORS.card,
  },
  pointDotOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  pointLabel: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textTertiary },
  pointValue: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.text, marginTop: 2 },

  searchWrap: {
    alignItems: 'center', gap: 9, marginTop: 12, paddingHorizontal: 14,
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1, paddingVertical: 11,
    fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11, marginTop: 6,
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  resultName: { fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.text },
  resultAddr: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary, marginTop: 1 },

  mapWrap: {
    height: 220, borderRadius: 18, overflow: 'hidden', marginTop: 14,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundAlt,
  },
  centrePin: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center', paddingBottom: 30,
  },
  pickBadge: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: COLORS.card, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.border,
  },
  pickBadgeTxt: { fontFamily: FONTS.bold, fontSize: 11.5, color: COLORS.text },

  sectionTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text, marginTop: 22, marginBottom: 10 },
  warnCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 16,
    backgroundColor: COLORS.goldBg, borderRadius: 16, borderWidth: 1, borderColor: COLORS.goldTint,
  },
  warnTxt: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  warnLink: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.goldDark, marginTop: 6 },

  carRow: { alignItems: 'center', gap: 9, paddingVertical: 13 },
  carName: { flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: COLORS.text },
  carBattery: { fontFamily: FONTS.bold, fontSize: 13.5, color: COLORS.primary },
  socHead: { alignItems: 'center', justifyContent: 'space-between', paddingTop: 13 },
  socLabel: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textSecondary },
  socValue: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text },
  socSteps: { gap: 7, paddingVertical: 12 },
  socChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 11,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  socChipOn: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  socChipTxt: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textSecondary },
  socChipTxtOn: { fontFamily: FONTS.bold, color: COLORS.primary },
});
