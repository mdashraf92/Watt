import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError } from '../../lib/api';
import { finishCafePayment, lineUnitPrice, omr } from '../../lib/cafePay';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { COLORS } from '../../constants/colors';
import GradientButton from '../../components/GradientButton';
import ErrorView from '../../components/ErrorView';
import { PackageHeader, PackageSkeleton, packageStyles as ps } from '../packageShared';
import type { CafeDetail, CafeMenuItem, CafeOrderLine, CustomerStackParamList } from '../../types';

type Line = { key: string; item: CafeMenuItem; options: string[]; quantity: number; inPackage: boolean };
type Picking = { item: CafeMenuItem; inPackage: boolean; options: string[]; quantity: number };

function defaultOptions(item: CafeMenuItem): string[] {
  return item.options.filter(g => g.required && g.choices.length).map(g => g.choices[0].id);
}

export default function CafeMenuScreen({ route, navigation }: NativeStackScreenProps<CustomerStackParamList, 'CafeMenu'>) {
  const { stationId } = route.params;
  const { t, isRTL } = useLang();
  const { profile } = useAuth();
  const [cafe, setCafe] = useState<CafeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState<Picking | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const row = { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const };
  const text = (en: string, ar: string | null | undefined) => (isRTL ? ar || en : en);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const data = await api.cafe.detail(stationId);
      setCafe(data);
      setPackageId(prev => (prev && data.packages.some(p => p.id === prev) ? prev : data.packages[0]?.id ?? null));
      // Drop lines whose item disappeared from the menu since last load.
      setLines(prev => prev.filter(l => data.menu.some(m => m.id === l.item.id)));
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [stationId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pkg = cafe?.packages.find(p => p.id === packageId) ?? null;
  const packageLines = lines.filter(l => l.inPackage);
  const extraLines = lines.filter(l => !l.inPackage);
  const slots = pkg?.included_items ?? 0;
  const eligible = cafe?.menu.filter(m => m.package_upcharge !== null) ?? [];
  const categories = useMemo(() => {
    const map = new Map<string, CafeMenuItem[]>();
    for (const m of cafe?.menu ?? []) {
      const k = text(m.category, m.category_ar) || t.cafe_menu;
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    return [...map.entries()];
  }, [cafe, isRTL]);
  const total = (pkg?.price ?? 0) + lines.reduce((sum, l) => sum + lineUnitPrice(l.item, l.options, l.inPackage) * l.quantity, 0);
  const ready = !!pkg && packageLines.length === slots && !!cafe?.can_order;

  const openPicker = (item: CafeMenuItem, inPackage: boolean) => {
    if (inPackage && packageLines.length >= slots) {
      // Replace the drink when the package has a single slot — the common case.
      if (slots === 1) setLines(prev => prev.filter(l => !l.inPackage)); else return;
    }
    setPicking({ item, inPackage, options: defaultOptions(item), quantity: 1 });
  };

  const toggleChoice = (groupIndex: number, choiceId: string) => {
    if (!picking) return;
    const group = picking.item.options[groupIndex];
    const inGroup = group.choices.map(c => c.id);
    const max = group.max ?? 1;
    let next = picking.options.filter(id => !inGroup.includes(id) || id !== choiceId);
    const had = picking.options.includes(choiceId);
    if (!had) {
      if (max === 1) next = next.filter(id => !inGroup.includes(id));
      else if (next.filter(id => inGroup.includes(id)).length >= max) return;
      next = [...next, choiceId];
    } else if (group.required && next.filter(id => inGroup.includes(id)).length === 0) return;
    setPicking({ ...picking, options: next });
  };

  const addPicked = () => {
    if (!picking) return;
    setLines(prev => [...prev, {
      key: `${picking.item.id}:${Date.now()}`, item: picking.item, options: picking.options,
      quantity: picking.inPackage ? 1 : picking.quantity, inPackage: picking.inPackage,
    }]);
    setPicking(null);
  };

  const pay = async () => {
    if (!cafe || !pkg || !profile || !ready || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    const items: CafeOrderLine[] = lines.map(l => ({ item_id: l.item.id, quantity: l.quantity, in_package: l.inPackage, options: l.options }));
    const expected = Math.round(total * 1000) / 1000;
    const payload = JSON.stringify({ p: pkg.id, v: pkg.offer_version, items, expected, note });
    // Persist the request key with its payload BEFORE sending, so a lost response
    // or app restart replays the same order instead of creating a second one.
    const storageKey = `cafe-order:${profile.id}:${cafe.id}`;
    try {
      const saved = await AsyncStorage.getItem(storageKey).then(v => (v ? JSON.parse(v) : null)).catch(() => null);
      const key: string = saved?.payload === payload ? saved.key
        : `cafe-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      await AsyncStorage.setItem(storageKey, JSON.stringify({ key, payload }));
      const step = await api.cafe.order({ station_id: cafe.id, package_id: pkg.id, request_key: key,
        expected_total: expected, offer_version: pkg.offer_version, note, items });
      const result = await finishCafePayment(step);
      if (result.outcome === 'paid' || result.outcome === 'pending') {
        await AsyncStorage.removeItem(storageKey).catch(() => {});
        navigation.replace('CafeOrder', { orderId: step.order.id });
        return;
      }
      setMessage(result.outcome === 'cancelled' ? t.cafe_pay_cancelled : result.message ? `${t.cafe_pay_failed} (${result.message})` : t.cafe_pay_failed);
    } catch (e) {
      if (e instanceof ApiError && [400, 404, 409].includes(e.status)) {
        await AsyncStorage.removeItem(storageKey).catch(() => {});
        setMessage(e.status === 409 && /not taking orders/i.test(e.message) ? t.cafe_paused_msg : t.cafe_changed);
        void load();
      } else setMessage(e instanceof ApiError && e.status === 503 ? t.cafe_unavailable : t.cafe_error);
    } finally { inFlight.current = false; setBusy(false); }
  };

  const priceTag = (item: CafeMenuItem, inPackage: boolean) => inPackage
    ? (Number(item.package_upcharge) === 0 ? t.cafe_included : `+${omr(Number(item.package_upcharge))}`)
    : omr(Number(item.price));
  const optionSummary = (l: Line) => l.item.options.flatMap(g => g.choices).filter(c => l.options.includes(c.id)).map(c => text(c.name, c.name_ar)).join(', ');

  return <SafeAreaView style={ps.screen}>
    <PackageHeader title={cafe ? text(cafe.name, cafe.name_ar) : t.cafe_title} onBack={() => navigation.goBack()} />
    {loading && !cafe ? <View style={ps.list}><PackageSkeleton /><PackageSkeleton /></View>
      : error || !cafe ? <ErrorView onRetry={load} />
      : <>
        <ScrollView contentContainerStyle={[ps.list, { paddingBottom: 140 }]} keyboardShouldPersistTaps="handled">
          {!!cafe.image_url && <Image source={{ uri: cafe.image_url }} style={styles.cover} accessibilityIgnoresInvertColors />}
          <View style={ps.intro}>
            <Text style={[ps.body, align]}>{text(cafe.address, cafe.address_ar)}</Text>
            <Text style={[ps.small, align]}>{t.cafe_prep.replace('{n}', String(cafe.prep_minutes))} · {cafe.operating_hours}</Text>
            {!cafe.can_order && <Text style={[ps.notice, align]}>{cafe.orders_paused ? t.cafe_paused_msg : t.cafe_unavailable}</Text>}
          </View>

          <Text style={[styles.step, align]}>{t.cafe_step_package}</Text>
          {cafe.packages.length === 0 && <Text style={[ps.body, align]}>{t.pkg_none_at_venue}</Text>}
          {cafe.packages.map(p => {
            const on = p.id === packageId;
            return <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ checked: on }}
              onPress={() => { setPackageId(p.id); setLines(prev => prev.filter(l => !l.inPackage)); }}
              style={[ps.card, on && styles.selected]}>
              <View style={[row, { justifyContent: 'space-between', gap: 12 }]}>
                <Text style={[ps.cardTitle, align, { flex: 1 }]}>{text(p.name, p.name_ar)}</Text>
                <Text style={styles.pkgPrice}>{omr(p.price)}</Text>
              </View>
              <Text style={[ps.benefit, align]}>
                {[p.included_items > 0 ? t.cafe_includes_drinks.replace('{n}', String(p.included_items)) : '',
                  p.included_minutes ? t.pkg_includes_minutes.replace('{n}', String(p.included_minutes)) : '',
                  p.included_kwh ? t.pkg_includes_kwh.replace('{n}', String(p.included_kwh)) : ''].filter(Boolean).join(' + ')}
              </Text>
              {!!text(p.description, p.description_ar) && <Text style={[ps.small, align]}>{text(p.description, p.description_ar)}</Text>}
              <Text style={[ps.small, align]}>{t.pkg_valid_hours.replace('{n}', String(p.validity_hours))}</Text>
            </Pressable>;
          })}

          {pkg && slots > 0 && <>
            <Text style={[styles.step, align]}>{t.cafe_step_drink.replace('{n}', String(slots))}</Text>
            {packageLines.map(l => <View key={l.key} style={[styles.picked, row]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, align]}>✓ {text(l.item.name, l.item.name_ar)}</Text>
                {!!optionSummary(l) && <Text style={[ps.small, align]}>{optionSummary(l)}</Text>}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t.cafe_remove} hitSlop={12} onPress={() => setLines(prev => prev.filter(x => x.key !== l.key))}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>)}
            {eligible.map(m => <Pressable key={m.id} accessibilityRole="button" onPress={() => openPicker(m, true)} style={[styles.item, row]}>
              {!!m.image_url && <Image source={{ uri: m.image_url }} style={styles.itemImg} accessibilityIgnoresInvertColors />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, align]}>{text(m.name, m.name_ar)}</Text>
                {!!text(m.description, m.description_ar) && <Text style={[ps.small, align]} numberOfLines={2}>{text(m.description, m.description_ar)}</Text>}
              </View>
              <Text style={[styles.tag, Number(m.package_upcharge) === 0 && styles.tagIncluded]}>{priceTag(m, true)}</Text>
            </Pressable>)}
          </>}

          {categories.length > 0 && <Text style={[styles.step, align]}>{t.cafe_step_extras}</Text>}
          {extraLines.map(l => <View key={l.key} style={[styles.picked, row]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, align]}>{l.quantity} × {text(l.item.name, l.item.name_ar)}</Text>
              {!!optionSummary(l) && <Text style={[ps.small, align]}>{optionSummary(l)}</Text>}
            </View>
            <Text style={styles.linePrice}>{omr(lineUnitPrice(l.item, l.options, false) * l.quantity)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t.cafe_remove} hitSlop={12} onPress={() => setLines(prev => prev.filter(x => x.key !== l.key))}>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>)}
          {categories.map(([name, items]) => <View key={name} style={{ gap: 8 }}>
            <Text style={[ps.small, align, { fontWeight: '700' }]}>{name}</Text>
            {items.map(m => <Pressable key={m.id} accessibilityRole="button" onPress={() => openPicker(m, false)} style={[styles.item, row]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, align]}>{text(m.name, m.name_ar)}</Text>
              </View>
              <Text style={styles.tag}>{priceTag(m, false)}</Text>
              <Text style={styles.plus}>＋</Text>
            </Pressable>)}
          </View>)}

          <TextInput value={note} onChangeText={setNote} maxLength={300} placeholder={t.cafe_note}
            accessibilityLabel={t.cafe_note} style={[ps.card, styles.note, align]} multiline />
        </ScrollView>

        <View style={styles.bar}>
          {!!message && <Text accessibilityRole="alert" style={[ps.error, align]}>{message}</Text>}
          <View style={[row, { alignItems: 'center', gap: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[ps.small, align]}>{t.cafe_total}</Text>
              <Text style={[styles.total, align]}>{omr(total)}</Text>
            </View>
            <View style={{ flex: 1.4 }}>
              <GradientButton label={ready ? t.cafe_pay : packageLines.length < slots ? t.cafe_pick_drink : t.cafe_pay}
                loading={busy} disabled={!ready} onPress={pay} />
            </View>
          </View>
          <Text style={[ps.small, align]}>{t.cafe_card_only}</Text>
        </View>
      </>}

    <Modal visible={!!picking} transparent animationType="slide" onRequestClose={() => setPicking(null)}>
      <View style={styles.overlay}><View style={styles.sheet}>
        {picking && <ScrollView contentContainerStyle={{ gap: 14 }}>
          <Text style={[ps.cardTitle, align]}>{text(picking.item.name, picking.item.name_ar)}</Text>
          {picking.item.options.map((g, gi) => <View key={g.id} style={{ gap: 8 }}>
            <Text style={[ps.small, align, { fontWeight: '700' }]}>
              {text(g.name, g.name_ar)}{g.required ? ` · ${t.cafe_required}` : (g.max ?? 1) > 1 ? ` · ${t.cafe_up_to.replace('{n}', String(g.max))}` : ''}
            </Text>
            <View style={[row, { flexWrap: 'wrap', gap: 8 }]}>
              {g.choices.map(c => {
                const on = picking.options.includes(c.id);
                return <Pressable key={c.id} accessibilityRole={(g.max ?? 1) === 1 ? 'radio' : 'checkbox'} accessibilityState={{ checked: on }}
                  onPress={() => toggleChoice(gi, c.id)} style={[styles.choice, on && styles.choiceOn]}>
                  <Text style={[styles.choiceText, on && styles.choiceTextOn]}>
                    {text(c.name, c.name_ar)}{Number(c.price_delta) > 0 ? ` +${Number(c.price_delta).toFixed(3)}` : ''}
                  </Text>
                </Pressable>;
              })}
            </View>
          </View>)}
          {!picking.inPackage && <View style={[row, { alignItems: 'center', gap: 16 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="−" style={styles.qty} onPress={() => setPicking({ ...picking, quantity: Math.max(1, picking.quantity - 1) })}><Text style={styles.qtyText}>−</Text></Pressable>
            <Text style={ps.cardTitle}>{picking.quantity}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="+" style={styles.qty} onPress={() => setPicking({ ...picking, quantity: Math.min(20, picking.quantity + 1) })}><Text style={styles.qtyText}>+</Text></Pressable>
          </View>}
          <GradientButton label={`${t.cafe_add} · ${picking.inPackage
            ? (lineUnitPrice(picking.item, picking.options, true) === 0 ? t.cafe_included : `+${omr(lineUnitPrice(picking.item, picking.options, true))}`)
            : omr(lineUnitPrice(picking.item, picking.options, false) * picking.quantity)}`} onPress={addPicked} />
          <Pressable accessibilityRole="button" style={ps.link} onPress={() => setPicking(null)}>
            <Text style={[ps.linkText, { textAlign: 'center' }]}>{t.cancel}</Text>
          </Pressable>
        </ScrollView>}
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  cover: { width: '100%', height: 160, borderRadius: 20, backgroundColor: COLORS.backgroundAlt },
  step: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginTop: 8 },
  selected: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.primaryBg },
  pkgPrice: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  item: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 12, alignItems: 'center', minHeight: 56 },
  itemImg: { width: 48, height: 48, borderRadius: 12 },
  itemName: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  tag: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  tagIncluded: { color: COLORS.successDark },
  plus: { color: COLORS.primary, fontSize: 20, fontWeight: '800' },
  picked: { backgroundColor: COLORS.primaryBg, borderRadius: 16, padding: 14, gap: 12, alignItems: 'center' },
  linePrice: { color: COLORS.text, fontWeight: '700' },
  remove: { color: COLORS.textSecondary, fontSize: 18, paddingHorizontal: 4 },
  note: { minHeight: 64, color: COLORS.text, fontSize: 15 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: COLORS.card, borderTopWidth: 1, borderColor: COLORS.border, padding: 16, paddingBottom: 28, gap: 8 },
  total: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  choice: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  choiceOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  choiceText: { color: COLORS.text, fontSize: 14 },
  choiceTextOn: { color: COLORS.primaryDark, fontWeight: '700' },
  qty: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: COLORS.text, fontSize: 22, fontWeight: '700' },
});
