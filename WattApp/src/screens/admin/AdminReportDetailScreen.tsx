import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { AdminStackParamList, SupportReport } from '../../types';
import { COLORS } from '../../constants/colors';
import { useLang } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { ArrowLeftIcon, UserIcon, AlertTriangleIcon, CheckIcon } from '../../components/icons';

type Nav = NativeStackNavigationProp<AdminStackParamList, 'AdminReportDetail'>;
type Rt  = RouteProp<AdminStackParamList, 'AdminReportDetail'>;

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  open:      { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  in_review: { bg: '#EFF6FF', text: '#2563EB', border: '#DBEAFE' },
  resolved:  { bg: '#ECFDF5', text: '#059669', border: '#D1FAE5' },
};

export default function AdminReportDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { t, isRTL } = useLang();

  const [report, setReport] = useState<SupportReport>(route.params.report);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const sc = STATUS_COLORS[report.status] ?? STATUS_COLORS.open;

  const categoryLabel = (c: string) => ({
    charger_fault: t.report_category_charger_fault,
    payment: t.report_category_payment,
    safety: t.report_category_safety,
    damage: t.report_category_damage,
    other: t.report_category_other,
  } as Record<string, string>)[c] ?? c;

  const statusLabel = (status: string) => ({
    open: t.report_status_open,
    in_review: t.report_status_in_review,
    resolved: t.report_status_resolved,
  } as Record<string, string>)[status] ?? status;

  const handleRespond = async () => {
    if (!message.trim()) return;
    setSaving(true);
    try {
      const updated = await api.admin.reportRespond(report.id, message.trim());
      setReport(updated);
      setMessage('');
      Alert.alert('✓', t.admin_report_send);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    Alert.alert(t.admin_report_close, t.admin_report_close_confirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.admin_report_close,
        onPress: async () => {
          setSaving(true);
          try {
            const updated = await api.admin.reportClose(report.id);
            setReport(updated);
          } catch (e: any) {
            Alert.alert(t.error, e.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={[s.header, isRTL && s.rowReverse]}>
        <TouchableOpacity style={s.iconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={isRTL && s.flipX}>
            <ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{t.admin_report_detail_title}</Text>
        <View style={s.iconBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <View style={s.identity}>
            <View style={s.iconCircle}>
              <AlertTriangleIcon size={28} color={COLORS.primary} strokeWidth={2} />
            </View>
            <Text style={s.category}>{categoryLabel(report.category)}</Text>
            <View style={[s.statusPill, { backgroundColor: sc.bg, borderColor: sc.border }]}>
              <Text style={[s.statusPillText, { color: sc.text }]}>{statusLabel(report.status)}</Text>
            </View>
          </View>

          <SectionTitle icon={<UserIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_report_reporter} isRTL={isRTL} />
          <View style={s.card}>
            <Row label={t.profile_name}  value={report.reporter?.full_name ?? '—'} isRTL={isRTL} />
            <Row label={t.profile_phone} value={report.reporter?.phone ?? '—'} isRTL={isRTL} last />
          </View>

          <SectionTitle icon={<AlertTriangleIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_report_description} isRTL={isRTL} />
          <View style={s.card}>
            <Text style={[s.description, isRTL && s.rtlText]}>{report.description}</Text>
          </View>

          {report.photo_base64 ? (
            <Image source={{ uri: report.photo_base64 }} style={s.photo} resizeMode="cover" />
          ) : null}

          {report.admin_response ? (
            <>
              <SectionTitle icon={<CheckIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.report_admin_response_label} isRTL={isRTL} />
              <View style={s.card}>
                <Text style={[s.description, isRTL && s.rtlText]}>{report.admin_response}</Text>
              </View>
            </>
          ) : null}

          {report.status !== 'resolved' && (
            <>
              <SectionTitle icon={<CheckIcon size={13} color={COLORS.textTertiary} strokeWidth={2} />} title={t.admin_report_respond_label} isRTL={isRTL} />
              <View style={s.card}>
                <TextInput
                  style={[s.input, s.inputMultiline, isRTL && s.rtlText]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t.admin_report_respond_ph}
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity style={[s.primaryBtn, saving && s.btnOff]} onPress={handleRespond} disabled={saving} activeOpacity={0.85}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>{t.admin_report_send}</Text>}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[s.closeBtn, saving && s.btnOff]} onPress={handleClose} disabled={saving} activeOpacity={0.85}>
                <Text style={s.closeBtnText}>{t.admin_report_close}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  rtlText: { textAlign: 'right' },
  ltrText: { textAlign: 'left' },
  rowReverse: { flexDirection: 'row-reverse' },
  flipX: { transform: [{ scaleX: -1 }] },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.background },
  iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.text, marginHorizontal: 8 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  identity: { alignItems: 'center', paddingTop: 8, paddingBottom: 18, gap: 8 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  category: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  statusPill: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginTop: 2 },
  statusPillText: { fontSize: 12, fontWeight: '800' },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },

  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 13, color: COLORS.textSecondary, flexShrink: 0 },
  rowValue: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.text, textAlign: 'right' },
  description: { fontSize: 14, color: COLORS.text, lineHeight: 21, paddingVertical: 14 },

  photo: { width: '100%', height: 220, borderRadius: 18, marginTop: 14, backgroundColor: COLORS.backgroundAlt },

  input: { backgroundColor: COLORS.background, borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginVertical: 14 },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },

  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnOff: { opacity: 0.55 },
  closeBtn: { backgroundColor: COLORS.card, borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginTop: 8 },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.success },
});
