import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import OSMMap, { OSMMapHandle, OSMMarkerSpec, OSMRegion as Region, OSMMapType } from '../../components/OSMMap';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarHeight } from '../../navigation/tabBarLayout';
import type { MobileChargeRequest, ServiceVan, Station } from '../../types';
import { api } from '../../lib/api';
import { realtime } from '../../lib/realtime';
import { COLORS } from '../../constants/colors';
import { useLang } from '../../context/LanguageContext';
import { translateGov, stationDisplayName, stationDisplayAddress } from '../../i18n/govMap';
import { ZapIcon, LocateIcon, XIcon, SearchIcon, LayersIcon } from '../../components/icons';
import NotificationBell from '../../components/NotificationBell';

const STATUS_COLOR: Record<string, string> = {
  available: COLORS.available,
  busy:      COLORS.busy,
  fault:     COLORS.fault,
  offline:   COLORS.offline,
};

const OMAN_REGION: Region = {
  latitude: 23.588, longitude: 58.383,
  latitudeDelta: 3.5, longitudeDelta: 3.5,
};


export default function AdminMapScreen() {
  const { t, isRTL } = useLang();
  const STATUS_LABEL: Record<string, string> = {
    available: t.admin_map_available,
    busy:      t.admin_map_busy,
    fault:     t.admin_map_fault,
    offline:   t.admin_map_offline,
  };

  const mapRef = useRef<OSMMapHandle>(null);
  const [mapType, setMapType] = useState<OSMMapType>('streets');
  const [stations, setStations]   = useState<Station[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [selected, setSelected]   = useState<Station | null>(null);
  const [search,   setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [cardHeight, setCardHeight] = useState(0);
  // Live fleet overlay. Vans move constantly, so this polls rather than riding
  // the realtime broadcast — their positions are deliberately kept off it.
  const [fleet, setFleet] = useState<{ vans: ServiceVan[]; requests: Array<MobileChargeRequest & { customer_name: string }> }>(
    { vans: [], requests: [] },
  );
  const tabBarHeight = useTabBarHeight();
  const cardBottom = tabBarHeight + 12;

  useEffect(() => {
    fetchStations();
    requestLocation();

    const unsub = realtime.onTable('stations', row => {
      setStations(prev =>
        prev.map(s => s.id === row.id ? { ...s, ...row } : s)
      );
    });

    const pullFleet = () => {
      api.fleet.live().then(setFleet).catch(() => { /* overlay is optional */ });
    };
    pullFleet();
    const fleetTimer = setInterval(pullFleet, 20_000);

    return () => { unsub(); clearInterval(fleetTimer); };
  }, []);

  const fetchStations = async () => {
    try {
      const data = await api.stations.list();
      setStations((data ?? []) as Station[]);
    } finally {
      setLoading(false);
    }
  };

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({});
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        latitudeDelta: 0.08, longitudeDelta: 0.08,
      }, 800);
    }
  };

  // Status summary counts (always over the full set, so chips show network totals)
  const counts = stations.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Stations after search + status filter — drives the map pins
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stations.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.name_ar ?? '').toLowerCase().includes(q) ||
        s.governorate.toLowerCase().includes(q) ||
        translateGov(s.governorate, isRTL).toLowerCase().includes(q)
      );
    });
  }, [stations, search, statusFilter, isRTL]);

  // Keep the map framed on results as the admin searches/filters
  useEffect(() => {
    if (!loading && visible.length > 0 && (search.trim() || statusFilter !== 'all')) {
      const lats = visible.map(s => s.latitude);
      const lngs = visible.map(s => s.longitude);
      const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      const spanLat = Math.max(...lats) - Math.min(...lats);
      const spanLng = Math.max(...lngs) - Math.min(...lngs);
      mapRef.current?.animateToRegion({
        latitude: midLat, longitude: midLng,
        latitudeDelta: Math.max(spanLat * 1.6, 0.05),
        longitudeDelta: Math.max(spanLng * 1.6, 0.05),
      }, 500);
    }
  }, [search, statusFilter, loading]);

  // Drop the selected card if it no longer matches the active filter/search
  useEffect(() => {
    if (selected && !visible.some(s => s.id === selected.id)) setSelected(null);
  }, [visible, selected]);

  const CHIPS = [
    { key: 'all',       color: COLORS.text,      label: t.admin_map_all,       count: stations.length },
    { key: 'available', color: COLORS.available, label: t.admin_map_available, count: counts.available ?? 0 },
    { key: 'busy',      color: COLORS.busy,      label: t.admin_map_busy,      count: counts.busy ?? 0 },
    { key: 'fault',     color: COLORS.fault,     label: t.admin_map_fault,     count: counts.fault ?? 0 },
    { key: 'offline',   color: COLORS.offline,   label: t.admin_map_offline,   count: counts.offline ?? 0 },
  ];

  return (
    <View style={styles.root}>
      {/* Map — free OpenStreetMap (no API key); see OSMMap.tsx */}
      <OSMMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={OMAN_REGION}
        markers={[
          ...visible.map((s): OSMMarkerSpec => ({
            id: s.id,
            latitude: s.latitude, longitude: s.longitude,
            color: STATUS_COLOR[s.status] ?? COLORS.offline,
            icon: 'zap',
          })),
          // Vans on duty, and callouts still waiting for one. Prefixed ids keep
          // them from colliding with station ids in onMarkerPress.
          ...fleet.vans
            .filter(v => v.last_lat != null && v.last_lng != null)
            .map((v): OSMMarkerSpec => ({
              id: `van:${v.id}`,
              latitude: v.last_lat!, longitude: v.last_lng!,
              color: v.status === 'on_job' ? COLORS.gold : COLORS.primary,
              icon: 'home',
            })),
          ...fleet.requests.map((r): OSMMarkerSpec => ({
            id: `mcr:${r.id}`,
            latitude: r.pickup_lat, longitude: r.pickup_lng,
            color: COLORS.error,
            icon: 'star',
          })),
        ]}
        onMarkerPress={(id) => {
          const s = stations.find(x => x.id === id);
          if (s) setSelected(s);
        }}
        showsUserLocation
        mapType={mapType}
      />

      {/* Top overlay — Google-Maps-style search + filter */}
      <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="box-none">
        {/* Floating pill search bar + notification bell */}
        <View style={[styles.searchRow, isRTL && styles.rowReverse]}>
          <View style={[styles.searchBar, { flex: 1 }, isRTL && styles.rowReverse]}>
            <View style={styles.searchIconWrap}>
              <SearchIcon size={19} color={COLORS.primary} strokeWidth={2.4} />
            </View>
            <TextInput
              style={[styles.searchInput, { textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t.admin_map_search}
              placeholderTextColor={COLORS.textTertiary}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginHorizontal: 4 }} />
            ) : search.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearch('')}
                style={styles.clearBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <XIcon size={13} color={COLORS.textSecondary} strokeWidth={2.6} />
              </TouchableOpacity>
            ) : (
              <View style={styles.countBadge}>
                <ZapIcon size={11} color={COLORS.primary} strokeWidth={2.6} />
                <Text style={styles.countBadgeText}>{visible.length}</Text>
              </View>
            )}
          </View>
          <NotificationBell size={48} />
        </View>

        {/* Category-style filter chips — full-bleed so they scroll off the true screen edges */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={[styles.chipRow, isRTL && styles.rowReverse]}
          keyboardShouldPersistTaps="handled"
        >
          {CHIPS.map(c => {
            const active = statusFilter === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                activeOpacity={0.85}
                onPress={() => setStatusFilter(active && c.key !== 'all' ? 'all' : c.key)}
                style={[
                  styles.chip,
                  active && { backgroundColor: c.color, borderColor: c.color },
                ]}
              >
                {c.key !== 'all' && (
                  <View style={[styles.chipDot, { backgroundColor: active ? '#fff' : c.color }]} />
                )}
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {c.label}
                </Text>
                <View style={[styles.chipCount, active && styles.chipCountActive]}>
                  <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>{c.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Empty state */}
        {!loading && visible.length === 0 && (
          <View style={styles.emptyPill}>
            <Text style={styles.emptyText}>{t.admin_map_no_results}</Text>
          </View>
        )}
      </SafeAreaView>

      {/* Satellite toggle FAB — sits just above the locate FAB */}
      <TouchableOpacity
        style={[
          styles.locateFab,
          isRTL ? { left: 16 } : { right: 16 },
          { bottom: (selected ? cardBottom + cardHeight + 14 : tabBarHeight + 12) + 60 },
        ]}
        onPress={() => setMapType(v => (v === 'streets' ? 'satellite' : 'streets'))}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t.map_satellite_toggle}
      >
        <LayersIcon size={20} color={mapType === 'satellite' ? COLORS.primary : COLORS.textSecondary} strokeWidth={2.2} />
      </TouchableOpacity>

      {/* Locate FAB — floating bottom corner like Google Maps (lifts above the station card) */}
      <TouchableOpacity
        style={[
          styles.locateFab,
          isRTL ? { left: 16 } : { right: 16 },
          // Sits just above the floating nav bar by default; above the card when a station is open.
          { bottom: selected ? cardBottom + cardHeight + 14 : tabBarHeight + 12 },
        ]}
        onPress={requestLocation}
        activeOpacity={0.85}
      >
        <LocateIcon size={22} color={COLORS.primary} strokeWidth={2.2} />
      </TouchableOpacity>

      {/* Selected station admin card */}
      {selected && (
        <View
          style={[styles.stationCard, { bottom: cardBottom }]}
          onLayout={e => setCardHeight(e.nativeEvent.layout.height)}
        >
          <TouchableOpacity style={styles.cardDismiss} onPress={() => setSelected(null)}>
            <XIcon size={14} color={COLORS.textSecondary} strokeWidth={2.5} />
          </TouchableOpacity>

          {/* Name + status */}
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: STATUS_COLOR[selected.status] + '22' }]}>
              <ZapIcon size={20} color={STATUS_COLOR[selected.status]} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardName, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
                {stationDisplayName(selected, isRTL)}
              </Text>
              <Text style={[styles.cardGov, { textAlign: isRTL ? 'right' : 'left' }]}>
                {translateGov(selected.governorate, isRTL)}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[selected.status] + '22' }]}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[selected.status] }]} />
              <Text style={[styles.statusText, { color: STATUS_COLOR[selected.status] }]}>
                {STATUS_LABEL[selected.status]}
              </Text>
            </View>
          </View>

          {/* Info grid */}
          <View style={styles.infoGrid}>
            <InfoCell label={t.admin_station_connectors} value={`${selected.available_connectors} / ${selected.total_connectors}`} />
            <InfoCell label={t.admin_station_power}      value={`${selected.power_kw} kW`} />
            <InfoCell label={t.admin_station_price}      value={`${selected.price_per_kwh.toFixed(3)} OMR`} />
            <InfoCell
              label={t.admin_station_maintenance}
              value={selected.last_maintenance
                ? new Date(selected.last_maintenance).toLocaleDateString()
                : t.admin_station_maintenance_none}
            />
            <InfoCell label={t.admin_station_hours} value={selected.operating_hours} wide />
          </View>
        </View>
      )}
    </View>
  );
}

