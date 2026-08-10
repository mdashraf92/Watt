/**
 * FavoritesScreen — chargers the user has saved with the heart icon.
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
import type { CustomerStackParamList, Favorite } from '../types';
import { ArrowLeftIcon, HeartIcon, ChevronRightIcon, ZapIcon, TrashIcon } from '../components/icons';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'Favorites'>;

export default function FavoritesScreen() {
  const navigation = useNavigation<Nav>();
  const { t, isRTL } = useLang();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const data = await api.favorites.list().catch(() => []);
    setFavorites(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = (fav: Favorite) => {
    Alert.alert(t.fav_remove, t.fav_remove_confirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.fav_remove, style: 'destructive',
        onPress: async () => {
          try { await api.favorites.remove(fav.id); await load(); }
          catch { /* silently ignore — list will just refresh unchanged */ }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Favorite }) => {
    const name = item.listing_id ? item.listing_name : item.station_name;
    const subtitle = item.listing_id ? item.listing_address : t.fav_public_station;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('StationDetails',
          item.listing_id ? { listingId: item.listing_id } : { stationId: item.station_id! })}
      >
        <View style={[styles.row, { flexDirection: rowDir }]}>
          <View style={styles.icon}>
            <ZapIcon size={18} color="#fff" strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { textAlign: align }]} numberOfLines={1}>
              {name}
            </Text>
            {!!subtitle && (
              <Text style={[styles.meta, { textAlign: align }]} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => remove(item)} hitSlop={10} style={styles.removeBtn}>
            <TrashIcon size={16} color={COLORS.textTertiary} strokeWidth={2} />
          </TouchableOpacity>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronRightIcon size={18} color={COLORS.textTertiary} strokeWidth={2} />
          </View>
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
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.fav_title}</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={favorites.length ? styles.list : styles.listEmpty}
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
                <HeartIcon size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{t.fav_empty_title}</Text>
              <Text style={styles.emptySub}>{t.fav_empty_sub}</Text>
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

  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  row: { alignItems: 'center', gap: 12 },
  icon: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.text },
  meta: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textTertiary, marginTop: 2 },
  removeBtn: { padding: 4 },

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
});
