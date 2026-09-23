import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError } from '../../lib/api';
import type { AdminStackParamList, AdminVenuePackage, PackageDraft } from '../../types';
import { useLang } from '../../context/LanguageContext';
import { COLORS } from '../../constants/colors';
import GradientButton from '../../components/GradientButton';
import { PackageHeader, PackageSkeleton, packageStyles as styles } from '../packageShared';

type Venue = { id: string; name: string; name_ar: string | null };
const emptyForm = {
  station_id: '', name: '', name_ar: '', description: '', description_ar: '',
  partner_benefit: '', partner_benefit_ar: '', price: '', included_minutes: '',
  included_kwh: '', validity_hours: '24', sort_order: '0',
};
type Form = typeof emptyForm;

export default function AdminPackagesScreen({ navigation }: NativeStackScreenProps<AdminStackParamList, 'AdminPackages'>) {
  const { t, isRTL } = useLang();
  const [items, setItems] = useState<AdminVenuePackage[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState<AdminVenuePackage | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const label = (en: string, ar: string | null) => isRTL ? ar || en : en;
  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const [offers, stations] = await Promise.all([api.admin.packages(), api.stations.list()]);
      setItems(offers); setVenues(stations);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = (item: AdminVenuePackage | null) => {
    setEditing(item); setActive(item?.is_active ?? false); setError(''); setBlocked(false);
    const values = { ...emptyForm };
    if (item) for (const key of Object.keys(values) as (keyof Form)[]) values[key] = item[key] == null ? '' : String(item[key]);
    setForm(values); setVisible(true);
  };
  const close = () => { if (!saving.current) { setVisible(false); void load(); } };
  const save = async () => {
    if (saving.current || blocked) return;
    const minutes = form.included_minutes.trim() === '' ? null : Number(form.included_minutes);
    const kwh = form.included_kwh.trim() === '' ? null : Number(form.included_kwh);
    const price = Number(form.price);
    const hours = Number(form.validity_hours);
    const order = Number(form.sort_order);
    if (!form.station_id || !form.name.trim() || !form.name_ar.trim() || !form.partner_benefit.trim() || !form.partner_benefit_ar.trim()
      || !/^\d+(\.\d{1,3})?$/.test(form.price.trim()) || price > 9999999.999
      || (minutes === null && kwh === null)
      || (minutes !== null && (!Number.isSafeInteger(minutes) || minutes <= 0))
      || (kwh !== null && (!Number.isFinite(kwh) || kwh <= 0))
      || !Number.isSafeInteger(hours) || hours <= 0 || !Number.isSafeInteger(order)) {
      setError(t.ap_validation); return;
    }
    const body: PackageDraft = {
      ...form, name: form.name.trim(), name_ar: form.name_ar.trim(),
      partner_benefit: form.partner_benefit.trim(), partner_benefit_ar: form.partner_benefit_ar.trim(),
      price, included_minutes: minutes, included_kwh: kwh, validity_hours: hours, sort_order: order,
    };
    saving.current = true; setBusy(true); setError('');
    try {
      if (editing) await api.admin.updatePackage(editing.id, { ...body, is_active: active, expected_version: editing.offer_version });
      else await api.admin.createPackage(body);
      setVisible(false);
      await load();
    } catch (e) {
      // An interrupted response can follow a committed create. Require a reload
      // before another submission so a blind retry cannot duplicate the offer.
      setBlocked(true);
      setError(e instanceof ApiError && e.status === 409 ? t.ap_conflict : t.ap_failed);
    } finally { saving.current = false; setBusy(false); }
  };
  const fields: { key: Exclude<keyof Form, 'station_id'>; title: string; numeric?: boolean; multiline?: boolean; arabic?: boolean }[] = [
    { key: 'name', title: t.ap_name }, { key: 'name_ar', title: t.ap_name_ar, arabic: true },
    { key: 'description', title: t.ap_description, multiline: true }, { key: 'description_ar', title: t.ap_description_ar, multiline: true, arabic: true },
    { key: 'partner_benefit', title: t.ap_benefit }, { key: 'partner_benefit_ar', title: t.ap_benefit_ar, arabic: true },
    { key: 'price', title: t.ap_price, numeric: true }, { key: 'included_minutes', title: t.ap_minutes, numeric: true },
    { key: 'included_kwh', title: t.ap_kwh, numeric: true }, { key: 'validity_hours', title: t.ap_hours, numeric: true },
    { key: 'sort_order', title: t.ap_order, numeric: true },
  ];

  return <SafeAreaView style={styles.screen}>
    <PackageHeader title={t.ap_title} onBack={() => navigation.goBack()} />
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={[styles.body, align]}>{t.ap_intro}</Text>
      <GradientButton label={t.vo_title} onPress={() => navigation.navigate('AdminVenueOperations')} />
      <GradientButton label={t.ap_new} onPress={() => open(null)} disabled={loading || loadError || venues.length === 0} />
      <Pressable accessibilityRole="button" onPress={() => void load()} disabled={loading} style={styles.link}><Text style={[styles.linkText, align]}>{t.ap_refresh}</Text></Pressable>
      {loading ? <PackageSkeleton /> : loadError ? <Text accessibilityRole="alert" style={styles.error}>{t.ap_load_failed}</Text> : <>
        {items.length === 0 && <Text style={[styles.body, align]}>{t.ap_empty}</Text>}
        {items.map(item => <View key={item.id} style={styles.card}>
          <Text style={[styles.eyebrow, align]}>{label(item.station_name, item.station_name_ar)}</Text>
          <Text style={[styles.cardTitle, align]}>{label(item.name, item.name_ar)}</Text>
          <Text style={[styles.body, align]}>{label(item.partner_benefit, item.partner_benefit_ar)}</Text>
          <Text style={[styles.price, align]}>{Number(item.price).toFixed(3)} OMR</Text>
          <Text style={[styles.small, align]}>{item.is_active ? t.ap_active : t.ap_paused} · {t.ap_sold.replace('{n}', String(item.sold_count))}</Text>
          <GradientButton label={t.ap_edit} onPress={() => open(item)} />
        </View>)}
      </>}
    </ScrollView>
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <PackageHeader title={editing ? t.ap_edit : t.ap_new} onBack={close} />
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            <Text style={[styles.notice, align]}>{editing ? t.ap_intro : t.ap_draft}</Text>
            <Text style={[styles.cardTitle, align]}>{t.ap_venue}</Text>
            {venues.map(venue => <Pressable key={venue.id} accessibilityRole="radio" accessibilityState={{ checked: form.station_id === venue.id, disabled: busy || blocked }}
              disabled={busy || blocked} onPress={() => setForm(v => ({ ...v, station_id: venue.id }))}
              style={[local.input, form.station_id === venue.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }]}>
              <Text style={[styles.body, align]}>{form.station_id === venue.id ? '✓ ' : ''}{label(venue.name, venue.name_ar)}</Text>
            </Pressable>)}
            {fields.map(field => <View key={field.key} style={{ gap: 6 }}>
              <Text style={[styles.small, align]}>{field.title}</Text>
              <TextInput accessibilityLabel={field.title} value={form[field.key]} editable={!busy && !blocked}
                onChangeText={value => setForm(v => ({ ...v, [field.key]: value }))}
                keyboardType={field.numeric ? 'decimal-pad' : 'default'} multiline={field.multiline}
                maxLength={field.multiline ? 4000 : field.numeric ? 16 : 250}
                style={[local.input, { textAlign: field.arabic ? 'right' : 'left', writingDirection: field.arabic ? 'rtl' : 'ltr' }]} />
            </View>)}
            {editing && <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.body}>{t.ap_active}</Text>
              <Switch accessibilityLabel={t.ap_active} value={active} onValueChange={setActive} disabled={busy || blocked} />
            </View>}
            {!!error && <Text accessibilityRole="alert" style={[styles.error, align]}>{error}</Text>}
            <GradientButton label={t.ap_save} onPress={() => void save()} loading={busy} disabled={blocked} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.link}><Text style={[styles.linkText, align]}>{t.ap_close}</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const local = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, color: COLORS.text, backgroundColor: COLORS.card, fontSize: 16 },
});
