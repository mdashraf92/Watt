import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../lib/api';
import { omr } from '../../lib/cafePay';
import { useLang } from '../../context/LanguageContext';
import { COLORS } from '../../constants/colors';
import GradientButton from '../../components/GradientButton';
import ErrorView from '../../components/ErrorView';
import { PackageHeader, PackageSkeleton, packageStyles as ps } from '../packageShared';
import type { AdminCafe, AdminCafeMenuItem, AdminCafeSettlement, AdminStackParamList } from '../../types';

type Tab = 'settings' | 'menu' | 'money';
const CSV_HINT = 'category,category_ar,name,name_ar,price,package_upcharge\nCoffee,قهوة,Latte,لاتيه,2.200,0';

/**
 * Admin: turn a package venue into a Go Watt café, set the settlement split,
 * maintain the menu (manual, CSV, or Beanz sync) and pay the café out.
 * Packages themselves (price, minutes, included drinks) stay in Manage venue packages.
 */
export default function AdminCafesScreen({ navigation }: NativeStackScreenProps<AdminStackParamList, 'AdminCafes'>) {
  const { t, isRTL } = useLang();
  const [cafes, setCafes] = useState<AdminCafe[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminCafe | null>(null);
  const [tab, setTab] = useState<Tab>('settings');
  const [menu, setMenu] = useState<AdminCafeMenuItem[]>([]);
  const [money, setMoney] = useState<AdminCafeSettlement | null>(null);
  const [csv, setCsv] = useState('');
  const [item, setItem] = useState({ name: '', name_ar: '', category: '', category_ar: '', price: '', upcharge: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const row = { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const };
  const text = (en: string, ar: string | null | undefined) => (isRTL ? ar || en : en);
  const fail = (e: any) => setMessage(String(e?.message ?? t.cafe_error).split('|').pop()!);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { setCafes(await api.cafe.admin.cafes()); } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = async (c: AdminCafe, nextTab: Tab = tab) => {
    setSelected(c.id); setDraft(c); setTab(nextTab); setMessage('');
    try {
      if (nextTab === 'menu') setMenu(await api.cafe.admin.menu(c.id));
      if (nextTab === 'money') setMoney(await api.cafe.admin.settlement(c.id));
    } catch (e) { fail(e); }
  };

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await fn(); if (done) setMessage(done); } catch (e) { fail(e); }
    finally { setBusy(false); }
  };

  const save = () => draft && run(async () => {
    await api.cafe.admin.save(draft.id, {
      cafe_enabled: draft.cafe_enabled, cafe_logo_url: draft.cafe_logo_url || null, image_url: draft.image_url || null,
      prep_minutes: Number(draft.prep_minutes), menu_source: draft.menu_source, beanz_store_id: draft.beanz_store_id || null,
      charge_share_omr: Number(draft.charge_share_omr), commission_pct: Number(draft.commission_pct), beanz_fee_pct: Number(draft.beanz_fee_pct),
    });
    await load();
  }, t.cafe_admin_saved);

  const addItem = () => selected && run(async () => {
    await api.cafe.admin.addItem(selected, {
      name: item.name, name_ar: item.name_ar, category: item.category, category_ar: item.category_ar,
      price: Number(item.price), package_upcharge: item.upcharge === '' ? null : Number(item.upcharge),
    } as Partial<AdminCafeMenuItem>);
    setItem({ name: '', name_ar: '', category: item.category, category_ar: item.category_ar, price: '', upcharge: '' });
    setMenu(await api.cafe.admin.menu(selected));
  }, t.cafe_admin_saved);

  const patchItem = (m: AdminCafeMenuItem, patch: Partial<AdminCafeMenuItem>) => run(async () => {
    const updated = await api.cafe.admin.updateItem(m.id, patch);
    setMenu(prev => prev.map(x => (x.id === m.id ? updated : x)));
  });

  const field = (label: string, value: string, onChange: (v: string) => void, opts: { numeric?: boolean; ltr?: boolean } = {}) =>
    <View style={{ gap: 4 }}>
      <Text style={[ps.small, align]}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} accessibilityLabel={label} autoCapitalize="none"
        keyboardType={opts.numeric ? 'decimal-pad' : 'default'}
        style={[styles.input, opts.ltr ? { textAlign: 'left', writingDirection: 'ltr' } : align]} />
    </View>;

  const cafe = cafes.find(c => c.id === selected) ?? null;

  return <SafeAreaView style={ps.screen}>
    <PackageHeader title={cafe ? text(cafe.name, cafe.name_ar) : t.cafe_admin_title}
      onBack={() => (selected ? (setSelected(null), setDraft(null)) : navigation.goBack())} />
    {loading && !cafes.length ? <View style={ps.list}><PackageSkeleton /></View>
      : error ? <ErrorView onRetry={load} />
      : !cafe || !draft ? <ScrollView contentContainerStyle={ps.list}>
        <Text style={[ps.body, align]}>{t.cafe_admin_intro}</Text>
        {cafes.length === 0 && <Text style={[ps.notice, align]}>{t.cafe_admin_no_venues}</Text>}
        {cafes.map(c => <Pressable key={c.id} accessibilityRole="button" onPress={() => open(c, 'settings')} style={ps.card}>
          <View style={[row, { justifyContent: 'space-between' }]}>
            <Text style={[ps.cardTitle, align, { flex: 1 }]}>{text(c.name, c.name_ar)}</Text>
            <Text style={[styles.badge, c.cafe_enabled ? styles.badgeOn : null]}>{c.cafe_enabled ? t.cafe_admin_live : t.cafe_admin_off}</Text>
          </View>
          <Text style={[ps.small, align]}>
            {(c.menu_source === 'beanz' ? 'Beanz' : t.cafe_admin_manual)} · {t.cafe_admin_items.replace('{n}', String(c.menu_count))}
            {c.refunds_failed ? ` · ⚠ ${t.cafe_admin_refunds_failed.replace('{n}', String(c.refunds_failed))}` : ''}
          </Text>
        </Pressable>)}
      </ScrollView>
      : <ScrollView contentContainerStyle={ps.list} keyboardShouldPersistTaps="handled">
        <View style={[row, { gap: 8 }]}>
          {(['settings', 'menu', 'money'] as Tab[]).map(k => <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
            onPress={() => open(cafe, k)} style={[styles.tab, tab === k && styles.tabOn]}>
            <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{t[`cafe_admin_tab_${k}`]}</Text>
          </Pressable>)}
        </View>
        {!!message && <Text accessibilityRole="alert" style={[ps.notice, align]}>{message}</Text>}

        {tab === 'settings' && <View style={ps.card}>
          <View style={[row, { justifyContent: 'space-between', alignItems: 'center' }]}>
            <Text style={[ps.cardTitle, align]}>{t.cafe_admin_enabled}</Text>
            <Switch value={draft.cafe_enabled} onValueChange={v => setDraft({ ...draft, cafe_enabled: v })} accessibilityLabel={t.cafe_admin_enabled} />
          </View>
          {field(t.cafe_admin_logo, draft.cafe_logo_url ?? '', v => setDraft({ ...draft, cafe_logo_url: v }), { ltr: true })}
          {field(t.cafe_admin_cover, draft.image_url ?? '', v => setDraft({ ...draft, image_url: v }), { ltr: true })}
          {field(t.cafe_admin_prep, String(draft.prep_minutes), v => setDraft({ ...draft, prep_minutes: v as any }), { numeric: true })}
          <Text style={[ps.small, align]}>{t.cafe_admin_menu_source}</Text>
          <View style={[row, { gap: 8 }]}>
            {(['manual', 'beanz'] as const).map(s => <Pressable key={s} accessibilityRole="radio" accessibilityState={{ checked: draft.menu_source === s }}
              onPress={() => setDraft({ ...draft, menu_source: s })} style={[styles.tab, draft.menu_source === s && styles.tabOn]}>
              <Text style={[styles.tabText, draft.menu_source === s && styles.tabTextOn]}>{s === 'beanz' ? 'Beanz' : t.cafe_admin_manual}</Text>
            </Pressable>)}
          </View>
          {draft.menu_source === 'beanz' && field(t.cafe_admin_beanz_id, draft.beanz_store_id ?? '', v => setDraft({ ...draft, beanz_store_id: v }), { ltr: true })}
          <Text style={[ps.cardTitle, align, { marginTop: 8 }]}>{t.cafe_admin_split}</Text>
          <Text style={[ps.small, align]}>{t.cafe_admin_split_hint}</Text>
          {field(t.cafe_admin_charge_share, String(draft.charge_share_omr), v => setDraft({ ...draft, charge_share_omr: v as any }), { numeric: true })}
          {field(t.cafe_admin_commission, String(draft.commission_pct), v => setDraft({ ...draft, commission_pct: v as any }), { numeric: true })}
          {draft.menu_source === 'beanz' && field(t.cafe_admin_beanz_fee, String(draft.beanz_fee_pct), v => setDraft({ ...draft, beanz_fee_pct: v as any }), { numeric: true })}
          <GradientButton label={t.cafe_admin_save} loading={busy} onPress={save} />
        </View>}

        {tab === 'menu' && <>
          {cafe.menu_source === 'beanz' && <View style={ps.card}>
            <Text style={[ps.cardTitle, align]}>Beanz</Text>
            <Text style={[ps.small, align]}>
              {cafe.beanz_synced_at ? t.cafe_admin_synced.replace('{date}', new Date(cafe.beanz_synced_at).toLocaleString(isRTL ? 'ar-OM' : 'en-GB')) : t.cafe_admin_never_synced}
            </Text>
            {!!cafe.beanz_sync_error && <Text style={[ps.error, align]}>{cafe.beanz_sync_error}</Text>}
            <GradientButton label={t.cafe_admin_sync} loading={busy} onPress={() => run(async () => {
              const r = await api.cafe.admin.syncBeanz(cafe.id); setMenu(await api.cafe.admin.menu(cafe.id)); await load();
              setMessage(t.cafe_admin_items.replace('{n}', String(r.items)));
            })} />
          </View>}

          <Text style={[ps.small, align]}>{t.cafe_admin_upcharge_hint}</Text>
          {menu.map(m => <View key={m.id} style={[ps.card, { gap: 8, opacity: m.source_available ? 1 : 0.5 }]}>
            <View style={[row, { justifyContent: 'space-between', alignItems: 'center', gap: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, align]}>{text(m.name, m.name_ar)}</Text>
                <Text style={[ps.small, align]}>{text(m.category, m.category_ar)} · {omr(m.price)}{!m.source_available ? ` · ${t.cafe_admin_removed_beanz}` : ''}</Text>
              </View>
              <Switch value={m.is_available} accessibilityLabel={t.cafe_admin_available} onValueChange={v => patchItem(m, { is_available: v })} />
            </View>
            <View style={[row, { alignItems: 'center', gap: 8 }]}>
              <Text style={[ps.small, { flex: 1 }, align]}>{t.cafe_admin_upcharge}</Text>
              <TextInput defaultValue={m.package_upcharge == null ? '' : String(m.package_upcharge)} placeholder="—"
                keyboardType="decimal-pad" accessibilityLabel={t.cafe_admin_upcharge} style={[styles.input, { width: 96, textAlign: 'center' }]}
                onEndEditing={e => {
                  const v = e.nativeEvent.text.trim();
                  const next = v === '' ? null : Number(v);
                  if (next !== m.package_upcharge && (next === null || Number.isFinite(next))) patchItem(m, { package_upcharge: next });
                }} />
            </View>
          </View>)}

          {cafe.menu_source === 'manual' && <>
            <View style={ps.card}>
              <Text style={[ps.cardTitle, align]}>{t.cafe_admin_add_item}</Text>
              {field(t.cafe_admin_name_en, item.name, v => setItem({ ...item, name: v }))}
              {field(t.cafe_admin_name_ar, item.name_ar, v => setItem({ ...item, name_ar: v }))}
              {field(t.cafe_admin_category_en, item.category, v => setItem({ ...item, category: v }))}
              {field(t.cafe_admin_category_ar, item.category_ar, v => setItem({ ...item, category_ar: v }))}
              {field(t.cafe_admin_price, item.price, v => setItem({ ...item, price: v }), { numeric: true })}
              {field(t.cafe_admin_upcharge, item.upcharge, v => setItem({ ...item, upcharge: v }), { numeric: true })}
              <GradientButton label={t.cafe_admin_add_item} loading={busy} disabled={!item.name || !item.name_ar || !item.price} onPress={addItem} />
            </View>
            <View style={ps.card}>
              <Text style={[ps.cardTitle, align]}>{t.cafe_admin_csv}</Text>
              <Text style={[ps.small, align]}>{t.cafe_admin_csv_hint}</Text>
              <Text selectable style={[ps.code, { textAlign: 'left' }]}>{CSV_HINT}</Text>
              <TextInput value={csv} onChangeText={setCsv} multiline accessibilityLabel={t.cafe_admin_csv}
                style={[styles.input, { minHeight: 120, textAlign: 'left', writingDirection: 'ltr', textAlignVertical: 'top' }]} />
              <GradientButton label={t.cafe_admin_import} loading={busy} disabled={!csv.trim()} onPress={() => run(async () => {
                const r = await api.cafe.admin.importCsv(cafe.id, csv);
                const failed = r.results.filter(x => x.status === 'failed');
                setMessage(t.cafe_admin_imported.replace('{n}', String(r.created))
                  + (failed.length ? `\n${failed.map(f => `#${f.row}: ${f.message}`).join('\n')}` : ''));
                if (!failed.length) setCsv('');
                setMenu(await api.cafe.admin.menu(cafe.id));
              })} />
            </View>
          </>}
        </>}

        {tab === 'money' && money && <>
          <View style={ps.card}>
            <Text style={[ps.cardTitle, align]}>{t.cafe_admin_unsettled.replace('{n}', String(money.unsettled.orders))}</Text>
            {([['cafe_admin_gross', money.unsettled.gross], ['cafe_admin_charge_share', money.unsettled.charge_share],
               ['cafe_admin_commission_amt', money.unsettled.commission], ['cafe_admin_beanz_fee_amt', money.unsettled.beanz_fee],
               ['cafe_admin_cafe_net', money.unsettled.cafe_net]] as const).map(([k, v]) =>
              <View key={k} style={[row, { justifyContent: 'space-between' }]}>
                <Text style={[ps.body, align]}>{t[k]}</Text><Text style={ps.body}>{omr(v)}</Text>
              </View>)}
            <GradientButton label={t.cafe_admin_settle} loading={busy} disabled={!money.unsettled.orders} onPress={() => run(async () => {
              await api.cafe.admin.settle(cafe.id); setMoney(await api.cafe.admin.settlement(cafe.id));
            }, t.cafe_admin_saved)} />
          </View>
          {money.refunds.map(r => <View key={r.id} style={[ps.card, { borderColor: COLORS.error }]}>
            <Text style={[ps.cardTitle, align]}>⚠ {t.cafe_order_no.replace('{n}', String(r.number))} · {omr(r.total)}</Text>
            <Text style={[ps.small, align]}>{r.refund_status === 'failed' ? t.cafe_admin_refund_failed : t.cafe_refund_pending}{r.reject_reason ? ` · ${r.reject_reason}` : ''}</Text>
            <GradientButton label={t.cafe_admin_refund_retry} loading={busy} onPress={() => run(async () => {
              await api.cafe.admin.refund(r.id); setMoney(await api.cafe.admin.settlement(cafe.id));
            })} />
            <Text style={[ps.small, align]}>{t.cafe_admin_refund_manual_hint}</Text>
            <RefInput placeholder={t.cafe_admin_refund_manual} button={t.cafe_admin_refund_manual} busy={busy} onSubmit={ref => run(async () => {
              await api.cafe.admin.refund(r.id, ref); setMoney(await api.cafe.admin.settlement(cafe.id));
            })} />
          </View>)}
          {money.settlements.map(s => <View key={s.id} style={ps.card}>
            <View style={[row, { justifyContent: 'space-between' }]}>
              <Text style={[ps.cardTitle, align]}>{new Date(s.period_end).toLocaleDateString(isRTL ? 'ar-OM' : 'en-GB')}</Text>
              <Text style={[styles.badge, s.status === 'paid' ? styles.badgeOn : null]}>{s.status === 'paid' ? t.cafe_admin_paid : t.cafe_admin_open}</Text>
            </View>
            <Text style={[ps.body, align]}>{t.cafe_admin_settlement_line.replace('{n}', String(s.order_count)).replace('{net}', omr(s.cafe_net)).replace('{beanz}', omr(s.beanz_fee))}</Text>
            {s.status === 'open' && <RefInput placeholder={t.cafe_admin_bank_ref} button={t.cafe_admin_mark_paid} busy={busy} onSubmit={ref => run(async () => {
              await api.cafe.admin.markPaid(s.id, ref); setMoney(await api.cafe.admin.settlement(cafe.id));
            })} />}
            {!!s.bank_reference && <Text style={[ps.small, align]}>{s.bank_reference}</Text>}
          </View>)}
        </>}
      </ScrollView>}
  </SafeAreaView>;
}

function RefInput({ placeholder, button, onSubmit, busy }: { placeholder: string; button: string; onSubmit: (ref: string) => void; busy: boolean }) {
  const [ref, setRef] = useState('');
  return <View style={{ gap: 8 }}>
    <TextInput value={ref} onChangeText={setRef} placeholder={placeholder} accessibilityLabel={placeholder} style={styles.input} />
    <GradientButton label={button} loading={busy} disabled={!ref.trim()} onPress={() => onSubmit(ref.trim())} />
  </View>;
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, backgroundColor: COLORS.background, fontSize: 15 },
  tab: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontWeight: '600' },
  tabTextOn: { color: COLORS.primaryDark, fontWeight: '800' },
  badge: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, backgroundColor: COLORS.backgroundAlt, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  badgeOn: { color: COLORS.successDark, backgroundColor: COLORS.successBg },
  itemName: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
});
