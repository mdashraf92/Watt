import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../lib/api';
import { realtime } from '../../lib/realtime';
import { omr } from '../../lib/cafePay';
import { useLang } from '../../context/LanguageContext';
import { COLORS } from '../../constants/colors';
import GradientButton from '../../components/GradientButton';
import ErrorView from '../../components/ErrorView';
import { PackageHeader, PackageSkeleton, packageStyles as ps } from '../packageShared';
import type { CafeStaffOrder, CafeStaffVenue, CustomerStackParamList } from '../../types';

type Action = 'accept' | 'ready' | 'collect' | 'reject';

/**
 * The café's order board — designed for a phone or tablet left on the counter.
 * Three taps per order: Accept → Ready → Collected (after checking the code).
 */
export default function CafeStaffOrdersScreen({ navigation }: NativeStackScreenProps<CustomerStackParamList, 'CafeStaffOrders'>) {
  const { t, isRTL } = useLang();
  const [venues, setVenues] = useState<CafeStaffVenue[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [orders, setOrders] = useState<CafeStaffOrder[]>([]);
  const [today, setToday] = useState<{ collected: number; cafe_net: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const known = useRef<Set<string>>(new Set());
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const row = { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const };
  const text = (en: string, ar: string | null | undefined) => (isRTL ? ar || en : en);
  const venue = venues.find(v => v.id === venueId) ?? null;

  const loadOrders = useCallback(async (id: string) => {
    try {
      const data = await api.cafe.staffOrders(id);
      // Buzz once for every order we have not seen before.
      const fresh = data.orders.filter(o => o.status === 'paid' && !known.current.has(o.id));
      if (fresh.length && known.current.size) Vibration.vibrate([0, 400, 200, 400]);
      data.orders.forEach(o => known.current.add(o.id));
      setOrders(data.orders); setToday(data.today); setError(false);
    } catch { setError(true); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.cafe.staffVenues();
      setVenues(list);
      const id = venueId && list.some(v => v.id === venueId) ? venueId : list[0]?.id ?? null;
      setVenueId(id);
      if (id) await loadOrders(id);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [venueId, loadOrders]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!venueId) return;
    const off = realtime.onUserEvent('cafe_order', p => { if (!p?.station_id || p.station_id === venueId) void loadOrders(venueId); });
    const timer = setInterval(() => { void loadOrders(venueId); }, 15_000);
    return () => { off(); clearInterval(timer); };
  }, [venueId, loadOrders]);

  const act = async (order: CafeStaffOrder, action: Action, reason?: string) => {
    setBusyId(order.id); setMessage('');
    try { await api.cafe.staffAction(order.id, action, reason); }
    catch (e: any) { setMessage(e?.message?.split('|').pop() ?? t.pkg_staff_error); }
    finally { setBusyId(null); if (venueId) void loadOrders(venueId); }
  };

  const reject = (order: CafeStaffOrder) => Alert.alert(t.cafe_staff_reject_title, t.cafe_staff_reject_body, [
    { text: t.cancel, style: 'cancel' },
    { text: t.cafe_staff_out_of_stock, onPress: () => act(order, 'reject', 'Item unavailable') },
    { text: t.cafe_staff_too_busy, style: 'destructive', onPress: () => act(order, 'reject', 'Café too busy') },
  ]);

  const lookup = async () => {
    setMessage('');
    try {
      const found = await api.cafe.staffLookup(code.trim());
      const order = orders.find(o => o.id === found.id);
      if (!order) { setMessage(t.cafe_staff_code_status.replace('{n}', String(found.number)).replace('{status}', (t as Record<string, string>)[`cafe_status_${found.status}`] ?? found.status)); return; }
      Alert.alert(t.cafe_order_no.replace('{n}', String(found.number)), t.cafe_staff_handover, [
        { text: t.cancel, style: 'cancel' },
        { text: t.cafe_staff_collect, onPress: async () => { await act(order, 'collect'); setCode(''); } },
      ]);
    } catch { setMessage(t.cafe_staff_code_unknown); }
  };

  const togglePause = async (paused: boolean) => {
    if (!venue) return;
    setVenues(prev => prev.map(v => (v.id === venue.id ? { ...v, orders_paused: paused } : v)));
    try { await api.cafe.staffPause(venue.id, paused); }
    catch { setVenues(prev => prev.map(v => (v.id === venue.id ? { ...v, orders_paused: !paused } : v))); setMessage(t.pkg_staff_error); }
  };

  const columns: { status: CafeStaffOrder['status']; title: string }[] = [
    { status: 'paid', title: t.cafe_staff_new },
    { status: 'accepted', title: t.cafe_staff_preparing },
    { status: 'ready', title: t.cafe_staff_ready },
  ];

  const card = (o: CafeStaffOrder) => {
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(o.paid_at)) / 60000));
    return <View key={o.id} style={[styles.order, o.status === 'paid' && styles.orderNew]}>
      <View style={[row, { justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={styles.orderNo}>#{o.number}</Text>
        <Text style={ps.small}>{t.cafe_staff_minutes_ago.replace('{n}', String(minutes))}</Text>
      </View>
      {!!o.customer_name && <Text style={[ps.small, align]}>{o.customer_name}</Text>}
      {o.items.map((i, n) => <Text key={n} style={[styles.line, align]}>
        {i.quantity} × {text(i.name, i.name_ar)}{i.options.length ? ` (${i.options.map(x => text(x.name, x.name_ar)).join(', ')})` : ''}
      </Text>)}
      {!!o.note && <Text style={[styles.noteText, align]}>“{o.note}”</Text>}
      {o.status === 'paid' && <View style={[row, { gap: 10 }]}>
        <View style={{ flex: 2 }}><GradientButton label={t.cafe_staff_accept} loading={busyId === o.id} onPress={() => act(o, 'accept')} /></View>
        <Pressable accessibilityRole="button" disabled={busyId === o.id} onPress={() => reject(o)} style={styles.rejectBtn}>
          <Text style={styles.rejectText}>{t.cafe_staff_reject}</Text>
        </Pressable>
      </View>}
      {o.status === 'accepted' && <GradientButton label={t.cafe_staff_mark_ready} loading={busyId === o.id} onPress={() => act(o, 'ready')} />}
      {o.status === 'ready' && <GradientButton label={t.cafe_staff_collect} variant="gold" loading={busyId === o.id}
        onPress={() => Alert.alert(t.cafe_order_no.replace('{n}', String(o.number)), t.cafe_staff_handover, [
          { text: t.cancel, style: 'cancel' }, { text: t.cafe_staff_collect, onPress: () => act(o, 'collect') }])} />}
    </View>;
  };

  return <SafeAreaView style={ps.screen}>
    <PackageHeader title={t.cafe_staff_title} onBack={() => navigation.goBack()} />
    {loading && !venues.length ? <View style={ps.list}><PackageSkeleton /></View>
      : error && !venues.length ? <ErrorView onRetry={load} />
      : !venue ? <Text style={[ps.body, ps.list, align]}>{t.cafe_staff_no_venue}</Text>
      : <ScrollView contentContainerStyle={ps.list} keyboardShouldPersistTaps="handled">
        {venues.length > 1 && <View style={[row, { flexWrap: 'wrap', gap: 8 }]}>
          {venues.map(v => <Pressable key={v.id} accessibilityRole="tab" accessibilityState={{ selected: v.id === venueId }}
            onPress={() => { known.current.clear(); setVenueId(v.id); void loadOrders(v.id); }}
            style={[styles.venueChip, v.id === venueId && styles.venueChipOn]}>
            <Text style={[styles.venueText, v.id === venueId && styles.venueTextOn]}>{text(v.name, v.name_ar)}</Text>
          </Pressable>)}
        </View>}

        <View style={[ps.card, row, { alignItems: 'center', justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[ps.cardTitle, align]}>{venue.orders_paused ? t.cafe_staff_paused : t.cafe_staff_open}</Text>
            {today && <Text style={[ps.small, align]}>{t.cafe_staff_today.replace('{n}', String(today.collected)).replace('{amount}', omr(today.cafe_net))}</Text>}
          </View>
          <Switch accessibilityLabel={t.cafe_staff_open} value={!venue.orders_paused} onValueChange={v => togglePause(!v)}
            trackColor={{ true: COLORS.primary, false: COLORS.border }} />
        </View>

        <View style={[row, { gap: 10 }]}>
          <TextInput value={code} onChangeText={setCode} placeholder={t.cafe_staff_code} accessibilityLabel={t.cafe_staff_code}
            autoCapitalize="characters" autoCorrect={false} maxLength={100} style={[ps.card, styles.codeInput]} onSubmitEditing={lookup} />
          <View style={{ width: 110, justifyContent: 'center' }}><GradientButton label={t.pkg_lookup} disabled={!code.trim()} onPress={lookup} /></View>
        </View>
        {!!message && <Text accessibilityRole="alert" style={[ps.error, align]}>{message}</Text>}

        <TextInput value={search} onChangeText={setSearch} placeholder={isRTL?'بحث برقم الطلب أو اسم العميل':'Search order number or customer'} accessibilityLabel={isRTL?'بحث الطلبات':'Search orders'} style={ps.card} autoCorrect={false} />
        {columns.map(c => {
          const q=search.trim().toLowerCase();
          const list = orders.filter(o => o.status === c.status && (!q||String(o.number).includes(q)||o.customer_name?.toLowerCase().includes(q))).sort((a,b)=>Date.parse(a.paid_at)-Date.parse(b.paid_at));
          return <View key={c.status} style={{ gap: 10 }}>
            <Text style={[styles.column, align]}>{c.title} ({list.length})</Text>
            {list.length ? list.map(card) : <Text style={[ps.small, align]}>{t.cafe_staff_empty}</Text>}
          </View>;
        })}
      </ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  venueChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, minHeight: 44, justifyContent: 'center' },
  venueChipOn: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  venueText: { color: COLORS.text },
  venueTextOn: { color: COLORS.primaryDark, fontWeight: '700' },
  codeInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: COLORS.text, letterSpacing: 1 },
  column: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginTop: 8 },
  order: { backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 8 },
  orderNew: { borderColor: COLORS.gold, borderWidth: 2, backgroundColor: COLORS.goldBg },
  orderNo: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  line: { color: COLORS.text, fontSize: 16 },
  noteText: { color: COLORS.textSecondary, fontStyle: 'italic' },
  rejectBtn: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: COLORS.error, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  rejectText: { color: COLORS.error, fontWeight: '700' },
});
