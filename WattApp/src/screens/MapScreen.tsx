import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import OSMMap, { OSMMapHandle, OSMMarkerSpec, OSMRegion as Region, OSMMapType } from '../components/OSMMap';
import ErrorView from '../components/ErrorView';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { Station, ChargerListing } from '../types';
import { api } from '../lib/api';
import { listingToStation } from '../lib/listingToStation';
import { realtime } from '../lib/realtime';
import { COLORS, GRADIENTS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useCharging } from '../context/ChargingContext';
import { translateGov, stationDisplayName } from '../i18n/govMap';
import { useTabBarHeight } from '../navigation/tabBarLayout';
import { SearchIcon, LocateIcon, XIcon as CloseIcon, ZapIcon, HomeIcon, StarIcon, HeartIcon, BellIcon, NavigationIcon, PlugZapIcon, LayersIcon } from '../components/icons';
import { markerForStatus } from '../constants/mapMarkers';

const STATUS_COLOR: Record<string, string> = {
  available: COLORS.available,
  busy: COLORS.busy,
  fault: COLORS.fault,
  offline: COLORS.offline,
};

const OMAN_REGION: Region = {
  latitude: 23.588,
  longitude: 58.383,
  latitudeDelta: 3.5,
  longitudeDelta: 3.5,
};

