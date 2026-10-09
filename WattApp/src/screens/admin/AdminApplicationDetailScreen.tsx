import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { AdminStackParamList, ChargerApplication } from '../../types';
import { COLORS } from '../../constants/colors';
import { useLang } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import {
  ArrowLeftIcon, PhoneIcon, ZapIcon, UserIcon, MapPinIcon, ShieldIcon, CheckIcon,
} from '../../components/icons';

type Nav = NativeStackNavigationProp<AdminStackParamList, 'AdminApplicationDetail'>;
type Rt  = RouteProp<AdminStackParamList, 'AdminApplicationDetail'>;

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending:      { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  under_review: { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  approved:     { bg: '#ECFDF5', text: '#059669', border: '#D1FAE5' },
  rejected:     { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  needs_info:   { bg: '#EFF6FF', text: '#2563EB', border: '#DBEAFE' },
};

export default function AdminApplicationDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { t, isRTL } = useLang();

  const [app, setApp] = useState<ChargerApplication>(route.params.application);
  const [comment,  setComment]  = useState(app.admin_comment ?? '');
  const [saving,   setSaving]   = useState(false);
  const [listing,  setListing]  = useState<{ id: string; tuya_device_id: string | null; tuya_verified: boolean; price_per_kwh: number } | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const sc = STATUS_COLORS[app.status] ?? STATUS_COLORS.pending;
  const initial = app.full_name ? app.full_name[0].toUpperCase() : '?';

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending:      t.admin_inv_status_pending,
      under_review: t.admin_inv_status_under_review,
      approved:     t.admin_inv_status_approved,
      rejected:     t.admin_inv_status_rejected,
      needs_info:   t.admin_inv_status_needs_info,
    };
    return map[status] ?? status;
  };

  // Fetch the charger listing if application is approved
  useEffect(() => {
    if (app.status === 'approved') {
      api.admin.userListing(app.user_id)
        .then(data => {
          if (data) {
            setListing(data);
            setPriceInput(String(data.price_per_kwh ?? ''));
          }
        })
        .catch(() => {});
    }
  }, [app.user_id, app.status]);

  const handleSavePrice = async () => {
    if (!listing) return;
    const price = parseFloat(priceInput);
    if (!price || price <= 0 || price > 1) {
      Alert.alert(t.error, t.admin_price_invalid); return;
    }
    setSaving(true);
    try {
      await api.admin.updateListing(listing.id, { price_per_kwh: price });
      setListing(prev => prev ? { ...prev, price_per_kwh: price } : prev);
      Alert.alert('✓', t.admin_price_saved);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyDevice = () => {
    if (!listing) return;
    Alert.alert(t.admin_tuya_verify_btn, t.admin_tuya_verify_confirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.admin_tuya_verify_btn,
        onPress: async () => {
          setSaving(true);
          try {
            await api.admin.updateListing(listing.id, { tuya_verified: true });
            setListing(prev => prev ? { ...prev, tuya_verified: true } : prev);
            Alert.alert('✓', t.admin_tuya_verify_done);
          } catch (e: any) {
            Alert.alert(t.error, e.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleCall = () => {
    Linking.openURL(`tel:${app.phone.replace(/\s/g, '')}`);
  };

  const handleDelete = () => {
    Alert.alert(
      t.admin_inv_delete,
      t.admin_inv_delete_confirm,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.admin_inv_delete,
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await api.admin.deleteApplication(app.id);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert(t.error, e.message);
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const handleSaveComment = async () => {
    setSaving(true);
    try {
      await api.admin.saveComment(app.id, comment.trim() || null);
      setApp(prev => ({ ...prev, admin_comment: comment.trim() || undefined }));
      Alert.alert('✓', t.admin_inv_comment_saved);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (action: 'accept' | 'reject' | 'review') => {
    const statusMap = { accept: 'approved' as const, reject: 'rejected' as const, review: 'under_review' as const };
    const labelMap  = { accept: t.admin_inv_accept, reject: t.admin_inv_reject, review: t.admin_inv_on_review };

    Alert.alert(
      labelMap[action],
      `${labelMap[action]}: ${app.full_name}?`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: labelMap[action],
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            setSaving(true);
            try {
              await api.admin.application(app.id, action);
              setApp(prev => ({ ...prev, status: statusMap[action] }));
              Alert.alert('✓', `${labelMap[action]} — Done`);
            } catch (e: any) {
              Alert.alert(t.error, e.message);
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Header ── */}
      <View style={[s.header, isRTL && s.rowReverse]}>
        <TouchableOpacity style={s.iconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={isRTL && s.flipX}>
            <ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{t.admin_inv_detail_title}</Text>
        <TouchableOpacity style={s.iconBtn} onPress={handleCall}>
          <PhoneIcon size={17} color={COLORS.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Identity ── */}
          <View style={s.identity}>
            <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
            <Text style={s.name}>{app.full_name}</Text>
            <Text style={s.sub}>{app.governorate} · {app.city}</Text>
            <View style={[s.metaRow, isRTL && s.rowReverse]}>
              <View style={[s.statusPill, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                <Text style={[s.statusPillText, { color: sc.text }]}>{statusLabel(app.status)}</Text>
              </View>
              <Text style={s.submitted}>
                {t.admin_inv_submitted}: {new Date(app.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>

          {/* ── Call (primary action) ── */}
          <TouchableOpacity style={[s.callBtn, isRTL && s.rowReverse]} onPress={handleCall} activeOpacity={0.85}>
            <PhoneIcon size={18} color="#fff" strokeWidth={2} />
            <Text style={s.callBtnText}>{t.admin_inv_call}: {app.phone}</Text>
          </TouchableOpacity>

          {/* ── Personal ── */}
          <SectionTitle icon={<UserIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_inv_personal} isRTL={isRTL} />
          <View style={s.card}>
            <Row label={t.profile_name}  value={app.full_name} isRTL={isRTL} />
            <Row label={t.profile_phone} value={app.phone} isRTL={isRTL} last />
          </View>

          {/* ── Location ── */}
          <SectionTitle icon={<MapPinIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_inv_location} isRTL={isRTL} />
          <View style={s.card}>
            <Row label={t.inv_app_gov_label}  value={app.governorate} isRTL={isRTL} />
            <Row label={t.inv_app_city_label} value={app.city} isRTL={isRTL} />
            <Row label="GPS" value={app.latitude ? `${app.latitude.toFixed(5)}, ${app.longitude?.toFixed(5)}` : '—'} isRTL={isRTL} last />
          </View>

          {/* ── Charger ── */}
          <SectionTitle icon={<ZapIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_inv_charger_type} isRTL={isRTL} />
          <View style={s.card}>
            <Row label={t.admin_inv_charger_type} value={app.charger_type} isRTL={isRTL} />
            <Row label={t.admin_inv_power} value={app.power_kw ? `${app.power_kw} kW` : t.admin_inv_power_na} isRTL={isRTL} last />
          </View>

          {/* ── Government docs ── */}
          <SectionTitle icon={<ShieldIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_inv_gov_req} isRTL={isRTL} />
          <View style={s.card}>
            <Row label={t.admin_inv_elec_form}  value={app.electricity_form_name} isRTL={isRTL} />
            <Row label={t.admin_inv_commercial} value={app.commercial_registration} isRTL={isRTL} />
            <Row label={t.admin_inv_id_card}    value={app.id_card_number} isRTL={isRTL} last />
          </View>

          {/* ── Decision ── */}
          <SectionTitle icon={<CheckIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_inv_actions} isRTL={isRTL} />
          <View style={s.actionsRow}>
            <ActionBtn label={t.admin_inv_accept}    color={COLORS.success} icon="✓"  current={app.status === 'approved'}     onPress={() => handleAction('accept')} />
            <ActionBtn label={t.admin_inv_on_review} color={COLORS.warning} icon="🔍" current={app.status === 'under_review'} onPress={() => handleAction('review')} />
            <ActionBtn label={t.admin_inv_reject}    color={COLORS.error}   icon="✕"  current={app.status === 'rejected'}     onPress={() => handleAction('reject')} />
          </View>

          {/* ── Charger Device (approved only) ── */}
          {app.status === 'approved' && (
            <>
              <SectionTitle icon={<ZapIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_tuya_section} isRTL={isRTL} />
              <View style={s.card}>
                <Row label={t.admin_tuya_device_id} value={listing?.tuya_device_id ?? t.admin_tuya_not_set} isRTL={isRTL} />
                <Row label={t.tuya_status_label} value={listing?.tuya_verified ? t.admin_tuya_verified : t.admin_tuya_not_verified} isRTL={isRTL} last />
              </View>
              {listing && !listing.tuya_verified && listing.tuya_device_id && (
                <TouchableOpacity
                  style={[s.primaryBtn, { marginTop: 10 }, saving && s.btnOff]}
                  onPress={handleVerifyDevice}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>✓ {t.admin_tuya_verify_btn}</Text>}
                </TouchableOpacity>
              )}

              {/* Pricing */}
              {listing && (
                <>
                  <SectionTitle icon={<ZapIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_price_section} isRTL={isRTL} />
                  <View style={s.card}>
                    <TextInput
                      style={[s.input, isRTL && s.rtlText]}
                      value={priceInput}
                      onChangeText={setPriceInput}
                      placeholder={t.admin_price_ph}
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="decimal-pad"
                    />
                    <TouchableOpacity style={[s.primaryBtn, saving && s.btnOff]} onPress={handleSavePrice} disabled={saving} activeOpacity={0.85}>
                      {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>{t.admin_price_save}</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}

          {/* ── Admin note ── */}
          <SectionTitle icon={<UserIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_inv_add_comment} isRTL={isRTL} />
          <View style={s.card}>
            <TextInput
              style={[s.input, s.inputMultiline, isRTL && s.rtlText]}
              value={comment}
              onChangeText={setComment}
              placeholder={t.admin_inv_comment_ph}
              placeholderTextColor={COLORS.textTertiary}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity style={[s.primaryBtn, saving && s.btnOff]} onPress={handleSaveComment} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>{t.admin_inv_save_comment}</Text>}
            </TouchableOpacity>
          </View>

          {/* ── Delete ── */}
          <TouchableOpacity style={[s.deleteBtn, saving && s.btnOff]} onPress={handleDelete} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color={COLORS.error} size="small" /> : <Text style={s.deleteBtnText}>{t.admin_inv_delete}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function SectionTitle({ icon, title, isRTL }: { icon: React.ReactNode; title: string; isRTL?: boolean }) {
  return (
    <View style={[s.sectionTitleRow, isRTL && s.rowReverse]}>
      {icon}
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function Row({ label, value, last, isRTL }: { label: string; value: string; last?: boolean; isRTL?: boolean }) {
  return (
    <View style={[s.row, last && s.rowLast, isRTL && s.rowReverse]}>
      <Text style={[s.rowLabel, isRTL && s.rtlText]}>{label}</Text>
      <Text style={[s.rowValue, isRTL ? s.ltrText : s.rtlText]} selectable numberOfLines={2}>{value}</Text>
    </View>
  );
}

function ActionBtn({ label, color, icon, current, onPress }: {
  label: string; color: string; icon: string; current: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        s.actionBtn,
        current
          ? { backgroundColor: color + '14', borderColor: color }
          : { backgroundColor: COLORS.card, borderColor: COLORS.border },
      ]}
      onPress={current ? undefined : onPress}
      disabled={current}
      activeOpacity={0.75}
    >
      <Text style={[s.actionIcon, { color }]}>{icon}</Text>
      <Text style={[s.actionLabel, { color: current ? color : COLORS.textSecondary }]}>{label}</Text>
      {current && <View style={[s.actionDot, { backgroundColor: color }]} />}
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // RTL helpers
  rtlText:    { textAlign: 'right' },
  ltrText:    { textAlign: 'left' },
  rowReverse: { flexDirection: 'row-reverse' },
  flipX:      { transform: [{ scaleX: -1 }] },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.text, marginHorizontal: 8 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // Identity
  identity: { alignItems: 'center', paddingTop: 8, paddingBottom: 18, gap: 8 },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  name: { fontSize: 21, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  sub:  { fontSize: 13, color: COLORS.textSecondary, marginTop: -2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  statusPill:     { paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusPillText: { fontSize: 12, fontWeight: '800' },
  submitted: { fontSize: 12, color: COLORS.textTertiary },

  // Call
  callBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 14, marginBottom: 8,
  },
  callBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Section title
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Card + rows
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.border },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  rowLast:  { borderBottomWidth: 0 },
  rowLabel: { fontSize: 13, color: COLORS.textSecondary, flexShrink: 0 },
  rowValue: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.text, textAlign: 'right' },

  // Actions
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, gap: 4 },
  actionIcon:  { fontSize: 16, fontWeight: '800' },
  actionLabel: { fontSize: 12, fontWeight: '700' },
  actionDot:   { width: 6, height: 6, borderRadius: 3, marginTop: 2 },

  // Inputs
  input: {
    backgroundColor: COLORS.background, borderRadius: 12, padding: 12,
    fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
    marginVertical: 14,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },

  // Buttons
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnOff: { opacity: 0.55 },
  deleteBtn: {
    backgroundColor: COLORS.card, borderRadius: 16, paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, marginTop: 20,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.error },
});
