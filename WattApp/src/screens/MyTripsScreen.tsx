/**
 * MyTripsScreen — saved journeys.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import type { CustomerStackParamList, SavedTrip } from '../types';
import {
  ArrowLeftIcon, NavigationIcon, ChevronRightIcon, TrashIcon, PlusIcon,
} from '../components/icons';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'MyTrips'>;

export default function MyTripsScreen() {
  const navigation = useNavigation<Nav>();
  const { t, isRTL } = useLang();
  const [trips, setTrips]   = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const data = await api.trips.list().catch(() => []);
    setTrips(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = (trip: SavedTrip) => {
    Alert.alert(t.tp_delete, t.tp_delete_confirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.tp_delete, style: 'destructive',
        onPress: async () => {
          try { await api.trips.remove(trip.id); await load(); }
          catch { Alert.alert(t.error, t.tp_err_generic); }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: SavedTrip }) => {
    const statusLabel = (t as any)[`tp_status_${item.status}`] ?? item.status;
    const date = new Date(item.created_at).toLocaleDateString(isRTL ? 'ar-OM' : 'en-OM', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}
        activeOpacity={0.85}
      >
        <View style={[styles.top, { flexDirection: rowDir }]}>
          <View style={styles.icon}>
            <NavigationIcon size={18} color="#fff" strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { textAlign: align }]} numberOfLines={1}>
              {item.name || `${item.from_label} → ${item.to_label}`}
            </Text>
            <Text style={[styles.meta, { textAlign: align }]}>
              {date} · {statusLabel}
            </Text>
          </View>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronRightIcon size={18} color={COLORS.textTertiary} strokeWidth={2} />
          </View>
        </View>

        <View style={[styles.stats, { flexDirection: rowDir }]}>
          <Text style={styles.stat}>{item.plan?.distance_km ?? 0} km</Text>
          <Text style={styles.stat}>
            {item.stop_count ?? item.plan?.stops?.length ?? 0} {t.tp_summary_stops}
          </Text>
          <Text style={[styles.stat, { flex: 1, textAlign: isRTL ? 'left' : 'right' }]}>
            {Number(item.plan?.total_cost ?? 0).toFixed(3)} OMR
          </Text>
          <TouchableOpacity onPress={() => remove(item)} hitSlop={10}>
            <TrashIcon size={15} color={COLORS.textTertiary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.tp_my_trips}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('TripPlanner')}
          style={styles.addBtn}
          hitSlop={10}
        >
          <PlusIcon size={19} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={trips.length ? styles.list : styles.listEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <NavigationIcon size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{t.tp_trips_empty}</Text>
              <Text style={styles.emptySub}>{t.tp_trips_empty_sub}</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('TripPlanner')}
              >
                <Text style={styles.emptyBtnTxt}>{t.tp_entry_title}</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
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
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text },
  addBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  top: { alignItems: 'center', gap: 12 },
  icon: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.text },
  meta: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textTertiary, marginTop: 2 },
  stats: {
    alignItems: 'center', gap: 14, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  stat: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textSecondary },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text },
  emptySub: {
    fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 6, lineHeight: 19,
  },
  emptyBtn: {
    marginTop: 18, paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: 14, backgroundColor: COLORS.primary,
  },
  emptyBtnTxt: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
});