export default function MapScreen() {
  const { t, isRTL } = useLang();
  const STATUS_LABEL: Record<string, string> = {
    available: t.status_available,
    busy: t.status_busy,
    fault: t.status_fault,
    offline: t.status_offline,
  };
  const navigation = useNavigation<any>();
  const tabBarHeight = useTabBarHeight();
  const { session, profile } = useAuth();
  const { activeSessionId, activeStationName } = useCharging();
  const isAuthenticated = !!session;
  const mapRef = useRef<OSMMapHandle>(null);

  const [mapType, setMapType] = useState<OSMMapType>('streets');
  const [stations, setStations]         = useState<Station[]>([]);
  const [listings, setListings]         = useState<ChargerListing[]>([]);
  const [myListing, setMyListing]       = useState<ChargerListing | null>(null);
  const [filtered, setFiltered]         = useState<Station[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState(false);
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState<Station | null>(null);
  const [selectedListing, setSelectedListing] = useState<ChargerListing | null>(null);
  const [showList, setShowList]         = useState(false);
  const [favStationIds, setFavStationIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount]   = useState(0);
  const [routing,     setRouting]       = useState(false);
  const [routeInfo,   setRouteInfo]     = useState<{ distance_m: number; duration_s: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  // A live mobile-charge callout, so the map can offer a way straight back to it.
  const [mobileJob,   setMobileJob]     = useState<{ id: string; status: string } | null>(null);

  // In-app directions: fetch road geometry from the backend's OSRM proxy and
  // draw it on the map, instead of handing the user off to Google Maps.
  const showDirections = useCallback(async (destLat: number, destLng: number) => {
    setRouting(true);
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        if (req.status !== 'granted') { Alert.alert(t.error, t.map_directions_need_location); return; }
      }
      const loc = await Location.getLastKnownPositionAsync() ?? await Location.getCurrentPositionAsync({});
      if (!loc) { Alert.alert(t.error, t.map_directions_no_location); return; }

      const res: any = await api.routing.route(
        { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
        { latitude: destLat, longitude: destLng },
      );
      if (!res?.coordinates?.length) throw new Error('no route');

      mapRef.current?.setRoute(res.coordinates);
      setRouteInfo({ distance_m: res.distance_m, duration_s: res.duration_s });
      setSelected(null);
    } catch (e: any) {
      // Routing not configured yet (503) is expected until OSRM is deployed —
      // say so plainly rather than showing a generic failure.
      const notConfigured = e?.status === 503 || /not configured/i.test(e?.message ?? '');
      Alert.alert(t.error, notConfigured ? t.map_directions_unavailable : t.map_directions_failed);
    } finally {
      setRouting(false);
    }
  }, [t]);

  const clearRoute = useCallback(() => {
    mapRef.current?.clearRoute();
    setRouteInfo(null);
  }, []);

  // Unread badge. Refreshed on focus so it clears after the inbox is opened and
  // picks up anything that arrived while the app was backgrounded. Guests have
  // no account, so the bell is hidden and this never fires for them.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) { setUnreadCount(0); setMobileJob(null); return; }
      let active = true;
      api.notifications.unreadCount()
        .then((r: any) => { if (active) setUnreadCount(r?.count ?? 0); })
        .catch(() => { /* badge is non-critical — leave the last known value */ });
      api.mobile.active()
        .then(j => { if (active) setMobileJob(j ? { id: j.id, status: j.status } : null); })
        .catch(() => { /* absence of a callout is the normal case */ });
      return () => { active = false; };
    }, [isAuthenticated]),
  );

  const listAnim       = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  // Rescue button pulse — conveys urgency through motion rather than a new
  // color, so it stays on-brand (gold) while still reading as "act now",
  // distinct from the report flow's static warning-triangle icon.
  const rescuePulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rescuePulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(rescuePulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const rescueRingStyle = {
    transform: [{ scale: rescuePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
    opacity: rescuePulse.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.55, 0.25, 0] }),
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 4,
      onPanResponderMove: (_, { dy }) => { if (dy > 0) sheetTranslateY.setValue(dy); },
      onPanResponderRelease: (_, { dy }) => {
        if (dy > 80) {
          Animated.timing(sheetTranslateY, {
            toValue: Dimensions.get('window').height * 0.6,
            duration: 220, useNativeDriver: true,
          }).start(() => { setShowList(false); sheetTranslateY.setValue(0); });
        } else {
          Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 8 }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    fetchStations();
    fetchListings();
    requestLocation();
    // Live station status updates.
    const off = realtime.onTable('stations', (row) => {
      setStations(prev => prev.map(s => s.id === row.id ? { ...s, ...row } : s));
    });
    return off;
  }, []);

  // Fetch investor's own charger listing (even when offline)
  useEffect(() => {
    if (profile?.role === 'investor' || profile?.role === 'host') {
      fetchMyListing();
    }
  }, [profile?.id, profile?.role]);

  // Load the user's favorite station ids (to pin them in the nearby list)
  useEffect(() => {
    if (!profile) return;
    api.favorites.list()
      .then((favs: any[]) => setFavStationIds(new Set(favs.filter(f => f.station_id).map(f => f.station_id))))
      .catch(() => {});
  }, [profile?.id]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q ? stations.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.name_ar ?? '').includes(q) ||
        s.governorate.toLowerCase().includes(q)
      ) : stations
    );
  }, [search, stations]);

  const fetchStations = async () => {
    try {
      const data = await api.stations.list();
      setStations(data as Station[]);
      setFiltered(data as Station[]);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchListings = async () => {
    try {
      const data = await api.chargers.listAvailable();
      setListings(data as ChargerListing[]);   // backend already includes host_name
    } catch { /* ignore */ }
  };

  const fetchMyListing = async () => {
    if (!profile) return;
    try {
      const data: any = await api.host.listing();
      if (data && data.latitude && data.latitude !== 0) setMyListing(data as ChargerListing);
    } catch { /* ignore */ }
  };

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 800);
    }
  };

  // Straight-line distance (km) — good enough for "how far is this charger"
  // at a glance; showDirections() gives the real road distance on request.
  const distanceKm = useCallback((lat: number, lng: number): number | null => {
    if (!userLocation) return null;
    const R = 6371;
    const dLat = (lat - userLocation.latitude) * Math.PI / 180;
    const dLng = (lng - userLocation.longitude) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(userLocation.latitude * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, [userLocation]);

  const formatDistance = (km: number) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

  const toggleList = () => {
    const toValue = showList ? 0 : 1;
    if (!showList) sheetTranslateY.setValue(0);
    setShowList(!showList);
    Animated.spring(listAnim, { toValue, useNativeDriver: true }).start();
  };

  const selectStation = (station: Station) => {
    setSelected(station);
    setSelectedListing(null);
    setShowList(false);
    mapRef.current?.animateToRegion({ latitude: station.latitude, longitude: station.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
  };

  const selectListing = (listing: ChargerListing) => {
    setSelectedListing(listing);
    setSelected(null);
    setShowList(false);
    mapRef.current?.animateToRegion({ latitude: listing.latitude, longitude: listing.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
  };

  // IDs of private listings so we know which tap handler to call in the combined list
  const listingIdSet = React.useMemo(
    () => new Set(listings.map(l => l.id)),
    [listings],
  );

  // Combined list: official stations + available private listings (excluding own).
  // Favorited stations float to the top for quick access.
  const combinedItems = React.useMemo<Station[]>(() => {
    const listingStations = listings
      .filter(l => !myListing || l.id !== myListing.id)
      .map(listingToStation);
    const all = [...filtered, ...listingStations];
    return [...all].sort((a, b) => {
      const fa = favStationIds.has(a.id) ? 1 : 0;
      const fb = favStationIds.has(b.id) ? 1 : 0;
      return fb - fa;   // favorites first, otherwise stable
    });
  }, [filtered, listings, myListing, favStationIds]);

  const renderStationCard = useCallback(({ item }: { item: Station }) => {
    const isListing = listingIdSet.has(item.id);
    const onPress = isListing
      ? () => selectListing(listings.find(l => l.id === item.id)!)
      : () => selectStation(item);
    const km = distanceKm(item.latitude, item.longitude);
    const distText = km != null ? formatDistance(km) : null;
    const subText = isListing
      ? item.operating_hours ?? ''
      : `${translateGov(item.governorate, isRTL)} • ${item.available_connectors}/${item.total_connectors} ${t.map_available}`;
    return (
      <TouchableOpacity style={styles.listCard} onPress={onPress} activeOpacity={0.8}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.status] }]} />
        <View style={styles.listCardInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
            {!isListing && favStationIds.has(item.id) && (
              <HeartIcon size={13} color={COLORS.error} filled />
            )}
            <Text style={[styles.listCardName, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
              {isListing ? item.name : stationDisplayName(item, isRTL)}
            </Text>
          </View>
          <Text style={[styles.listCardSub, { textAlign: isRTL ? 'right' : 'left' }]}>
            {subText}
          </Text>
        </View>
        <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
          <Text style={styles.listCardPrice}>{item.price_per_kwh.toFixed(3)} OMR/kWh</Text>
          {distText && <Text style={styles.listCardDistance}>{distText}</Text>}
        </View>
      </TouchableOpacity>
    );
  }, [isRTL, t, listingIdSet, listings, favStationIds, distanceKm]);

  const isInvestor = profile?.role === 'investor' || profile?.role === 'host';

  // Pins for the OSM map: official stations, other home chargers, own charger
  const mapMarkers = React.useMemo<OSMMarkerSpec[]>(() => [
    // Brand teardrop artwork, picked by service status: in service / out of
    // service / under maintenance.
    ...stations.map(s => ({
      id: `station:${s.id}`,
      latitude: s.latitude, longitude: s.longitude,
      color: STATUS_COLOR[s.status] ?? COLORS.offline,
      icon: 'zap' as const,
      brand: markerForStatus(s.status),
    })),
    ...listings
      .filter(l => !myListing || l.id !== myListing.id)
      .map(l => ({
        id: `listing:${l.id}`,
        latitude: l.latitude, longitude: l.longitude,
        color: '#3B82F6',
        icon: 'home' as const,
        // Listings carry their own status column now; is_available is the
        // fallback for rows written before that column existed.
        brand: markerForStatus((l as any).status ?? (l.is_available ? 'available' : 'offline')),
      })),
    ...(myListing ? [{
      id: `listing:${myListing.id}`,
      latitude: myListing.latitude, longitude: myListing.longitude,
      color: COLORS.gold,
      icon: 'star' as const,
    }] : []),
  ], [stations, listings, myListing]);

  const handleMarkerPress = useCallback((id: string) => {
    const [kind, realId] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    if (kind === 'station') {
      const s = stations.find(x => x.id === realId);
      if (s) selectStation(s);
    } else if (kind === 'listing') {
      const l = (myListing && myListing.id === realId) ? myListing : listings.find(x => x.id === realId);
      if (l) selectListing(l);
    }
  }, [stations, listings, myListing]);

  return (
    <View style={styles.container}>
      {/* Map — free OpenStreetMap (no API key); see OSMMap.tsx */}
      <OSMMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={OMAN_REGION}
        markers={mapMarkers}
        onMarkerPress={handleMarkerPress}
        showsUserLocation
        mapType={mapType}
      />

      {/* Stations failed to load and we have nothing to show — offer retry */}
      {loadError && !loading && stations.length === 0 && (
        <View style={styles.errorOverlay} pointerEvents="box-none">
          <View style={styles.errorCard}>
            <ErrorView compact onRetry={() => { setLoading(true); fetchStations(); fetchListings(); }} />
          </View>
        </View>
      )}

      {/* Search bar + notification bell */}
      <SafeAreaView edges={['top']} style={styles.topOverlay}>
        <View style={[styles.searchRow, isRTL && styles.searchRowRtl]}>
          <View style={[styles.searchBar, { flex: 1 }]}>
            <SearchIcon size={17} color={COLORS.textSecondary} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder={t.map_search}
              placeholderTextColor={COLORS.textSecondary}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setShowList(true)}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <CloseIcon size={16} color={COLORS.textSecondary} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>

          {/* Guests have no inbox — hidden rather than shown-and-inert. */}
          {isAuthenticated && (
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => navigation.navigate('Notifications')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t.a11y_notifications}
            >
              <BellIcon size={20} color={COLORS.text} strokeWidth={2} />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.myLocationBtn} onPress={requestLocation}>
          <LocateIcon size={20} color={COLORS.primary} strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.myLocationBtn}
          onPress={() => setMapType(v => (v === 'streets' ? 'satellite' : 'streets'))}
          accessibilityRole="button"
          accessibilityLabel={t.map_satellite_toggle}
        >
          <LayersIcon size={19} color={mapType === 'satellite' ? COLORS.primary : COLORS.textSecondary} strokeWidth={2} />
        </TouchableOpacity>

        {/* Roadside rescue. Sits on the map because that is where someone with
            a flat battery already is — not buried three taps into Profile. */}
        {isAuthenticated && (
          <View style={styles.rescueWrap}>
            <Animated.View style={[styles.rescueRing, rescueRingStyle]} pointerEvents="none" />
            <TouchableOpacity
              style={styles.rescueBtn}
              onPress={() => navigation.navigate(
                mobileJob ? 'MobileChargeTracking' : 'MobileCharge',
                mobileJob ? { requestId: mobileJob.id } : undefined as any,
              )}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t.mc_entry_title}
            >
              <PlugZapIcon size={22} color="#fff" strokeWidth={2.5} />
              {mobileJob && <View style={styles.rescueLiveDot} />}
            </TouchableOpacity>
          </View>
        )}

        {/* Active session banner — just below search */}
        {activeSessionId && !showList && (
          <TouchableOpacity
            style={styles.sessionBanner}
            onPress={() => navigation.navigate('Charging', { sessionId: activeSessionId, stationName: activeStationName ?? '' })}
            activeOpacity={0.88}
          >
            <View style={styles.sessionPulseDot} />
            <View style={styles.sessionBannerContent}>
              <Text style={styles.sessionBannerTitle}>{t.charging_session_running}</Text>
              <Text style={styles.sessionBannerSub} numberOfLines={1}>
                {activeStationName} · {t.charging_tap_resume}
              </Text>
            </View>
            <ZapIcon size={18} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </SafeAreaView>

      {/* Active route summary — also the way to dismiss the drawn route */}
      {routeInfo && (
        <View style={[styles.routeBanner, isRTL && styles.rowRev]}>
          <NavigationIcon size={18} color="#fff" strokeWidth={2.5} />
          <View style={{ flex: 1 }}>
            <Text style={styles.routeBannerTitle}>
              {(routeInfo.distance_m / 1000).toFixed(1)} km · {Math.max(1, Math.round(routeInfo.duration_s / 60))} {t.map_directions_min}
            </Text>
            <Text style={styles.routeBannerSub}>{t.map_directions_tap_clear}</Text>
          </View>
          <TouchableOpacity onPress={clearRoute} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <CloseIcon size={18} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      {/* Nearby stations pill */}
      {!showList && !selected && !selectedListing && (
        <View style={[styles.pillRow, { bottom: tabBarHeight + 12 }]}>
          <TouchableOpacity style={styles.pillShadow} onPress={toggleList} activeOpacity={0.85}>
            <LinearGradient colors={GRADIENTS.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pill}>
              <ZapIcon size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.pillText}>{t.map_nearby}</Text>
              {loading && <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 4 }} />}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Station list sheet */}
      {showList && (
        <Animated.View style={[styles.listSheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.listHandleWrap} {...panResponder.panHandlers}>
            <View style={styles.listHandle} />
            <Text style={[styles.listTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
              {t.map_stations} ({combinedItems.length}){search ? ` • "${search}"` : ''}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={combinedItems}
              keyExtractor={item => item.id}
              renderItem={renderStationCard}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
            />
          )}
        </Animated.View>
      )}

      {/* Selected listing card (other home charger) */}
      {selectedListing && !showList && (
        <View style={[styles.selectedCard, { bottom: tabBarHeight + 12 }]}>
          <View style={styles.selectedCardRow}>
            <View style={styles.selectedInfo}>
              <View style={styles.selectedNameRow}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[(selectedListing as any).status] ?? (selectedListing.is_available ? COLORS.available : COLORS.offline) }]} />
                <Text style={styles.selectedName} numberOfLines={1}>
                  {myListing?.id === selectedListing.id
                    ? `⭐ ${selectedListing.station_name ?? t.map_my_charger_label}`
                    : `🏠 ${selectedListing.station_name ?? selectedListing.host_name ?? 'Private Charger'}`}
                </Text>
              </View>
              <Text style={styles.selectedSub}>{selectedListing.address}</Text>
              <Text style={styles.selectedSub}>
                {selectedListing.charger_type} · {selectedListing.power_kw} kW · {selectedListing.availability_start}–{selectedListing.availability_end}
                {(() => { const km = distanceKm(selectedListing.latitude, selectedListing.longitude); return km != null ? ` · ${formatDistance(km)}` : ''; })()}
              </Text>
            </View>
            <View style={styles.selectedRight}>
              <Text style={styles.selectedPrice}>{selectedListing.price_per_kwh.toFixed(3)}</Text>
              <Text style={styles.selectedPriceUnit}>OMR/kWh</Text>
            </View>
          </View>
          <View style={styles.selectedBtnRow}>
            {myListing?.id === selectedListing.id ? (
              <TouchableOpacity
                style={[styles.bookBtn, { backgroundColor: COLORS.gold }]}
                onPress={() => navigation.navigate('InvestorCharger')}
                activeOpacity={0.85}
              >
                <Text style={styles.bookBtnText}>{t.inv_charger_tab}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.detailsBtn}
                  onPress={() => { setSelectedListing(null); navigation.navigate('StationDetails', { listingId: selectedListing.id }); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailsBtnText}>{t.map_details}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bookBtn, !selectedListing.is_available && styles.bookBtnDisabled]}
                  onPress={() => {
                    if (!isAuthenticated) { navigation.getParent()?.navigate('SignIn'); return; }
                    selectedListing.is_available && navigation.navigate('Booking', {
                      station: listingToStation(selectedListing),
                      listingId: selectedListing.id,
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.bookBtnText}>{selectedListing.is_available ? t.map_book : t.map_unavailable}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          <TouchableOpacity style={styles.dismissBtn} onPress={() => setSelectedListing(null)}>
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Selected station card */}
      {selected && !showList && (
        <View style={[styles.selectedCard, { bottom: tabBarHeight + 12 }]}>
          <View style={styles.selectedCardRow}>
            <View style={styles.selectedInfo}>
              <View style={styles.selectedNameRow}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[selected.status] }]} />
                <Text style={styles.selectedName} numberOfLines={1}>{selected.name}</Text>
              </View>
              <Text style={styles.selectedSub}>
                {translateGov(selected.governorate, isRTL)} · {selected.available_connectors} / {selected.total_connectors} {t.map_available}
                {(() => { const km = distanceKm(selected.latitude, selected.longitude); return km != null ? ` · ${formatDistance(km)}` : ''; })()}
              </Text>
              <Text style={styles.selectedStatus}>{STATUS_LABEL[selected.status]}</Text>
            </View>
            <View style={styles.selectedRight}>
              <Text style={styles.selectedPrice}>{selected.price_per_kwh.toFixed(3)}</Text>
              <Text style={styles.selectedPriceUnit}>OMR/kWh</Text>
            </View>
          </View>
          <View style={styles.selectedBtnRow}>
            <TouchableOpacity
              style={styles.directionsBtn}
              onPress={() => showDirections(selected.latitude, selected.longitude)}
              disabled={routing}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t.map_directions}
            >
              {routing
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <NavigationIcon size={18} color={COLORS.primary} strokeWidth={2} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.detailsBtn}
              onPress={() => { setSelected(null); navigation.navigate('StationDetails', { stationId: selected.id }); }}
              activeOpacity={0.85}
            >
              <Text style={styles.detailsBtnText}>{t.map_details}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bookBtn, selected.status !== 'available' && styles.bookBtnDisabled]}
              onPress={() => {
                if (!isAuthenticated) { navigation.getParent()?.navigate('SignIn'); return; }
                selected.status === 'available' && navigation.navigate('Booking', { station: selected });
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.bookBtnText}>{t.map_book}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.dismissBtn} onPress={() => setSelected(null)}>
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  errorOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  errorCard: {
    backgroundColor: COLORS.card, borderRadius: 20, marginHorizontal: 32,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 6 }, shadowRadius: 16, elevation: 8,
  },
  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: 8, gap: 8,
  },
  searchRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchRowRtl: { flexDirection: 'row-reverse' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  bellBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  bellBadge: {
    position: 'absolute', top: 6, right: 6,
    minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: COLORS.card,
  },
  bellBadgeText: { fontFamily: FONTS.bold, fontSize: 9, color: '#fff', lineHeight: 12 },
  rowRev: { flexDirection: 'row-reverse' },
  routeBanner: {
    position: 'absolute', top: 110, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryDark, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
    shadowColor: COLORS.primaryDark, shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  routeBannerTitle: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  routeBannerSub:   { fontFamily: FONTS.regular, fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  directionsBtn: {
    width: 46, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, backgroundColor: COLORS.primaryBg,
    borderWidth: 1.5, borderColor: COLORS.primaryTint,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.text, marginLeft: 2 },
  myLocationBtn: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.card, borderRadius: 24, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  rescueWrap: {
    alignSelf: 'flex-end', marginTop: 10,
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  rescueRing: {
    position: 'absolute',
    width: 44, height: 44, borderRadius: 24,
    backgroundColor: COLORS.gold,
  },
  rescueBtn: {
    backgroundColor: COLORS.gold, borderRadius: 24, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  rescueLiveDot: {
    position: 'absolute', top: 4, right: 4,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.primaryDark, borderWidth: 2, borderColor: COLORS.gold,
  },

  // Active session banner
  sessionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryDark, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
    shadowColor: COLORS.primaryDark, shadowOpacity: 0.4, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  sessionPulseDot: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: COLORS.primaryLight,
  },
  sessionBannerContent: { flex: 1 },
  sessionBannerTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  sessionBannerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },

  // Map pins
  pin: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  pinHome: { backgroundColor: '#3b82f6' },
  myPin: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: COLORS.gold, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },

  pillRow: { position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center' },
  pillShadow: {
    borderRadius: 24,
    shadowColor: COLORS.primaryDark, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 5 }, shadowRadius: 10, elevation: 7,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: 24,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  pillText: { color: '#fff', fontFamily: FONTS.bold, fontSize: 14 },

  listSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: Dimensions.get('window').height * 0.55,
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 16,
    shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
  listHandleWrap: { paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 10 },
  listHandle: { width: 40, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  listTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 0 },
  listCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, borderRadius: 12,
    padding: 12, marginBottom: 8, gap: 10,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  listCardInfo: { flex: 1 },
  listCardName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  listCardSub:  { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  listCardPrice:{ fontSize: 12, fontWeight: '700', color: COLORS.primary },
  listCardDistance: { fontSize: 11, color: COLORS.textTertiary, marginTop: 2 },

  selectedCard: {
    position: 'absolute', bottom: 80, left: 16, right: 16,
    backgroundColor: COLORS.card, borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  selectedCardRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  selectedInfo:     { flex: 1 },
  selectedNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  selectedName:     { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 },
  selectedSub:      { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  selectedStatus:   { fontSize: 12, color: COLORS.textSecondary },
  selectedRight:    { alignItems: 'flex-end' },
  selectedPrice:    { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  selectedPriceUnit:{ fontSize: 11, color: COLORS.textSecondary },
  selectedBtnRow:   { flexDirection: 'row', gap: 10 },
  detailsBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.primary, alignItems: 'center' },
  detailsBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
  bookBtn: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
  bookBtnDisabled: { backgroundColor: COLORS.textTertiary },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dismissBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center',
  },
  dismissText: { fontSize: 12, color: COLORS.textSecondary },
});
