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
import Slider from '@react-native-community/slider';
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
import { vehicleLabel } from '../lib/vehicle';
import type { CustomerStackParamList, Station } from '../types';
import {
  ArrowLeftIcon, MapPinIcon, LocateIcon, NavigationIcon, CarIcon, SearchIcon, XIcon,
  SwapVerticalIcon, ChevronDownIcon, CheckIcon,
} from '../components/icons';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'TripPlanner'>;

type Point = { latitude: number; longitude: number; label: string } | null;
type PlaceResult = { id: string; name: string; address: string; latitude: number; longitude: number };

const OMAN: OSMRegion = {
  latitude: 23.588, longitude: 58.383, latitudeDelta: 3.5, longitudeDelta: 3.5,
};

const RESERVE_MIN = 5, RESERVE_MAX = 40;
const CONSUMPTION_MIN = 10, CONSUMPTION_MAX = 35;

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
  const [search, setSearch]     = useState('');
  const [places, setPlaces]     = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [startSoc, setStartSoc]   = useState(80);
  const [reserveSoc, setReserveSoc] = useState(15);
  const [consumption, setConsumption] = useState(18);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [planning, setPlanning] = useState(false);
  // The map sits inside a ScrollView, so it must not swallow drags until the
  // user explicitly asks to use it — otherwise the page cannot be scrolled past
  // it. Panning also no longer overwrites the point on every frame: the centre
  // is only committed when they confirm.
  const [mapActive, setMapActive] = useState(false);
  // Seeded so "confirm" always has a centre to commit, even if they never pan.
  const pendingRegion = useRef<OSMRegion>(OMAN);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq    = useRef(0);

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
      mapRef.current?.animateToRegion({ ...p, latitudeDelta: 0.05, longitudeDelta: 0.05 });
    } catch { /* leave the field empty; the user can still pick on the map */ }
  }, [t]);

  // Local station match — instant, no network round trip.
  const stationResults = search.trim().length >= 2
    ? stations.filter(s =>
        s.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (s.address ?? '').toLowerCase().includes(search.trim().toLowerCase()),
      ).slice(0, 5)
    : [];

  // Any place in Oman, via the backend's Mapbox-geocoding proxy — debounced so
  // typing doesn't fire a request per keystroke. Superseded requests are
  // dropped by sequence number rather than cancelled, since the search box has
  // no AbortController wired through `api`.
  useEffect(() => {
    const q = search.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) { setPlaces([]); setSearching(false); return; }

    setSearching(true);
    const mySeq = ++searchSeq.current;
    const near = from ?? undefined;
    searchTimer.current = setTimeout(() => {
      api.routing.search(q, near ? { latitude: near.latitude, longitude: near.longitude } : undefined)
        .then(r => { if (mySeq === searchSeq.current) setPlaces(r); })
        .catch(() => { if (mySeq === searchSeq.current) setPlaces([]); })
        .finally(() => { if (mySeq === searchSeq.current) setSearching(false); });
    }, 350);

    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const flyTo = (p: { latitude: number; longitude: number }, delta = 0.05) => {
    mapRef.current?.animateToRegion({ ...p, latitudeDelta: delta, longitudeDelta: delta });
  };

  const pickStation = (s: Station) => {
    const p = { latitude: s.latitude, longitude: s.longitude, label: s.name };
    picking === 'from' ? setFrom(p) : setTo(p);
    setSearch(''); setPlaces([]);
    flyTo(p, 0.03);
  };

  const pickPlace = (place: PlaceResult) => {
    const p = { latitude: place.latitude, longitude: place.longitude, label: place.name };
    picking === 'from' ? setFrom(p) : setTo(p);
    setSearch(''); setPlaces([]);
    flyTo(p, 0.03);
  };

  const swapPoints = () => {
    setFrom(to);
    setTo(from);
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
        reserve_soc_pct: reserveSoc,
        consumption_kwh_per_100km: consumption,
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

            <TouchableOpacity
              style={[styles.swapBtn, isRTL ? { left: 14 } : { right: 14 }]}
              onPress={swapPoints}
              disabled={!from && !to}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t.tp_swap}
            >
              <SwapVerticalIcon size={16} color={(from || to) ? COLORS.primary : COLORS.textTertiary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* Search: own stations (instant) + any place in Oman (backend geocoder) */}
          <View style={[styles.searchWrap, { flexDirection: rowDir }]}>
            <SearchIcon size={17} color={COLORS.textTertiary} strokeWidth={2} />
            <TextInput
              style={[styles.searchInput, { textAlign: align }]}
              placeholder={t.tp_search_ph}
              placeholderTextColor={COLORS.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
            {searching ? (
              <ActivityIndicator size="small" color={COLORS.textTertiary} />
            ) : !!search && (
              <TouchableOpacity onPress={() => { setSearch(''); setPlaces([]); }} hitSlop={8}>
                <XIcon size={16} color={COLORS.textTertiary} strokeWidth={2.4} />
              </TouchableOpacity>
            )}
          </View>
          {stationResults.map(s => (
            <TouchableOpacity key={`s-${s.id}`} style={styles.resultRow} onPress={() => pickStation(s)}>
              <MapPinIcon size={15} color={COLORS.primary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultName, { textAlign: align }]} numberOfLines={1}>{s.name}</Text>
                <Text style={[styles.resultAddr, { textAlign: align }]} numberOfLines={1}>{s.address}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {places.map(p => (
            <TouchableOpacity key={`p-${p.id}`} style={styles.resultRow} onPress={() => pickPlace(p)}>
              <SearchIcon size={15} color={COLORS.textTertiary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultName, { textAlign: align }]} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.resultAddr, { textAlign: align }]} numberOfLines={1}>{p.address}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {!searching && search.trim().length >= 2 && !stationResults.length && !places.length && (
            <Text style={styles.noResults}>{t.tp_no_results}</Text>
          )}

          {/* Map — locked by default so the page scrolls; unlock to drag the pin */}
          <View style={styles.mapWrap}>
            <View style={StyleSheet.absoluteFill} pointerEvents={mapActive ? 'auto' : 'none'}>
              <OSMMap
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={OMAN}
                markers={markers}
                onRegionChangeComplete={(r) => { pendingRegion.current = r; }}
              />
            </View>

            {mapActive && (
              <View pointerEvents="none" style={styles.centrePin}>
                <MapPinIcon size={34} color={picking === 'from' ? COLORS.primaryDark : COLORS.gold} strokeWidth={2.2} />
              </View>
            )}

            <View style={styles.pickBadge}>
              <Text style={styles.pickBadgeTxt}>
                {picking === 'from' ? t.tp_from : t.tp_to}
              </Text>
            </View>

            {mapActive ? (
              <>
                <TouchableOpacity
                  style={styles.locateBtn}
                  onPress={() => useMyLocation(picking)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t.tp_recentre}
                >
                  <LocateIcon size={18} color={COLORS.primary} strokeWidth={2.2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={() => {
                    const r = pendingRegion.current;
                    const p = { latitude: r.latitude, longitude: r.longitude, label: t.tp_pick_on_map };
                    picking === 'from' ? setFrom(p) : setTo(p);
                    setMapActive(false);
                  }}
                  activeOpacity={0.85}
                >
                  <CheckIcon size={16} color="#fff" strokeWidth={2.6} />
                  <Text style={styles.confirmBtnTxt}>{t.tp_confirm_point}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.unlockBtn}
                onPress={() => setMapActive(true)}
                activeOpacity={0.85}
              >
                <MapPinIcon size={16} color={COLORS.primary} strokeWidth={2.4} />
                <Text style={styles.unlockBtnTxt}>{t.tp_use_map}</Text>
              </TouchableOpacity>
            )}
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
            <>
              <View style={styles.card}>
                <View style={[styles.carRow, { flexDirection: rowDir }]}>
                  <CarIcon size={18} color={COLORS.primary} strokeWidth={2} />
                  <Text style={[styles.carName, { textAlign: align }]}>
                    {vehicleLabel(profile?.car_make, profile?.car_model) || t.tp_car_title}
                  </Text>
                  <Text style={styles.carBattery}>{batteryKwh} kWh</Text>
                </View>

                <View style={styles.rowDivider} />

                <View style={[styles.socHead, { flexDirection: rowDir }]}>
                  <Text style={styles.socLabel}>{t.tp_start_soc}</Text>
                  <Text style={styles.socValue}>{startSoc}%</Text>
                </View>
                <Slider
                  style={styles.slider}
                  minimumValue={5}
                  maximumValue={100}
                  step={1}
                  value={startSoc}
                  onValueChange={setStartSoc}
                  minimumTrackTintColor={COLORS.primary}
                  maximumTrackTintColor={COLORS.border}
                  thumbTintColor={COLORS.primary}
                />
              </View>

              {/* Advanced options — reserve buffer & consumption rate, both already
                  supported server-side (routing.routes.ts planBody) with sane
                  defaults, so this only needs to surface them, not add new logic. */}
              <TouchableOpacity
                style={[styles.advancedHead, { flexDirection: rowDir }]}
                onPress={() => setAdvancedOpen(v => !v)}
                activeOpacity={0.7}
              >
                <Text style={[styles.advancedTitle, { textAlign: align }]}>{t.tp_advanced}</Text>
                <View style={advancedOpen ? { transform: [{ rotate: '180deg' }] } : undefined}>
                  <ChevronDownIcon size={18} color={COLORS.textSecondary} strokeWidth={2.2} />
                </View>
              </TouchableOpacity>

              {advancedOpen && (
                <View style={styles.card}>
                  <View style={[styles.socHead, { flexDirection: rowDir, paddingTop: 13 }]}>
                    <Text style={styles.socLabel}>{t.tp_reserve_soc}</Text>
                    <Text style={styles.socValue}>{reserveSoc}%</Text>
                  </View>
                  <Text style={[styles.hintTxt, { textAlign: align }]}>{t.tp_reserve_soc_hint}</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={RESERVE_MIN}
                    maximumValue={RESERVE_MAX}
                    step={1}
                    value={reserveSoc}
                    onValueChange={setReserveSoc}
                    minimumTrackTintColor={COLORS.primary}
                    maximumTrackTintColor={COLORS.border}
                    thumbTintColor={COLORS.primary}
                  />

                  <View style={styles.rowDivider} />

                  <View style={[styles.socHead, { flexDirection: rowDir, paddingTop: 13 }]}>
                    <Text style={styles.socLabel}>{t.tp_consumption}</Text>
                    <Text style={styles.socValue}>{consumption} kWh/100km</Text>
                  </View>
                  <Text style={[styles.hintTxt, { textAlign: align }]}>{t.tp_consumption_hint}</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={CONSUMPTION_MIN}
                    maximumValue={CONSUMPTION_MAX}
                    step={1}
                    value={consumption}
                    onValueChange={setConsumption}
                    minimumTrackTintColor={COLORS.primary}
                    maximumTrackTintColor={COLORS.border}
                    thumbTintColor={COLORS.primary}
                  />
                </View>
              )}
            </>
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

  swapBtn: {
    position: 'absolute', top: '50%', marginTop: -15,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },

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
  noResults: {
    fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textTertiary,
    textAlign: 'center', marginTop: 10,
  },

  mapWrap: {
    height: 260, borderRadius: 18, overflow: 'hidden', marginTop: 14,
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
  locateBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  unlockBtn: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: COLORS.card, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  unlockBtnTxt: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.text },
  confirmBtn: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: COLORS.primary, borderRadius: 22,
    paddingHorizontal: 18, paddingVertical: 11,
    shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  confirmBtnTxt: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },

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
  slider: { width: '100%', height: 36, marginBottom: 6 },
  hintTxt: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary, marginTop: -4, marginBottom: 4 },

  advancedHead: {
    alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 4, marginTop: 6,
  },
  advancedTitle: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.text },
});
