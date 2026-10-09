import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { api } from '../../lib/api';
import { omr } from '../../lib/cafePay';
import { useLang } from '../../context/LanguageContext';
import { COLORS } from '../../constants/colors';
import { useTabBarHeight } from '../../navigation/tabBarLayout';
import OSMMap, { OSMMarkerSpec } from '../../components/OSMMap';
import ErrorView from '../../components/ErrorView';
import { PackageSkeleton } from '../packageShared';
import type { CafeOrder, CafeSummary, CustomerStackParamList } from '../../types';

// Muscat, used until we know where the driver is.
const DEFAULT_REGION = { latitude: 23.588, longitude: 58.3829, latitudeDelta: 0.35, longitudeDelta: 0.35 };
const ACTIVE = ['pending_payment', 'paid', 'accepted', 'ready'];

function km(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const r = (d: number) => d * Math.PI / 180;
  const h = Math.sin(r(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** The Coffee tab: only cafés that host a Go Watt charger appear here. */
export default function CafeMapScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { t, isRTL } = useLang();
  const tabBarHeight = useTabBarHeight();
  const [cafes, setCafes] = useState<CafeSummary[]>([]);
  const [active, setActive] = useState<CafeOrder | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const row = { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const };
  const text = (en: string, ar: string | null) => (isRTL ? ar || en : en);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [list, orders, staffVenues] = await Promise.all([
        api.cafe.list(), api.cafe.orders().catch(() => []), api.cafe.staffVenues().catch(() => []),
      ]);
      setCafes(list);
      setIsStaff(staffVenues.length > 0);
      setActive(orders.find(o => ACTIVE.includes(o.status)) ?? null);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Only use location if already granted — the Map tab owns the permission prompt.
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(async p => {
      if (!p.granted) return;
      const loc = await Location.getLastKnownPositionAsync();
      if (loc) setMe({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    }).catch(() => {});
  }, []);

  const sorted = useMemo(() => {
    const withDistance = cafes.map(c => ({ ...c, distance: me ? km(me, c) : null }));
    return withDistance.sort((a, b) => Number(b.can_order) - Number(a.can_order) || (a.distance ?? 0) - (b.distance ?? 0));
  }, [cafes, me]);
  const markers: OSMMarkerSpec[] = useMemo(() => cafes.map(c => ({
    id: c.id, latitude: Number(c.latitude), longitude: Number(c.longitude), color: COLORS.primary, brand: 'station',
  })), [cafes]);
  const region = me ? { ...me, latitudeDelta: 0.2, longitudeDelta: 0.2 } : DEFAULT_REGION;
  const open = (id: string) => navigation.navigate('CafeMenu', { stationId: id });

  return <SafeAreaView style={styles.screen} edges={['top']}>
    <FlatList
      data={loading || error ? [] : sorted}
      keyExtractor={c => c.id}
      refreshing={loading}
      onRefresh={load}
      contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
      ListHeaderComponent={<View>
        <View style={styles.head}>
          <Text style={[styles.eyebrow, align]}>Go Watt</Text>
          <Text style={[styles.title, align]}>{t.cafe_title}</Text>
          <Text style={[styles.sub, align]}>{t.cafe_subtitle}</Text>
        </View>
        {isStaff && <Pressable accessibilityRole="button" style={[styles.staff, row]}
          onPress={() => navigation.navigate('CafeStaffOrders')}>
          <Text style={[styles.staffText, align, { flex: 1 }]}>{t.cafe_staff_open_board}</Text>
          <Text style={styles.staffText}>{isRTL ? '←' : '→'}</Text>
        </Pressable>}
        {active && <Pressable accessibilityRole="button" style={[styles.banner, row]}
          onPress={() => navigation.navigate('CafeOrder', { orderId: active.id })}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, align]}>{t.cafe_order_no.replace('{n}', String(active.number))} · {t[`cafe_status_${active.status}`]}</Text>
            <Text style={[styles.bannerSub, align]}>{text(active.station_name, active.station_name_ar)}</Text>
          </View>
          <Text style={styles.bannerArrow}>{isRTL ? '←' : '→'}</Text>
        </Pressable>}
        <View style={styles.mapWrap}>
          <OSMMap style={StyleSheet.absoluteFill} initialRegion={region} markers={markers} onMarkerPress={open} showsUserLocation={!!me} />
        </View>
      </View>}
      ListEmptyComponent={loading ? <View style={styles.pad}><PackageSkeleton /></View>
        : error ? <ErrorView onRetry={load} />
        : <Text style={[styles.sub, styles.pad, align]}>{t.cafe_none}</Text>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => open(item.id)} style={[styles.card, row]}>
        {item.image_url || item.cafe_logo_url
          ? <Image source={{ uri: (item.cafe_logo_url || item.image_url)! }} style={styles.thumb} accessibilityIgnoresInvertColors />
          : <View style={[styles.thumb, styles.thumbEmpty]}><Text style={styles.thumbGlyph}>☕</Text></View>}
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, align]} numberOfLines={1}>{text(item.name, item.name_ar)}</Text>
          <Text style={[styles.cardSub, align]} numberOfLines={1}>
            {item.distance != null ? `${item.distance.toFixed(1)} km · ` : ''}{text(item.address, item.address_ar)}
          </Text>
          {item.from_price != null && <Text style={[styles.offer, align]}>
            {(item.included_minutes ? t.cafe_offer_minutes.replace('{n}', String(item.included_minutes)) : t.cafe_offer_charge)
              + ' · ' + t.cafe_from.replace('{price}', omr(item.from_price))}
          </Text>}
          <View style={[row]}>
            <Text style={[styles.chip, item.can_order ? styles.chipOpen : styles.chipClosed]}>
              {item.can_order ? t.cafe_open : item.orders_paused ? t.cafe_paused : t.cafe_soon}
            </Text>
          </View>
        </View>
      </Pressable>}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  head: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 4 },
  eyebrow: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800' },
  sub: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22 },
  pad: { padding: 20 },
  banner: { marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 18, backgroundColor: COLORS.primaryDark, alignItems: 'center', gap: 12 },
  bannerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  bannerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  bannerArrow: { color: COLORS.gold, fontSize: 22, fontWeight: '800' },
  staff: { marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 18, backgroundColor: COLORS.goldBg, borderWidth: 1, borderColor: COLORS.gold, alignItems: 'center', gap: 12 },
  staffText: { color: COLORS.textOnGold, fontSize: 16, fontWeight: '800' },
  mapWrap: { height: 220, marginHorizontal: 20, marginBottom: 16, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  card: { marginHorizontal: 20, marginBottom: 12, padding: 12, gap: 12, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  thumb: { width: 76, height: 76, borderRadius: 16, backgroundColor: COLORS.backgroundAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.goldBg },
  thumbGlyph: { fontSize: 30 },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  cardSub: { color: COLORS.textSecondary, fontSize: 13 },
  offer: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  chip: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  chipOpen: { color: COLORS.successDark, backgroundColor: COLORS.successBg },
  chipClosed: { color: COLORS.textSecondary, backgroundColor: COLORS.backgroundAlt },
});
