import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../lib/api';
import type { AdminStackParamList, PackageDeviceConfig, VenueOperations, VenueStaffMember } from '../../types';
import { useLang } from '../../context/LanguageContext';
import { COLORS } from '../../constants/colors';
import GradientButton from '../../components/GradientButton';
import { PackageHeader, PackageSkeleton, packageStyles as styles } from '../packageShared';

type Venue = { id: string; name: string; name_ar?: string };
type Confirmation = { label: string; action: () => Promise<unknown> };
export default function AdminVenueOperationsScreen({ navigation }: NativeStackScreenProps<AdminStackParamList, 'AdminVenueOperations'>) {
  const { t, isRTL } = useLang();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState('');
  const [data, setData] = useState<VenueOperations | null>(null);
  const [mode, setMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<VenueStaffMember[]>([]);
  const [searched, setSearched] = useState(false);
  const [device, setDevice] = useState<PackageDeviceConfig | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [switchCode, setSwitchCode] = useState('');
  const [energyCode, setEnergyCode] = useState('');
  const [scale, setScale] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const name = (v: { name: string; name_ar?: string | null }) => isRTL ? v.name_ar || v.name : v.name;
  const load = useCallback(async (id: string) => {
    const revision = ++generation.current;
    setLoading(true); setMessage(''); setData(null);
    try {
      const [all, operations] = await Promise.all([api.stations.list(), id ? api.admin.venueOperations(id) : Promise.resolve(null)]);
      if (revision !== generation.current) return;
      setVenues(all); setData(operations); setMode(operations?.venue.is_package_venue ?? false);
    } catch { if (revision === generation.current) setMessage(t.vo_failed); }
    finally { if (revision === generation.current) setLoading(false); }
  }, [t.vo_failed]);
  useFocusEffect(useCallback(() => { void load(venueId); return () => { generation.current++; }; }, [load, venueId]));
  const mutate = async (action: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try { await action(); setDevice(null); setConfirmation(null); await load(venueId); setMessage(t.vo_saved); }
    catch { setDevice(null); setConfirmation(null); await load(venueId); setMessage(t.vo_failed); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const search = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMatches([]); setSearched(false); setMessage('');
    try { setMatches(await api.admin.findVenueStaff(phone.trim())); setSearched(true); }
    catch { setMessage(t.vo_failed); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const editDevice = (d: PackageDeviceConfig) => {
    setDevice(d); setDeviceId(d.device_id ?? ''); setSwitchCode(d.switch_code ?? '');
    setEnergyCode(d.energy_code ?? ''); setScale(d.energy_scale == null ? '' : String(d.energy_scale));
    setEnabled(d.enabled); setDeviceError('');
  };
  const saveDevice = () => {
    if (!device) return;
    if (!deviceId.trim() || !/^[a-zA-Z0-9_]+$/.test(switchCode) || !/^[a-zA-Z0-9_]+$/.test(energyCode)
      || !Number.isFinite(Number(scale)) || Number(scale) <= 0 || Number(scale) > 1000) { setDeviceError(t.vo_invalid); return; }
    void mutate(() => api.admin.savePackageDevice({ connector_id: device.connector_id, device_id: deviceId.trim(),
      switch_code: switchCode, energy_code: energyCode, energy_scale: Number(scale), enabled }));
  };
  const link = (title: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={action} style={styles.link}>
    <Text style={[styles.linkText, align, (busy || disabled) && { opacity: 0.45 }]}>{title}</Text>
  </Pressable>;
  const toggle = (title: string, value: boolean, set: (value: boolean) => void) => <View style={local.row}>
    <Text style={[styles.body, { flex: 1 }, align]}>{title}</Text><Switch accessibilityLabel={title} value={value} onValueChange={set} disabled={busy} />
  </View>;

  return <SafeAreaView style={styles.screen}>
    <PackageHeader title={t.vo_title} onBack={() => { if (!inFlight.current) navigation.goBack(); }} />
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <Text style={[styles.cardTitle, align]}>{t.ap_venue}</Text>
      {venues.map(venue => <Pressable key={venue.id} accessibilityRole="radio" accessibilityState={{ checked: venueId === venue.id, disabled: busy || loading }}
        disabled={busy || loading} onPress={() => { setVenueId(venue.id); setMatches([]); setSearched(false); setPhone(''); }}
        style={[local.input, venueId === venue.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }]}>
        <Text style={[styles.body, align]}>{venueId === venue.id ? '✓ ' : ''}{name(venue)}</Text>
      </Pressable>)}
      {link(t.ap_refresh, () => void load(venueId), loading)}
      {!!message && <Text accessibilityRole="alert" style={[styles.notice, align]}>{message}</Text>}
      {loading && <PackageSkeleton />}
      {data && <>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, align]}>{name(data.venue)}</Text>
          <Text style={[styles.body, align]}>{t.vo_mode_help}</Text>
          {toggle(t.vo_mode, mode, setMode)}
          <GradientButton label={t.vo_apply} disabled={busy || mode === data.venue.is_package_venue}
            onPress={() => setConfirmation({ label: `${name(data.venue)} · ${t.vo_mode}: ${mode ? t.pkg_status_active : t.vo_disabled}`, action: () => api.admin.setPackageVenue(venueId, mode) })} />
        </View>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, align]}>{t.vo_staff}</Text>
          {data.staff.length === 0 && <Text style={[styles.body, align]}>{t.vo_no_staff}</Text>}
          {data.staff.map(member => <View key={member.id} style={styles.allowance}>
            <Text style={[styles.body, align]}>{member.full_name || member.phone || member.id}</Text>
            <Text style={styles.small}>{member.phone}</Text>
            {link(t.vo_remove, () => setConfirmation({ label: `${t.vo_remove}: ${member.full_name || member.phone}`, action: () => api.admin.setVenueStaff(venueId, member.id, false) }))}
          </View>)}
          <Text style={[styles.small, align]}>{t.vo_phone}</Text>
          <TextInput accessibilityLabel={t.vo_phone} style={local.input} value={phone} editable={!busy} keyboardType="phone-pad" maxLength={40}
            onChangeText={value => { setPhone(value); setMatches([]); setSearched(false); }} />
          <GradientButton label={t.vo_search} onPress={() => void search()} disabled={busy || phone.trim().length < 5} />
          {searched && matches.length === 0 && <Text style={[styles.body, align]}>{t.vo_no_match}</Text>}
          {matches.filter(member => !data.staff.some(existing => existing.id === member.id)).map(member => <View key={member.id} style={styles.allowance}>
            <Text style={[styles.body, align]}>{member.full_name || member.id} · {member.phone}</Text>
            {link(t.vo_add, () => setConfirmation({ label: `${t.vo_add}: ${member.full_name || member.phone}`, action: () => api.admin.setVenueStaff(venueId, member.id, true) }))}
          </View>)}
        </View>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, align]}>{t.vo_devices}</Text>
          <Text style={[styles.notice, align]}>{t.vo_hardware}</Text>
          {data.devices.map(d => <View key={d.connector_id} style={styles.allowance}>
            <Text style={[styles.body, align]}>{d.connector_type} · {d.power_kw} kW</Text>
            <Text selectable style={styles.small}>{d.connector_id}</Text>
            <Text style={[styles.small, align]}>{d.enabled ? t.vo_enabled : t.vo_disabled}</Text>
            {d.busy ? <Text style={[styles.small, align]}>{t.vo_busy}</Text> : link(t.vo_devices, () => editDevice(d))}
          </View>)}
        </View>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, align]}>{t.vo_review}</Text>
          <Text style={[styles.notice, align]}>{t.vo_review_help}</Text>
          {data.runs.length === 0 && <Text style={[styles.body, align]}>{t.vo_no_runs}</Text>}
          {data.runs.map(run => <View key={run.id} style={styles.allowance}>
            <Text style={[styles.body, align]}>{isRTL ? run.package_name_ar : run.package_name}</Text>
            <Text selectable style={styles.small}>{run.id}</Text>
            <Text style={[styles.small, align]}>{run.state} · {run.stop_reason || '—'}</Text>
            {run.flagged_review && <Text style={[styles.error, align]}>{t.vo_flagged}</Text>}
          </View>)}
          {link(t.vo_sessions, () => navigation.navigate('AdminActiveSessions'))}
        </View>
      </>}
    </ScrollView>
    <Modal visible={!!device} animationType="slide" onRequestClose={() => { if (!busy) setDevice(null); }}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <PackageHeader title={t.vo_devices} onBack={() => { if (!busy) setDevice(null); }} />
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            <Text style={[styles.notice, align]}>{t.vo_hardware}</Text>
            <Text selectable style={styles.small}>{device?.connector_id}</Text>
            {([{ title: t.vo_device, value: deviceId, set: setDeviceId }, { title: t.vo_switch, value: switchCode, set: setSwitchCode },
              { title: t.vo_energy, value: energyCode, set: setEnergyCode }, { title: t.vo_scale, value: scale, set: setScale }]).map(field => <View key={field.title} style={{ gap: 6 }}>
              <Text style={[styles.small, align]}>{field.title}</Text>
              <TextInput accessibilityLabel={field.title} style={local.input} value={field.value} onChangeText={field.set} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={100} />
            </View>)}
            {toggle(t.vo_enabled, enabled, setEnabled)}
            {!!deviceError && <Text accessibilityRole="alert" style={styles.error}>{deviceError}</Text>}
            <GradientButton label={t.vo_save} onPress={saveDevice} loading={busy} />
            {link(t.vo_cancel, () => setDevice(null))}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
    <Modal visible={!!confirmation} transparent animationType="fade" onRequestClose={() => { if (!busy) setConfirmation(null); }}>
      <View style={local.overlay}><View style={styles.card}>
        <Text style={[styles.cardTitle, align]}>{t.vo_confirm_help}</Text>
        <Text style={[styles.body, align]}>{confirmation?.label}</Text>
        <GradientButton label={t.vo_confirm} loading={busy} onPress={() => { if (confirmation) void mutate(confirmation.action); }} />
        {link(t.vo_cancel, () => setConfirmation(null))}
      </View></View>
    </Modal>
  </SafeAreaView>;
}
const local = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, color: COLORS.text, backgroundColor: COLORS.card, fontSize: 16, writingDirection: 'ltr' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 },
});
