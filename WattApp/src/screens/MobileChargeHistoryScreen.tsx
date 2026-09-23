/**
 * MobileChargeHistoryScreen — past callouts.
 *
 * A live job here is tappable and reopens tracking, because a customer who
 * backgrounded the app mid-callout will look for their van in the obvious place.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import {
  MOBILE_LIVE_STATUSES, type CustomerStackParamList, type MobileChargeRequest,
} from '../types';
import { ArrowLeftIcon, ZapIcon, ChevronRightIcon } from '../components/icons';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'MobileChargeHistory'>;

export default function MobileChargeHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const { t, isRTL } = useLang();
  const [items, setItems]   = useState<MobileChargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const data = await api.mobile.list().catch(() => []);
    setItems(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (r: MobileChargeRequest) => {
    if (MOBILE_LIVE_STATUSES.includes(r.status)) {
      navigation.navigate('MobileChargeTracking', { requestId: r.id });
    } else if (r.status === 'completed') {
      navigation.navigate('MobileChargeSummary', {
        requestId: r.id, kwh: Number(r.kwh_delivered ?? 0), cost: Number(r.cost ?? 0),
      });
    }
  };

  const renderItem = ({ item }: { item: MobileChargeRequest }) => {
    const live = MOBILE_LIVE_STATUSES.includes(item.status);
    const date = new Date(item.created_at).toLocaleDateString(isRTL ? 'ar-OM' : 'en-OM', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    const label = (t as any)[`mc_status_${item.status}`] ?? item.status;
    return (
      <TouchableOpacity
        style={[styles.card, { flexDirection: rowDir }]}
        onPress={() => open(item)}
        activeOpacity={item.status === 'cancelled' || item.status === 'no_van' ? 1 : 0.7}
      >
        <View style={[styles.iconWrap, live && styles.iconWrapLive]}>
          <ZapIcon size={20} color={live ? '#fff' : COLORS.primary} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { textAlign: align }]} numberOfLines={1}>
            {item.address_text || t.mc_title}
          </Text>
          <Text style={[styles.cardSub, { textAlign: align }]}>
            {date} · {label}
          </Text>
        </View>
        <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
          <Text style={styles.cardCost}>
            {item.status === 'completed'
              ? `${Number(item.cost ?? 0).toFixed(3)} OMR`
              : `${Number(item.requested_kwh).toFixed(0)} ${t.mc_kwh_unit}`}
          </Text>
          {live && <Text style={styles.liveTag}>●</Text>}
        </View>
        <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
          <ChevronRightIcon size={18} color={COLORS.textTertiary} strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.mc_history_title}</Text>
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={items.length ? styles.list : styles.listEmpty}
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
                <ZapIcon size={30} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{t.mc_history_empty}</Text>
              <Text style={styles.emptySub}>{t.mc_history_empty_sub}</Text>
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
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text },

  list: { padding: 16, gap: 10 },
  listEmpty: { flexGrow: 1 },
  card: {
    alignItems: 'center', gap: 12, padding: 14,
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  iconWrap: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapLive: { backgroundColor: COLORS.primary },
  cardTitle: { fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.text },
  cardSub: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  cardCost: { fontFamily: FONTS.bold, fontSize: 13.5, color: COLORS.text },
  liveTag: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.primary, marginTop: 2 },

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
