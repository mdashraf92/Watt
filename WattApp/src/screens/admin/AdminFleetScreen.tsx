/**
 * AdminFleetScreen — the charging vans and who drives them.
 *
 * Assigning a driver is the one action here with teeth: an unassigned van is
 * invisible to dispatch, so a fleet that looks full but takes no jobs is almost
 * always a missing driver. The list shows that state plainly.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLang } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import type { ServiceVan } from '../../types';
import {
  ArrowLeftIcon, PlusIcon, ZapIcon, UserIcon, TrashIcon, RotateCcwIcon, CheckIcon,
} from '../../components/icons';

type Operator = { id: string; full_name: string; phone: string; van_id: string | null; van_label: string | null };

const STATUS_COLOR: Record<string, string> = {
  available:   COLORS.success,
  on_job:      COLORS.gold,
  offline:     COLORS.textTertiary,
  maintenance: COLORS.error,
};

export default function AdminFleetScreen() {
  const { t, isRTL } = useLang();
  const navigation = useNavigation<any>();

  const [vans, setVans]           = useState<ServiceVan[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  const [editing, setEditing] = useState<ServiceVan | null>(null);
  const [modal, setModal]     = useState(false);
  const [label, setLabel]     = useState('');
  const [plate, setPlate]     = useState('');
  const [capacity, setCapacity] = useState('40');
  const [operatorId, setOperatorId] = useState<string | null>(null);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  const load = useCallback(async () => {
    const [v, o] = await Promise.all([
      api.fleet.vans().catch(() => []),
      api.fleet.operators().catch(() => []),
    ]);
    setVans(v); setOperators(o); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null); setLabel(''); setPlate(''); setCapacity('40'); setOperatorId(null);
    setModal(true);
  };
  const openEdit = (v: ServiceVan) => {
    setEditing(v);
    setLabel(v.label); setPlate(v.plate);
    setCapacity(String(v.capacity_kwh));
    setOperatorId(v.operator_id ?? null);
    setModal(true);
  };

  const save = async () => {
    const cap = parseFloat(capacity);
    if (!label.trim() || !Number.isFinite(cap) || cap <= 0) return;
    setSaving(true);
    try {
      if (editing) {
        await api.fleet.updateVan(editing.id, {
          label: label.trim(), plate: plate.trim(), capacity_kwh: cap, operator_id: operatorId,
        });
      } else {
        await api.fleet.createVan({
          label: label.trim(), plate: plate.trim(), capacity_kwh: cap,
          operator_id: operatorId ?? undefined,
        } as any);
      }
      setModal(false);
      await load();
    } catch (e: any) {
      Alert.alert(t.error, e?.message ?? t.mc_err_generic);
    } finally { setSaving(false); }
  };

  const refill = async (v: ServiceVan) => {
    try { await api.fleet.refillVan(v.id); await load(); }
    catch (e: any) { Alert.alert(t.error, e?.message ?? t.mc_err_generic); }
  };

  const remove = (v: ServiceVan) => {
    Alert.alert(t.ad_van_remove, t.ad_van_remove_confirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.ad_van_remove, style: 'destructive',
        onPress: async () => {
          try { await api.fleet.removeVan(v.id); await load(); }
          catch (e: any) { Alert.alert(t.error, e?.message ?? t.mc_err_generic); }
        },
      },
    ]);
  };

  const renderVan = ({ item }: { item: ServiceVan }) => {
    const pct = Math.round((item.current_kwh / Math.max(item.capacity_kwh, 1)) * 100);
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.8}>
        <View style={[styles.cardTop, { flexDirection: rowDir }]}>
          <View style={styles.vanIcon}>
            <ZapIcon size={19} color="#fff" strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.vanLabel, { textAlign: align }]}>{item.label}</Text>
            <Text style={[styles.vanPlate, { textAlign: align }]}>{item.plate || '—'}</Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: `${STATUS_COLOR[item.status]}22` }]}>
            <Text style={[styles.statusTxt, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
          </View>
        </View>

        <View style={[styles.driverRow, { flexDirection: rowDir }]}>
          <UserIcon size={14} color={item.operator_id ? COLORS.textSecondary : COLORS.error} strokeWidth={2} />
          <Text style={[
            styles.driverTxt,
            { textAlign: align },
            !item.operator_id && { color: COLORS.error },
          ]}>
            {item.operator_name || t.ad_van_none}
          </Text>
          {typeof item.jobs_completed === 'number' && (
            <Text style={styles.jobsTxt}>{t.ad_van_jobs.replace('{n}', String(item.jobs_completed))}</Text>
          )}
        </View>

        <View style={styles.gaugeTrack}>
          <View style={[styles.gaugeFill, { width: `${pct}%` }]} />
        </View>
        <Text style={[styles.gaugeTxt, { textAlign: align }]}>
          {Number(item.current_kwh).toFixed(0)} / {Number(item.capacity_kwh).toFixed(0)} kWh
        </Text>

        <View style={[styles.actions, { flexDirection: rowDir }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => refill(item)}>
            <RotateCcwIcon size={14} color={COLORS.primary} strokeWidth={2.2} />
            <Text style={styles.actionTxt}>{t.ad_van_refill}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={() => remove(item)}>
            <TrashIcon size={14} color={COLORS.error} strokeWidth={2.2} />
            <Text style={[styles.actionTxt, { color: COLORS.error }]}>{t.ad_van_remove}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
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
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.ad_fleet_title}</Text>
        <TouchableOpacity onPress={openNew} style={styles.addBtn} hitSlop={10}>
          <PlusIcon size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={vans}
          keyExtractor={v => v.id}
          renderItem={renderVan}
          contentContainerStyle={vans.length ? styles.list : styles.listEmpty}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTxt}>{t.ad_fleet_empty}</Text>
            </View>
          }
        />
      )}

      {/* Add / edit */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => !saving && setModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={[styles.sheetTitle, { textAlign: align }]}>
              {editing ? t.ad_van_edit : t.ad_van_add}
            </Text>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.field, { textAlign: align }]}>{t.ad_van_label}</Text>
              <TextInput style={[styles.input, { textAlign: align }]} value={label} onChangeText={setLabel} maxLength={60} />

              <Text style={[styles.field, { textAlign: align }]}>{t.ad_van_plate}</Text>
              <TextInput style={[styles.input, { textAlign: align }]} value={plate} onChangeText={setPlate} maxLength={30} />

              <Text style={[styles.field, { textAlign: align }]}>{t.ad_van_capacity}</Text>
              <TextInput
                style={[styles.input, { textAlign: align }]}
                value={capacity} onChangeText={setCapacity}
                keyboardType="decimal-pad" maxLength={6}
              />

              <Text style={[styles.field, { textAlign: align }]}>{t.ad_van_operator}</Text>
              <TouchableOpacity
                style={[styles.pickRow, { flexDirection: rowDir }, operatorId === null && styles.pickRowOn]}
                onPress={() => setOperatorId(null)}
              >
                <Text style={styles.pickTxt}>{t.ad_van_none}</Text>
                {operatorId === null && <CheckIcon size={16} color={COLORS.primary} strokeWidth={3} />}
              </TouchableOpacity>
              {operators.map(o => {
                // A driver already on another van cannot take this one too —
                // the DB enforces one van per operator, so surface it here.
                const taken = !!o.van_id && o.van_id !== editing?.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[
                      styles.pickRow, { flexDirection: rowDir },
                      operatorId === o.id && styles.pickRowOn,
                      taken && { opacity: 0.45 },
                    ]}
                    disabled={taken}
                    onPress={() => setOperatorId(o.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickTxt, { textAlign: align }]}>{o.full_name}</Text>
                      {taken && <Text style={[styles.pickSub, { textAlign: align }]}>{o.van_label}</Text>}
                    </View>
                    {operatorId === o.id && <CheckIcon size={16} color={COLORS.primary} strokeWidth={3} />}
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveTxt}>{t.save}</Text>}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  addBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSecondary },

  card: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  cardTop: { alignItems: 'center', gap: 12 },
  vanIcon: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  vanLabel: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text },
  vanPlate: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textSecondary, marginTop: 1 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusTxt: { fontFamily: FONTS.bold, fontSize: 11 },

  driverRow: { alignItems: 'center', gap: 7, marginTop: 12 },
  driverTxt: { flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textSecondary },
  jobsTxt: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textTertiary },

  gaugeTrack: {
    height: 7, borderRadius: 4, backgroundColor: COLORS.backgroundAlt, marginTop: 12, overflow: 'hidden',
  },
  gaugeFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.primary },
  gaugeTxt: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary, marginTop: 5 },

  actions: { gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primaryTint,
  },
  actionDanger: { borderColor: '#f6cfcf' },
  actionTxt: { fontFamily: FONTS.bold, fontSize: 12.5, color: COLORS.primary },

  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '86%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderStrong,
    alignSelf: 'center', marginBottom: 14,
  },
  sheetTitle: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text, marginBottom: 14 },
  field: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textTertiary, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: FONTS.regular, fontSize: 14.5, color: COLORS.text,
  },
  pickRow: {
    alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, marginTop: 8,
  },
  pickRowOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  pickTxt: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.text },
  pickSub: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 },
  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  saveTxt: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
});