function InfoCell({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.infoCell, wide && { width: '100%' }]}>
      <Text style={styles.infoCellLabel}>{label}</Text>
      <Text style={styles.infoCellValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 14, paddingBottom: 8, gap: 10,
  },
  rowReverse: { flexDirection: 'row-reverse' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // ── Floating pill search bar ──
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card, borderRadius: 28,
    paddingLeft: 6, paddingRight: 8, paddingVertical: 6,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  searchIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text, paddingVertical: 0 },
  clearBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.primaryBg, borderRadius: 14,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  countBadgeText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },

  // ── Category-style filter chips ──
  // Full-bleed: cancel the topOverlay's 14px side padding so chips slide off the real edges…
  chipScroll: { marginHorizontal: -14 },
  // …then re-add that inset inside the scroll content (plus vertical room so shadows aren't clipped).
  chipRow: { gap: 8, paddingHorizontal: 14, paddingVertical: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.card, borderRadius: 22,
    borderWidth: 1.5, borderColor: 'transparent',
    paddingLeft: 12, paddingRight: 8, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  chipDot:   { width: 9, height: 9, borderRadius: 5 },
  chipLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  chipLabelActive: { color: '#fff', fontWeight: '800' },
  chipCount: {
    minWidth: 22, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 11,
    backgroundColor: COLORS.backgroundAlt, alignItems: 'center', justifyContent: 'center',
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.28)' },
  chipCountText: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary },
  chipCountTextActive: { color: '#fff' },

  // ── Empty state ──
  emptyPill: {
    alignSelf: 'center',
    backgroundColor: COLORS.card, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  emptyText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },

  // ── Locate FAB ──
  locateFab: {
    position: 'absolute',
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },

  pin: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },

  stationCard: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: COLORS.card, borderRadius: 22, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  cardDismiss: {
    position: 'absolute', top: 12, right: 12,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14, paddingRight: 28 },
  cardIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardName:  { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  cardGov:   { fontSize: 12, color: COLORS.textSecondary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },
  statusText:  { fontSize: 11, fontWeight: '700' },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoCell: {
    width: '47%', backgroundColor: COLORS.background,
    borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  infoCellLabel: { fontSize: 10, color: COLORS.textTertiary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  infoCellValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
});
