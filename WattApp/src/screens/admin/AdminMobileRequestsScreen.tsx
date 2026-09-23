/**
 * AdminMobileRequestsScreen — every mobile-charge callout, for support.
 *
 * The "Live" filter is the default because a stuck live job is the only kind
 * anyone needs to act on; completed history is for looking things up afterwards.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Linking, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLang } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { MOBILE_LIVE_STATUSES, type MobileChargeRequest } from '../../types';
import { ArrowLeftIcon, PhoneIcon, XIcon } from '../../components/icons';

type Row = MobileChargeRequest & {
  customer_name: string; customer_phone: string;
  operator_name: string | null; van_label: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  pending: COLORS.gold, offered: COLORS.gold, assigned: COLORS.primary,
  en_route: COLORS.primary, arrived: COLORS.primary, charging: COLORS.primary,
  completed: COLORS.success, cancelled: COLORS.textTertiary, no_van: COLORS.error,
};

export default function AdminMobileRequestsScreen() {
  const { t, isRTL } = useLang();
  const navigation = useNavigation<any>();

  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive]       = useState(true);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const data = await api.fleet.requests().catch(() => []);
    setRows(data as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtering client-side: the endpoint caps at 100 rows, so there is nothing
  // to gain from a round trip per tab.
  const shown = live ? rows.filter(r => MOBILE_LIVE_STATUSES.includes(r.status)) : rows;

  const cancel = (r: Row) => {
    Alert.alert(t.ad_mobile_title, t.ad_mobile_cancel_confirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.confirm, style: 'destructive',
        onPress: async () => {
          try { await api.fleet.cancel(r.id, 'Cancelled by support'); await load(); }
          catch (e: any) { Alert.alert(t.error, e?.message ?? t.mc_err_generic); }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Row }) => {
    const isLive = MOBILE_LIVE_STATUSES.includes(item.status);
    const when = new Date(item.created_at).toLocaleString(isRTL ? 'ar-OM' : 'en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    return (
      <View style={styles.card}>
        <View style={[styles.top, { flexDirection: rowDir }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { textAlign: align }]}>{item.customer_name}</Text>
            <Text style={[styles.when, { textAlign: align }]}>{when}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: `${STATUS_COLOR[item.status] ?? COLORS.textTertiary}22` }]}>
            <Text style={[styles.chipTxt, { color: STATUS_COLOR[item.status] ?? COLORS.textTertiary }]}>
              {(t as any)[`mc_status_${item.status}`] ?? item.status}
            </Text>
          </View>
        </View>

        {!!item.address_text && (
          <Text style={[styles.addr, { textAlign: align }]} numberOfLines={2}>{item.address_text}</Text>
        )}

        <View style={[styles.metaRow, { flexDirection: rowDir }]}>
          <Text style={styles.meta}>
            {Number(item.requested_kwh).toFixed(0)} {t.mc_kwh_unit}
          </Text>
          <Text style={styles.meta}>
            {item.status === 'completed'
              ? `${Number(item.cost ?? 0).toFixed(3)} OMR`
              : `${Number(item.estimated_cost).toFixed(3)} OMR`}
          </Text>
          <Text style={[styles.meta, { flex: 1, textAlign: isRTL ? 'left' : 'right' }]} numberOfLines={1}>
            {item.van_label ? `${item.van_label} · ${item.operator_name ?? ''}` : t.ad_van_none}
          </Text>
        </View>

        <View style={[styles.actions, { flexDirection: rowDir }]}>
          {!!item.customer_phone && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => Linking.openURL(`tel:${item.customer_phone}`)}
            >
              <PhoneIcon size={14} color={COLORS.primary} strokeWidth={2.2} />
              <Text style={styles.actionTxt}>{item.customer_phone}</Text>
            </TouchableOpacity>
          )}
          {isLive && item.status !== 'charging' && (
            <TouchableOpacity style={[styles.actionBtn, styles.danger]} onPress={() => cancel(item)}>
              <XIcon size={14} color={COLORS.error} strokeWidth={2.4} />
              <Text style={[styles.actionTxt, { color: COLORS.error }]}>{t.mc_cancel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.ad_mobile_title}</Text>
      </View>

      <View style={[styles.tabs, { flexDirection: rowDir }]}>
        <TouchableOpacity style={[styles.tab, live && styles.tabOn]} onPress={() => setLive(true)}>
          <Text style={[styles.tabTxt, live && styles.tabTxtOn]}>{t.ad_mobile_filter_live}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, !live && styles.tabOn]} onPress={() => setLive(false)}>
          <Text style={[styles.tabTxt, !live && styles.tabTxtOn]}>{t.ad_mobile_filter_all}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={r => r.id}
          renderItem={renderItem}
          contentContainerStyle={shown.length ? styles.list : styles.listEmpty}
          ListEmptyComponent={
            <View style={styles.empty}><Text style={styles.emptyTxt}>{t.ad_mobile_empty}</Text></View>
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

  tabs: { gap: 8, padding: 16, paddingBottom: 4 },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  tabOn: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  tabTxt: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textSecondary },
  tabTxtOn: { fontFamily: FONTS.bold, color: COLORS.primary },

  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSecondary },

  card: {
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14,
  },
  top: { alignItems: 'flex-start', gap: 10 },
  name: { fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.text },
  when: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textTertiary, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  chipTxt: { fontFamily: FONTS.bold, fontSize: 11 },
  addr: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textSecondary, marginTop: 8, lineHeight: 17 },
  metaRow: { alignItems: 'center', gap: 12, marginTop: 10 },
  meta: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.text },
  actions: { gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11,
    borderWidth: 1, borderColor: COLORS.primaryTint,
  },
  danger: { borderColor: '#f6cfcf' },
  actionTxt: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.primary },
});
