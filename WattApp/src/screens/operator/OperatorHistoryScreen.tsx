/**
 * OperatorHistoryScreen — the driver's completed and cancelled callouts.
 * Their own record of the day's work, and the first thing to check when a
 * customer queries a job.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../lib/api';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { useLang } from '../../context/LanguageContext';
import { useTabBarHeight } from '../../navigation/tabBarLayout';
import type { OperatorJob } from '../../types';
import { ZapIcon, HistoryIcon } from '../../components/icons';

export default function OperatorHistoryScreen() {
  const { t, isRTL } = useLang();
  const tabBarHeight = useTabBarHeight();
  const [items, setItems] = useState<OperatorJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const data = await api.operator.jobs().catch(() => null);
    setItems(data?.history ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.op_tab_history}</Text>
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={
            items.length
              ? [styles.list, { paddingBottom: tabBarHeight + 24 }]
              : styles.listEmpty
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => {
            const done = item.status === 'completed';
            const date = new Date(item.created_at).toLocaleDateString(isRTL ? 'ar-OM' : 'en-OM', {
              day: '2-digit', month: 'short',
            });
            const time = new Date(item.created_at).toLocaleTimeString(isRTL ? 'ar-OM' : 'en-OM', {
              hour: '2-digit', minute: '2-digit',
            });
            return (
              <View style={[styles.card, { flexDirection: rowDir }]}>
                <View style={[styles.icon, !done && styles.iconMuted]}>
                  <ZapIcon size={18} color={done ? '#fff' : COLORS.textSecondary} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { textAlign: align }]} numberOfLines={1}>
                    {item.customer_name}
                  </Text>
                  <Text style={[styles.meta, { textAlign: align }]}>
                    {date} · {time} · {(t as any)[`mc_status_${item.status}`] ?? item.status}
                  </Text>
                </View>
                <Text style={styles.kwh}>
                  {done ? `${Number(item.kwh_delivered ?? 0).toFixed(1)} kWh` : '—'}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <HistoryIcon size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{t.op_history_empty}</Text>
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
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.text },
  list: { padding: 16, gap: 10 },
  listEmpty: { flexGrow: 1 },
  card: {
    alignItems: 'center', gap: 12, padding: 14,
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  icon: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  iconMuted: { backgroundColor: COLORS.backgroundAlt },
  name: { fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.text },
  meta: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  kwh: { fontFamily: FONTS.bold, fontSize: 13.5, color: COLORS.primary },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { fontFamily: FONTS.bold, fontSize: 15.5, color: COLORS.text },
});
