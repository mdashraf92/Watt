/**
 * AdminActiveSessionsScreen — every currently-active charging session, for
 * force-resetting a stuck one. Admin-only by design (Phase 13): hosts flag a
 * stuck charger via the report-a-problem flow instead of touching billing.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLang } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import type { AdminActiveSession } from '../../lib/api';
import { COLORS } from '../../constants/colors';
import { ArrowLeftIcon, ZapIcon, AlertTriangleIcon } from '../../components/icons';

export default function AdminActiveSessionsScreen() {
  const { t, isRTL } = useLang();
  const navigation = useNavigation<any>();

  const [rows, setRows]       = useState<AdminActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);

  const align  = isRTL ? ('right' as const) : ('left' as const);
  const rowDir = isRTL ? ('row-reverse' as const) : ('row' as const);

  const load = useCallback(async () => {
    const data = await api.admin.activeSessions().catch(() => []);
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const forceStop = (session: AdminActiveSession, mode: 'bill' | 'refund') => {
    Alert.alert(
      mode === 'bill' ? t.admin_sessions_force_stop : t.admin_sessions_force_refund,
      mode === 'bill' ? t.admin_sessions_confirm_bill : t.admin_sessions_confirm_refund,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.confirm,
          style: mode === 'bill' ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(session.id);
            try {
              await api.admin.forceStopSession(session.id, mode);
              await load();
            } catch (e: any) {
              Alert.alert(t.error, e.message);
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: AdminActiveSession }) => {
    const isOverstay = !!item.booked_end && new Date(item.booked_end).getTime() < Date.now();
    return (
      <View style={s.card}>
        <View style={[s.top, { flexDirection: rowDir }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { textAlign: align }]} numberOfLines={1}>{item.customer_name}</Text>
            <Text style={[s.charger, { textAlign: align }]} numberOfLines={1}>{item.charger_name ?? '—'}</Text>
          </View>
          {isOverstay && (
            <View style={s.overstayChip}>
              <AlertTriangleIcon size={12} color={COLORS.error} strokeWidth={2.4} />
              <Text style={s.overstayChipText}>{t.admin_sessions_overstay_badge}</Text>
            </View>
          )}
        </View>

        <View style={[s.metaRow, { flexDirection: rowDir }]}>
          <Text style={s.meta}>{t.admin_sessions_started}: {new Date(item.started_at).toLocaleTimeString()}</Text>
          <Text style={s.meta}>{Number(item.kwh_delivered ?? 0).toFixed(2)} kWh</Text>
          <Text style={s.meta}>{Number(item.held_amount ?? 0).toFixed(3)} OMR {t.admin_sessions_held}</Text>
        </View>

        <View style={[s.actions, { flexDirection: rowDir }]}>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => forceStop(item, 'bill')}
            disabled={busyId === item.id}
          >
            {busyId === item.id
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <><ZapIcon size={13} color={COLORS.primary} strokeWidth={2.2} /><Text style={s.actionText}>{t.admin_sessions_force_stop}</Text></>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, s.danger]}
            onPress={() => forceStop(item, 'refund')}
            disabled={busyId === item.id}
          >
            <Text style={[s.actionText, { color: COLORS.error }]}>{t.admin_sessions_force_refund}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={[s.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { textAlign: align }]}>{t.admin_sessions_title}</Text>
      </View>

      {loading ? (
        <View style={s.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.id}
          renderItem={renderItem}
          contentContainerStyle={rows.length ? s.list : s.listEmpty}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}><ZapIcon size={30} color={COLORS.primary} strokeWidth={2} /></View>
              <Text style={s.emptyTitle}>{t.admin_sessions_empty}</Text>
              <Text style={s.emptySub}>{t.admin_sessions_empty_sub}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: COLORS.text },

  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 },

  card: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10 },
  top: { alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  charger: { fontSize: 12, color: COLORS.textTertiary, marginTop: 2 },
  overstayChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.errorBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  overstayChipText: { fontSize: 11, fontWeight: '700', color: COLORS.error },
  metaRow: { alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  meta: { fontSize: 12.5, color: COLORS.textSecondary, fontWeight: '600' },
  actions: { gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primaryTint,
  },
  danger: { borderColor: '#f6cfcf' },
  actionText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
});
