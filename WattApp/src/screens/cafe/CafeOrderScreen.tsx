import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../../lib/api';
import { realtime } from '../../lib/realtime';
import { finishCafePayment, omr } from '../../lib/cafePay';
import { useLang } from '../../context/LanguageContext';
import { COLORS } from '../../constants/colors';
import GradientButton from '../../components/GradientButton';
import ErrorView from '../../components/ErrorView';
import { PackageHeader, PackageSkeleton, packageStyles as ps } from '../packageShared';
import type { CafeOrder, CustomerStackParamList } from '../../types';

const STEPS = ['paid', 'accepted', 'ready', 'collected'] as const;
const LIVE = ['pending_payment', 'paid', 'accepted', 'ready'];

export default function CafeOrderScreen({ route, navigation }: NativeStackScreenProps<CustomerStackParamList, 'CafeOrder'>) {
  const { orderId } = route.params;
  const { t, isRTL } = useLang();
  const [order, setOrder] = useState<CafeOrder | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fetching = useRef(false);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const row = { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const };
  const text = (en: string, ar: string | null | undefined) => (isRTL ? ar || en : en);

  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try { setOrder(await api.cafe.get(orderId)); setError(false); }
    catch { setError(true); }
    finally { fetching.current = false; }
  }, [orderId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // Live: socket push from the server, with a slow poll as the safety net.
  useEffect(() => realtime.onUserEvent('cafe_order', p => { if (p?.id === orderId) void load(); }), [orderId, load]);
  useEffect(() => {
    if (!order || !LIVE.includes(order.status)) return;
    const timer = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(timer);
  }, [order?.status, load]);

  const payAgain = async () => {
    if (!order || busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await finishCafePayment(await api.cafe.pay(order.id));
      if (result.outcome === 'failed') setMessage(result.message ? `${t.cafe_pay_failed} (${result.message})` : t.cafe_pay_failed);
      if (result.outcome === 'cancelled') setMessage(t.cafe_pay_cancelled);
    } catch { setMessage(t.cafe_error); }
    finally { setBusy(false); void load(); }
  };

  const cancel = () => {
    Alert.alert(t.cafe_cancel_title, t.cafe_cancel_body, [
      { text: t.cancel, style: 'cancel' },
      { text: t.cafe_cancel_confirm, style: 'destructive', onPress: async () => {
        setBusy(true); setMessage('');
        try { await api.cafe.cancel(orderId); } catch { setMessage(t.cafe_cancel_failed); }
        finally { setBusy(false); void load(); }
      } },
    ]);
  };

  if (!order) return <SafeAreaView style={ps.screen}>
    <PackageHeader title={t.cafe_your_order} onBack={() => navigation.goBack()} />
    {error ? <ErrorView onRetry={load} /> : <View style={ps.list}><PackageSkeleton /><PackageSkeleton /></View>}
  </SafeAreaView>;

  const stepIndex = STEPS.indexOf(order.status as typeof STEPS[number]);
  const closed = order.status === 'rejected' || order.status === 'cancelled';
  const showPass = !!order.redeem_code && !closed && order.pass_status !== 'refunded';
  const minutesLeft = order.minutes_total != null ? Math.max(0, order.minutes_total - (order.minutes_used ?? 0)) : null;
  const eta = order.ready_eta ? new Date(order.ready_eta).toLocaleTimeString(isRTL ? 'ar-OM' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : null;

  return <SafeAreaView style={ps.screen}>
    <PackageHeader title={t.cafe_order_no.replace('{n}', String(order.number))} onBack={() => navigation.goBack()} />
    <ScrollView contentContainerStyle={ps.list}>
      <View style={ps.intro}>
        <Text style={[ps.eyebrow, align]}>{text(order.station_name, order.station_name_ar)}</Text>
        <Text style={[ps.title, align]}>{t[`cafe_status_${order.status}`]}</Text>
        {order.status === 'accepted' && eta && <Text style={[ps.body, align]}>{t.cafe_ready_at.replace('{time}', eta)}</Text>}
        {order.status === 'paid' && <Text style={[ps.body, align]}>{t.cafe_waiting_cafe}</Text>}
        {order.status === 'ready' && <Text style={[ps.body, align]}>{t.cafe_ready_hint}</Text>}
        {closed && <Text style={[ps.notice, align]}>
          {order.refund_status === 'refunded' ? t.cafe_refunded : order.refund_status ? t.cafe_refund_pending : t.cafe_closed_unpaid}
          {order.reject_reason ? `\n${order.reject_reason}` : ''}
        </Text>}
      </View>

      {stepIndex >= 0 && <View style={[styles.steps, row]}>
        {STEPS.map((s, i) => <View key={s} style={styles.stepCell}>
          <View style={[styles.dot, i <= stepIndex && styles.dotOn]} />
          <Text style={[styles.stepLabel, i <= stepIndex && styles.stepLabelOn]}>{t[`cafe_step_${s}`]}</Text>
        </View>)}
      </View>}

      {(order.status === 'pending_payment' || order.status === 'payment_failed') && <View style={ps.card}>
        <Text style={[ps.body, align]}>{order.status === 'payment_failed' ? t.cafe_pay_failed : t.cafe_pay_pending}</Text>
        <GradientButton label={`${t.cafe_pay} · ${omr(order.total)}`} loading={busy} onPress={payAgain} />
      </View>}

      {showPass && <View style={[ps.card, { alignItems: 'center' }]}>
        <Text style={[ps.cardTitle, { textAlign: 'center' }]}>{t.cafe_pass_title}</Text>
        <View style={styles.qr}><QRCode value={order.redeem_code!} size={176} /></View>
        <Text selectable style={ps.code}>{order.redeem_code}</Text>
        <Text style={[ps.small, { textAlign: 'center' }]}>{order.collected_at ? t.cafe_collected_hint : t.cafe_pass_hint}</Text>
      </View>}

      {showPass && order.entitlement_id && <View style={ps.card}>
        <Text style={[ps.cardTitle, align]}>⚡ {t.cafe_charging_title}</Text>
        {minutesLeft != null && <Text style={[ps.benefit, align]}>{t.pkg_remaining_minutes.replace('{n}', String(minutesLeft))}</Text>}
        {order.kwh_total != null && <Text style={[ps.body, align]}>{t.pkg_remaining_kwh.replace('{n}', Math.max(0, order.kwh_total - (order.kwh_used ?? 0)).toFixed(3))}</Text>}
        {order.expires_at && <Text style={[ps.small, align]}>{t.pkg_expires_at.replace('{date}', new Date(order.expires_at).toLocaleString(isRTL ? 'ar-OM' : 'en-GB'))}</Text>}
        <GradientButton label={t.pkg_start} disabled={order.pass_status !== 'active'}
          onPress={() => navigation.navigate('PackageCharging', { entitlementId: order.entitlement_id!, stationName: text(order.station_name, order.station_name_ar) })} />
      </View>}

      <View style={ps.card}>
        <Text style={[ps.cardTitle, align]}>{text(order.package_name, order.package_name_ar)}</Text>
        {order.items?.map((i, n) => <View key={n} style={[row, { justifyContent: 'space-between', gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[ps.body, align]}>{i.in_package ? '✓ ' : `${i.quantity} × `}{text(i.name, i.name_ar)}</Text>
            {i.options.length > 0 && <Text style={[ps.small, align]}>{i.options.map(o => text(o.name, o.name_ar)).join(', ')}</Text>}
          </View>
          <Text style={ps.small}>{i.in_package && Number(i.unit_price) === 0 ? t.cafe_included : omr(Number(i.unit_price) * i.quantity)}</Text>
        </View>)}
        {!!order.note && <Text style={[ps.small, align]}>“{order.note}”</Text>}
        <View style={[row, { justifyContent: 'space-between' }]}>
          <Text style={[ps.cardTitle, align]}>{t.cafe_total}</Text>
          <Text style={ps.cardTitle}>{omr(order.total)}</Text>
        </View>
      </View>

      {!!message && <Text accessibilityRole="alert" style={[ps.error, align]}>{message}</Text>}
      {(order.status === 'paid' || order.status === 'pending_payment' || order.status === 'payment_failed') &&
        <Pressable accessibilityRole="button" disabled={busy} onPress={cancel} style={ps.link}>
          <Text style={[ps.linkText, { color: COLORS.error, textAlign: 'center' }]}>{t.cafe_cancel}</Text>
        </Pressable>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  steps: { justifyContent: 'space-between', paddingHorizontal: 4 },
  stepCell: { flex: 1, alignItems: 'center', gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.border },
  dotOn: { backgroundColor: COLORS.primary },
  stepLabel: { color: COLORS.textTertiary, fontSize: 12, textAlign: 'center' },
  stepLabelOn: { color: COLORS.primaryDark, fontWeight: '700' },
  qr: { backgroundColor: '#fff', padding: 16, borderRadius: 16 },
});
