import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { Connector, MainStackParamList, Station } from '../types';
import { api } from '../lib/api';
import { listingToStation } from '../lib/listingToStation';
import { realtime } from '../lib/realtime';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { translateGov, stationDisplayName, stationDisplayAddress } from '../i18n/govMap';
import { COLORS, GRADIENTS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { ArrowLeftIcon, ZapIcon, StarIcon, ClockIcon, MapPinIcon, CheckIcon, HeartIcon, UserIcon } from '../components/icons';
import ErrorView from '../components/ErrorView';
import GradientButton from '../components/GradientButton';

type Nav = NativeStackNavigationProp<MainStackParamList, 'StationDetails'>;
type Route = RouteProp<MainStackParamList, 'StationDetails'>;

const STATUS_COLOR: Record<string, string> = {
  available: COLORS.available, busy: COLORS.busy, fault: COLORS.fault, offline: COLORS.offline,
};
const STATUS_BG: Record<string, string> = {
  available: COLORS.successBg, busy: COLORS.warningBg, fault: COLORS.errorBg, offline: COLORS.backgroundAlt,
};

const AMENITY_ICONS: Record<string, string> = {
  wifi: '📶', restaurant: '🍽️', parking: '🅿️', hotel: '🏨', mall: '🛍️',
  university: '🎓', hospital: '🏥', marina: '⛵', food_court: '🍔',
  prayer_room: '🕌', sports: '⚽', cafeteria: '☕', restrooms: '🚻',
  convenience_store: '🏪', airport: '✈️', tourist_site: '🏛️',
  '24h_service': '🕐', outdoor: '🌿', seaside: '🌊', scenic_view: '🏔️',
};

export default function StationDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const params = route.params;
  // Private chargers ("🏠 Ashraf", "🏠 Rami" on the map) had no details page at
  // all before — only official network stations did. This screen now renders
  // both, converting a listing onto the same Station shape via
  // listingToStation() so the rest of the UI doesn't need to fork.
  const isListing = 'listingId' in params;
  const id = isListing ? params.listingId : params.stationId;
  const { profile } = useAuth();
  const { t, isRTL } = useLang();
  const locale = isRTL ? 'ar-OM' : 'en-GB';

  const STATUS_LABEL: Record<string, string> = {
    available: t.status_available, busy: t.status_busy,
    fault: t.status_fault, offline: t.status_offline,
  };

  const [station, setStation] = useState<Station | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [reviews, setReviews] = useState<{ rating: number; comment: string | null; reviewer: string; created_at: string }[]>([]);
  const [favId, setFavId]   = useState<string | null>(null);   // favorites row id (null = not favorited)
  const [favBusy, setFavBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStation();
    fetchReviews();
    fetchFavorite();
    // Live status updates for this station/listing.
    const off = realtime.onTable(isListing ? 'charger_listings' : 'stations', (row) => {
      if (row?.id !== id) return;
      setStation(prev => prev ? { ...prev, ...(isListing ? listingToStation(row) : row) } : prev);
    });
    return off;
  }, [id, isListing]);

  const fetchStation = async () => {
    try {
      if (isListing) {
        const data = await api.chargers.get(id);
        if (data) {
          setStation(listingToStation(data));
          setHostName(data.host_name ?? null);
        }
      } else {
        const data: any = await api.stations.get(id);
        if (data) {
          setStation(data as Station);
          setConnectors((data.connectors ?? []) as Connector[]);
        }
      }
    } catch { /* keep null → shows retry */ }
    finally { setLoading(false); }
  };

  const fetchReviews = async () => {
    try {
      const data = isListing ? await api.chargers.reviews(id) : await api.stations.reviews(id);
      setReviews(data as typeof reviews);
    } catch { /* ignore */ }
  };

  const fetchFavorite = async () => {
    if (!profile) return;
    try {
      const favs: any[] = await api.favorites.list();
      setFavId(favs.find(f => isListing ? f.listing_id === id : f.station_id === id)?.id ?? null);
    } catch { /* ignore */ }
  };

  const toggleFavorite = async () => {
    if (!profile || favBusy) return;
    setFavBusy(true);
    const wasFav = favId;
    try {
      if (wasFav) {
        setFavId(null);                                     // optimistic
        await api.favorites.remove(wasFav);
      } else {
        const row: any = await api.favorites.add(isListing ? { listing_id: id } : { station_id: id });
        setFavId(row.id);
      }
    } catch { setFavId(wasFav); }                            // revert on failure
    finally { setFavBusy(false); }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Fetch failed (offline, etc.) — show retry instead of a blank screen.
  if (!station) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ErrorView onRetry={() => { setLoading(true); fetchStation(); fetchReviews(); }} />
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: 'center', padding: 12 }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>{t.cancel}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const canBook = station.status === 'available' && station.available_connectors > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t.a11y_back}>
          <ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{station.name}</Text>
        <TouchableOpacity onPress={toggleFavorite} style={styles.back} disabled={favBusy}
          accessibilityRole="button" accessibilityLabel={t.fav_toggle}>
          <HeartIcon size={20} color={favId ? COLORS.error : COLORS.textTertiary} filled={!!favId} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <LinearGradient
          colors={GRADIENTS.greenDeep}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroGlow} />
          <View style={styles.heroIconWrap}>
            <ZapIcon size={32} color={COLORS.gold} strokeWidth={2} />
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.heroName}>{stationDisplayName(station, isRTL)}</Text>
            <View style={styles.heroLocRow}>
              <MapPinIcon size={12} color="rgba(255,255,255,0.6)" strokeWidth={2} />
              <Text style={styles.heroAddress}>{stationDisplayAddress(station, isRTL)}</Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[station.status] }]} />
              <Text style={styles.statusText}>
                {STATUS_LABEL[station.status]}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard label={t.station_price} value={station.price_per_kwh.toFixed(3)} unit="OMR/kWh" color={COLORS.primary} emoji="💰" />
          <StatCard label={t.station_power} value={`${station.power_kw}`} unit="kW" color="#3b82f6" emoji="⚡" />
          <StatCard label={t.station_rating} value={`${station.rating}`} unit="★" color={COLORS.gold} emoji="⭐" />
          <StatCard label={t.station_available} value={`${station.available_connectors}/${station.total_connectors}`} unit={t.socket} color={COLORS.available} emoji="🔌" />
        </View>

        {/* Connectors — a private listing is always exactly one plug, already
            conveyed by the stats grid above, so this section is stations-only. */}
        {!isListing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.station_connectors}</Text>
            {connectors.map(c => (
              <View key={c.id} style={styles.connectorRow}>
                <View style={[styles.connectorBadge, { backgroundColor: c.status === 'available' ? COLORS.successBg : COLORS.warningBg }]}>
                  <View style={[styles.connectorDot, { backgroundColor: c.status === 'available' ? COLORS.available : COLORS.busy }]} />
                </View>
                <Text style={styles.connectorType}>{c.connector_type}</Text>
                <Text style={styles.connectorPower}>{c.power_kw} kW</Text>
                <Text style={[styles.connectorStatus, { color: c.status === 'available' ? COLORS.available : COLORS.busy }]}>
                  {c.status === 'available' ? t.status_available : t.status_busy}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Info — a private listing has no governorate/maintenance record of its
            own, so those rows are replaced with who's hosting it. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.station_info}</Text>
          <InfoRow Icon={ClockIcon} label={t.station_hours} value={station.operating_hours} />
          {isListing ? (
            hostName && <InfoRow Icon={UserIcon} label={t.station_host} value={hostName} />
          ) : (
            <>
              <InfoRow Icon={MapPinIcon} label={t.station_area} value={`${translateGov(station.governorate, isRTL)}${station.wilayat ? ` · ${station.wilayat}` : ''}`} />
              <InfoRow Icon={CheckIcon} label={t.station_maintenance} value={station.last_maintenance ? new Date(station.last_maintenance).toLocaleDateString(locale) : t.station_maintenance_none} />
            </>
          )}
          <InfoRow Icon={StarIcon} label={t.ratings_label} value={`${station.total_ratings} ${t.station_ratings_count}`} />
        </View>

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={styles.section}>
            <View style={styles.reviewsHeader}>
              <Text style={styles.sectionTitle}>{t.reviews_title}</Text>
              <View style={styles.reviewsAvg}>
                <StarIcon size={13} color={COLORS.gold} strokeWidth={2} filled />
                <Text style={styles.reviewsAvgText}>
                  {station.rating.toFixed(1)} · {station.total_ratings} {t.station_ratings_count}
                </Text>
              </View>
            </View>
            {reviews.filter(r => r.comment).slice(0, 8).map((r, i) => (
              <View key={i} style={[styles.reviewRow, i === 0 && { borderTopWidth: 0 }]}>
                <View style={styles.reviewTop}>
                  <Text style={styles.reviewName}>{r.reviewer}</Text>
                  <View style={styles.reviewStars}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <StarIcon key={n} size={11} color={n <= r.rating ? COLORS.gold : COLORS.border} filled={n <= r.rating} />
                    ))}
                  </View>
                </View>
                {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                <Text style={styles.reviewDate}>{new Date(r.created_at).toLocaleDateString(locale)}</Text>
              </View>
            ))}
            {reviews.filter(r => r.comment).length === 0 && (
              <Text style={styles.reviewEmpty}>{t.reviews_no_comments}</Text>
            )}
          </View>
        )}

        {/* Amenities */}
        {station.amenities && station.amenities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.station_amenities}</Text>
            <View style={styles.amenitiesGrid}>
              {station.amenities.map(a => (
                <View key={a} style={styles.amenityChip}>
                  <Text style={styles.amenityEmoji}>{AMENITY_ICONS[a] || '✓'}</Text>
                  <Text style={styles.amenityLabel}>{a.replace(/_/g, ' ')}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 130 }} />
      </ScrollView>

      {/* Book bar */}
      <View style={styles.bookBar}>
        <View>
          <Text style={styles.bookPrice}>{station.price_per_kwh.toFixed(3)} OMR</Text>
          <Text style={styles.bookPriceUnit}>/kWh</Text>
        </View>
        <View style={{ flex: 1 }}>
          <GradientButton
            label={canBook ? t.station_book : t.station_unavailable}
            onPress={() => canBook && navigation.navigate('Booking', isListing ? { station, listingId: id } : { station })}
            disabled={!canBook}
            icon={<ZapIcon size={18} color="#fff" strokeWidth={2.5} />}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function StatCard({ label, value, unit, color, emoji }: {
  label: string; value: string; unit: string; color: string; emoji: string;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ Icon, label, value }: { Icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Icon size={14} color={COLORS.textSecondary} strokeWidth={2} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  back: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.text,
    marginHorizontal: 8,
  },

  // Hero
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 20, margin: 16, borderRadius: 24,
    overflow: 'hidden',
    shadowColor: COLORS.primaryDark, shadowOpacity: 0.28, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16,
    elevation: 6,
  },
  heroGlow: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(244,165,60,0.18)', top: -50, right: -30,
  },
  heroIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  heroContent: { flex: 1 },
  heroName: { fontFamily: FONTS.bold, fontSize: 18, color: '#fff', textAlign: 'right', marginBottom: 5 },
  heroLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginBottom: 10 },
  heroAddress: { fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-end', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontFamily: FONTS.bold, fontSize: 11, color: '#fff' },

  // Stats grid
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, gap: 10, marginBottom: 4,
  },
  statCard: {
    flex: 1, minWidth: '44%',
    backgroundColor: COLORS.card, borderRadius: 18, padding: 14,
    alignItems: 'center', gap: 3,
    borderTopWidth: 3, borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  statEmoji: { fontSize: 20, marginBottom: 2 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statUnit: { fontSize: 10, color: COLORS.textTertiary },
  statLabel: { fontSize: 11, color: COLORS.textSecondary },

  // Section
  section: {
    backgroundColor: COLORS.card, borderRadius: 22,
    margin: 16, marginTop: 4, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    textAlign: 'right', marginBottom: 12,
  },

  // Connectors
  connectorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  connectorBadge: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  connectorDot: { width: 10, height: 10, borderRadius: 5 },
  connectorType: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  connectorPower: { fontSize: 13, color: COLORS.textSecondary },
  connectorStatus: { fontSize: 12, fontWeight: '700', minWidth: 56, textAlign: 'right' },

  // Info rows
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  infoIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right' },

  // Reviews
  reviewsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  reviewsAvg: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  reviewsAvgText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  reviewRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 5 },
  reviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  reviewStars: { flexDirection: 'row', gap: 1 },
  reviewComment: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  reviewDate: { fontSize: 11, color: COLORS.textTertiary },
  reviewEmpty: { fontSize: 13, color: COLORS.textTertiary, paddingVertical: 8, textAlign: 'center' },

  // Amenities
  amenitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amenityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primaryBg, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.primaryTint,
  },
  amenityEmoji: { fontSize: 13 },
  amenityLabel: { fontSize: 11, color: COLORS.primaryLight, fontWeight: '600' },

  // Book bar
  bookBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 16,
    backgroundColor: COLORS.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: -3 }, shadowRadius: 12, elevation: 8,
  },
  bookPrice: { fontFamily: FONTS.extrabold, fontSize: 22, color: COLORS.primary },
  bookPriceUnit: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
});
