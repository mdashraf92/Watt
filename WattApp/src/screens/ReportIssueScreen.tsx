import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { COLORS } from '../constants/colors';
import { useLang } from '../context/LanguageContext';
import { api } from '../lib/api';
import type { CustomerStackParamList, ReportCategory, SupportReport } from '../types';
import {
  ArrowLeftIcon, AlertTriangleIcon, CameraIcon,
} from '../components/icons';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'ReportIssue'>;
type Rt  = RouteProp<CustomerStackParamList, 'ReportIssue'>;

const CATEGORIES: ReportCategory[] = ['charger_fault', 'payment', 'safety', 'damage', 'other'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open:       { bg: '#FFFBEB', text: '#D97706' },
  in_review:  { bg: '#EFF6FF', text: '#2563EB' },
  resolved:   { bg: '#ECFDF5', text: '#059669' },
};

export default function ReportIssueScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { t, isRTL } = useLang();
  const rowDir = isRTL ? ('row-reverse' as const) : ('row' as const);
  const align  = isRTL ? ('right' as const) : ('left' as const);

  const [tab, setTab] = useState<'new' | 'mine'>('new');

  // ── New report form ──
  const [category, setCategory] = useState<ReportCategory>('charger_fault');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null); // data URI for preview
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── My reports ──
  const [reports, setReports] = useState<SupportReport[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchMine = useCallback(async () => {
    setLoadingMine(true);
    try {
      const data = await api.reports.list();
      setReports(data);
    } catch { /* ignore */ }
    finally { setLoadingMine(false); }
  }, []);

  useFocusEffect(useCallback(() => { if (tab === 'mine') fetchMine(); }, [tab, fetchMine]));

  const categoryLabel = (c: ReportCategory) => ({
    charger_fault: t.report_category_charger_fault,
    payment: t.report_category_payment,
    safety: t.report_category_safety,
    damage: t.report_category_damage,
    other: t.report_category_other,
  })[c];

  const statusLabel = (s: string) => ({
    open: t.report_status_open,
    in_review: t.report_status_in_review,
    resolved: t.report_status_resolved,
  } as Record<string, string>)[s] ?? s;

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    const launch = status === 'granted' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await launch({ mediaTypes: ['images'], quality: 0.4, base64: true, allowsEditing: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    setPhoto(result.assets[0].uri);
    setPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert(t.error, t.report_error_description);
      return;
    }
    setSubmitting(true);
    try {
      await api.reports.create({
        category,
        description: description.trim(),
        photo_base64: photoBase64,
        booking_id: route.params?.bookingId ?? null,
        session_id: route.params?.sessionId ?? null,
      });
      setDescription('');
      setPhoto(null);
      setPhotoBase64(null);
      Alert.alert(t.report_submitted_title, t.report_submitted_msg);
      setTab('mine');
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={[s.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { textAlign: align }]}>{t.report_issue_title}</Text>
      </View>

      <View style={[s.tabs, { flexDirection: rowDir }]}>
        <TouchableOpacity style={[s.tabBtn, tab === 'new' && s.tabBtnActive]} onPress={() => setTab('new')}>
          <Text style={[s.tabText, tab === 'new' && s.tabTextActive]}>{t.report_tab_new}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab === 'mine' && s.tabBtnActive]} onPress={() => setTab('mine')}>
          <Text style={[s.tabText, tab === 'mine' && s.tabTextActive]}>{t.report_tab_mine}</Text>
        </TouchableOpacity>
      </View>

      {tab === 'new' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            data={[1]}
            keyExtractor={() => 'form'}
            contentContainerStyle={s.formScroll}
            keyboardShouldPersistTaps="handled"
            renderItem={() => (
              <>
                <Text style={[s.label, { textAlign: align }]}>{t.report_category_label}</Text>
                <View style={[s.chipsRow, { flexDirection: rowDir, flexWrap: 'wrap' }]}>
                  {CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[s.chip, category === c && s.chipActive]}
                      onPress={() => setCategory(c)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.chipText, category === c && s.chipTextActive]}>{categoryLabel(c)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[s.label, { textAlign: align, marginTop: 18 }]}>{t.report_description_label}</Text>
                <TextInput
                  style={[s.textArea, isRTL && { textAlign: 'right' }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t.report_description_ph}
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                  textAlignVertical="top"
                />

                <Text style={[s.label, { textAlign: align, marginTop: 18 }]}>{t.report_photo_add}</Text>
                {photo ? (
                  <TouchableOpacity style={s.photoPreviewWrap} onPress={handlePickPhoto} activeOpacity={0.85}>
                    <Image source={{ uri: photo }} style={s.photoPreview} />
                    <View style={s.photoRetakeBadge}>
                      <CameraIcon size={12} color="#fff" strokeWidth={2} />
                      <Text style={s.photoRetakeText}>{t.report_photo_retake}</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={s.photoAddBtn} onPress={handlePickPhoto} activeOpacity={0.8}>
                    <CameraIcon size={20} color={COLORS.primary} strokeWidth={2} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[s.submitBtn, submitting && s.btnOff]}
                  onPress={handleSubmit}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.submitBtnText}>{t.report_submit}</Text>}
                </TouchableOpacity>
              </>
            )}
          />
        </KeyboardAvoidingView>
      ) : loadingMine ? (
        <View style={s.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={r => r.id}
          contentContainerStyle={reports.length ? s.list : s.listEmpty}
          renderItem={({ item }) => {
            const sc = STATUS_COLORS[item.status] ?? STATUS_COLORS.open;
            const open = expanded === item.id;
            return (
              <TouchableOpacity
                style={s.reportCard}
                onPress={() => setExpanded(open ? null : item.id)}
                activeOpacity={0.85}
              >
                <View style={[s.reportTop, { flexDirection: rowDir }]}>
                  <Text style={[s.reportCategory, { textAlign: align }]}>{categoryLabel(item.category)}</Text>
                  <View style={[s.statusPill, { backgroundColor: sc.bg }]}>
                    <Text style={[s.statusPillText, { color: sc.text }]}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text style={[s.reportDesc, { textAlign: align }]} numberOfLines={open ? undefined : 2}>
                  {item.description}
                </Text>
                <Text style={[s.reportDate, { textAlign: align }]}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
                {open && item.admin_response && (
                  <View style={s.responseBox}>
                    <Text style={[s.responseLabel, { textAlign: align }]}>{t.report_admin_response_label}</Text>
                    <Text style={[s.responseText, { textAlign: align }]}>{item.admin_response}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <AlertTriangleIcon size={30} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={s.emptyTitle}>{t.report_empty}</Text>
              <Text style={s.emptySub}>{t.report_empty_sub}</Text>
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
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: COLORS.text },

  tabs: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  tabBtnActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  tabText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  tabTextActive: { color: '#fff' },

  formScroll: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 10 },
  chipsRow: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.primary, fontWeight: '700' },

  textArea: {
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, minHeight: 110, fontSize: 14, color: COLORS.text,
  },

  photoAddBtn: {
    width: 64, height: 64, borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card,
  },
  photoPreviewWrap: { width: 120, height: 120, borderRadius: 16, overflow: 'hidden' },
  photoPreview: { width: '100%', height: '100%' },
  photoRetakeBadge: {
    position: 'absolute', bottom: 6, left: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingVertical: 4,
  },
  photoRetakeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  submitBtn: { marginTop: 24, backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnOff: { opacity: 0.6 },

  list: { padding: 16, gap: 10 },
  listEmpty: { flexGrow: 1 },
  reportCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  reportTop: { alignItems: 'center', justifyContent: 'space-between' },
  reportCategory: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  reportDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  reportDate: { fontSize: 11, color: COLORS.textTertiary },
  responseBox: { marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: COLORS.backgroundAlt },
  responseLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  responseText: { fontSize: 13, color: COLORS.text, lineHeight: 19 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
