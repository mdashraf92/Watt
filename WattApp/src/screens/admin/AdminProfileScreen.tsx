import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { COLORS } from '../../constants/colors';
import { useTabBarHeight } from '../../navigation/tabBarLayout';
import {
  ShieldIcon, PhoneIcon, GlobeIcon, LogOutIcon, ZapIcon, XIcon, CheckIcon,
  UserIcon, MailIcon, AwardIcon, UsersIcon, WalletIcon, TrendingUpIcon, PlugZapIcon,
  AlertTriangleIcon,
} from '../../components/icons';
import NotificationBell from '../../components/NotificationBell';

export default function AdminProfileScreen() {
  const { profile, session, signOut, updateProfile } = useAuth();
  const { t, toggleLanguage, isRTL } = useLang();
  const tabBarHeight = useTabBarHeight();
  const navigation = useNavigation<any>();

  const [editModal, setEditModal] = useState(false);
  const [editName,  setEditName]  = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving,    setSaving]    = useState(false);

  // Network-wide counts for the stats card
  const [stationCount, setStationCount] = useState<number | null>(null);
  const [userCount,    setUserCount]    = useState<number | null>(null);

  const email = session?.user?.email ?? '';

  useEffect(() => {
    api.admin.counts()
      .then(({ stations, users }) => { setStationCount(stations); setUserCount(users); })
      .catch(() => {});
  }, []);

  const openEdit = () => {
    setEditName(profile?.full_name ?? '');
    setEditPhone(profile?.phone ?? '');
    setEditModal(true);
  };

  const handleSave = async () => {
    const name  = editName.trim();
    const phone = editPhone.trim();
    if (!name) {
      Alert.alert(t.error, t.auth_error_name);
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ full_name: name, phone: phone || undefined });
      setEditModal(false);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(t.profile_logout_title, t.profile_logout_msg, [
      { text: t.cancel, style: 'cancel' },
      { text: t.profile_logout_confirm, style: 'destructive', onPress: signOut },
    ]);
  };

  const initials = profile?.full_name ? profile.full_name[0].toUpperCase() : 'A';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ── */}
      <View style={[styles.header, isRTL && styles.rowReverse]}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{initials}</Text>
            </View>
          </View>
          <View style={styles.avatarBadge}>
            <ShieldIcon size={11} color="#fff" strokeWidth={2.5} />
          </View>
        </View>

        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerEyebrow, isRTL && styles.rtlText]}>{t.admin_profile_title}</Text>
          <Text style={[styles.headerTitle, isRTL && styles.rtlText]} numberOfLines={1}>{profile?.full_name || 'Admin'}</Text>
          <View style={[styles.adminBadge, isRTL && styles.selfEnd]}>
            <Text style={styles.adminBadgeText}>{t.admin_profile_badge}</Text>
          </View>
        </View>

        <NotificationBell size={40} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabBarHeight }}>

        {/* ── Stats ── */}
        <View style={styles.statsCard}>
          <StatBox label={t.admin_profile_stat_stations} value={stationCount == null ? '—' : String(stationCount)} Icon={ZapIcon}   color={COLORS.primary} />
          <View style={styles.statsDivider} />
          <StatBox label={t.admin_profile_stat_users}    value={userCount == null ? '—' : String(userCount)}       Icon={UsersIcon} color="#3b82f6" />
        </View>

        {/* ── My Info ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && styles.rtlText]}>{t.profile_my_info}</Text>
          <InfoRow Icon={UserIcon}  label={t.profile_name}  value={profile?.full_name || '—'} isRTL={isRTL} />
          <InfoRow Icon={MailIcon}  label={t.profile_email} value={email || '—'} isRTL={isRTL} />
          <InfoRow Icon={PhoneIcon} label={t.profile_phone} value={profile?.phone || '—'} isRTL={isRTL} />
          <InfoRow Icon={AwardIcon} label={t.profile_joined} value={profile ? new Date(profile.created_at).toLocaleDateString() : '—'} isRTL={isRTL} />
          <TouchableOpacity style={[styles.editBtn, isRTL && styles.selfStart]} onPress={openEdit}>
            <Text style={styles.editBtnText}>{t.profile_edit_clean}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Settings ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && styles.rtlText]}>{t.admin_profile_settings}</Text>

          {/* Superadmin-only: platform control + admin management */}
          {profile?.role === 'superadmin' && (
            <TouchableOpacity style={[styles.settingRow, isRTL && styles.rowReverse]} onPress={() => navigation.navigate('SuperAdmin')} activeOpacity={0.7}>
              <View style={[styles.settingLeft, isRTL && styles.rowReverse]}>
                <View style={[styles.settingIconWrap, { backgroundColor: '#EEE7FB' }]}>
                  <ShieldIcon size={16} color="#7C3AED" strokeWidth={2} />
                </View>
                <Text style={styles.settingLabel}>{t.sa_title}</Text>
              </View>
              <Text style={styles.langToggle}>›</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.settingRow, isRTL && styles.rowReverse]} onPress={() => navigation.navigate('AdminAnalytics')} activeOpacity={0.7}>
            <View style={[styles.settingLeft, isRTL && styles.rowReverse]}>
              <View style={[styles.settingIconWrap, { backgroundColor: COLORS.primaryBg }]}>
                <TrendingUpIcon size={16} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.settingLabel}>{t.analytics_title}</Text>
            </View>
            <Text style={styles.langToggle}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingRow, isRTL && styles.rowReverse]} onPress={() => navigation.navigate('AdminPayouts')} activeOpacity={0.7}>
            <View style={[styles.settingLeft, isRTL && styles.rowReverse]}>
              <View style={[styles.settingIconWrap, { backgroundColor: COLORS.goldBg }]}>
                <WalletIcon size={16} color={COLORS.gold} strokeWidth={2} />
              </View>
              <Text style={styles.settingLabel}>{t.payout_history}</Text>
            </View>
            <Text style={styles.langToggle}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.settingRow, isRTL && styles.rowReverse]} onPress={() => navigation.navigate('AdminFleet')} activeOpacity={0.7}>
            <View style={[styles.settingLeft, isRTL && styles.rowReverse]}>
              <View style={[styles.settingIconWrap, { backgroundColor: COLORS.primaryBg }]}>
                <ZapIcon size={16} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.settingLabel}>{t.ad_fleet_title}</Text>
            </View>
            <Text style={styles.langToggle}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingRow, isRTL && styles.rowReverse]} onPress={() => navigation.navigate('AdminActiveSessions')} activeOpacity={0.7}>
            <View style={[styles.settingLeft, isRTL && styles.rowReverse]}>
              <View style={[styles.settingIconWrap, { backgroundColor: COLORS.primaryBg }]}>
                <ZapIcon size={16} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.settingLabel}>{t.admin_sessions_title}</Text>
            </View>
            <Text style={styles.langToggle}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingRow, isRTL && styles.rowReverse]} onPress={() => navigation.navigate('AdminReports')} activeOpacity={0.7}>
            <View style={[styles.settingLeft, isRTL && styles.rowReverse]}>
              <View style={[styles.settingIconWrap, { backgroundColor: COLORS.errorBg }]}>
                <AlertTriangleIcon size={16} color={COLORS.error} strokeWidth={2} />
              </View>
              <Text style={styles.settingLabel}>{t.admin_reports_title}</Text>
            </View>
            <Text style={styles.langToggle}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingRow, isRTL && styles.rowReverse]} onPress={() => navigation.navigate('AdminMobileRequests')} activeOpacity={0.7}>
            <View style={[styles.settingLeft, isRTL && styles.rowReverse]}>
              <View style={[styles.settingIconWrap, { backgroundColor: COLORS.goldBg }]}>
                <PlugZapIcon size={16} color={COLORS.gold} strokeWidth={2} />
              </View>
              <Text style={styles.settingLabel}>{t.ad_mobile_title}</Text>
            </View>
            <Text style={styles.langToggle}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingRow, styles.settingRowLast, isRTL && styles.rowReverse]} onPress={toggleLanguage} activeOpacity={0.7}>
            <View style={[styles.settingLeft, isRTL && styles.rowReverse]}>
              <View style={[styles.settingIconWrap, { backgroundColor: '#eff6ff' }]}>
                <GlobeIcon size={16} color="#3b82f6" strokeWidth={2} />
              </View>
              <Text style={styles.settingLabel}>{t.admin_profile_language}</Text>
            </View>
            <Text style={styles.langToggle}>{t.profile_language_label}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity style={[styles.logoutBtn, isRTL && styles.rowReverse]} onPress={handleSignOut} activeOpacity={0.85}>
          <LogOutIcon size={18} color={COLORS.error} strokeWidth={2} />
          <Text style={styles.logoutText}>{t.profile_logout_clean}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Edit Info Modal — centered iOS-style dialog ── */}
      <Modal visible={editModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => !saving && setEditModal(false)} />

          <View style={styles.dialogCard}>
            <View style={[styles.modalTitleRow, isRTL && styles.rowReverse]}>
              <Text style={[styles.modalTitle, isRTL && styles.rtlText]}>{t.profile_edit_title}</Text>
              <TouchableOpacity onPress={() => !saving && setEditModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <XIcon size={20} color={COLORS.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Full name */}
            <EditField Icon={UserIcon} label={t.profile_edit_name} isRTL={isRTL}>
              <TextInput
                style={[styles.editInput, isRTL && styles.rtlText]}
                value={editName}
                onChangeText={setEditName}
                placeholder={t.profile_edit_name_ph}
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="words"
                autoFocus
                returnKeyType="next"
              />
            </EditField>

            {/* Phone */}
            <EditField Icon={PhoneIcon} label={t.profile_edit_phone} isRTL={isRTL} last>
              <TextInput
                style={[styles.editInput, isRTL && styles.rtlText]}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder={t.profile_edit_phone_ph}
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </EditField>

            {/* Save */}
            <TouchableOpacity
              style={[styles.saveBtn, isRTL && styles.rowReverse, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <Text style={styles.saveBtnText}>{t.saving}</Text>
                : <>
                    <CheckIcon size={16} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.saveBtnText}>{t.save}</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components (mirror ProfileScreen for a consistent look) ──

function StatBox({ label, value, Icon, color }: { label: string; value: string; Icon: any; color: string }) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
        <Icon size={18} color={color} strokeWidth={2} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ Icon, label, value, isRTL }: { Icon: any; label: string; value: string; isRTL?: boolean }) {
  return (
    <View style={[styles.infoRow, isRTL && styles.rowReverse]}>
      <View style={styles.infoIconWrap}>
        <Icon size={15} color={COLORS.textSecondary} strokeWidth={2} />
      </View>
      <Text style={[styles.infoLabel, isRTL && styles.rtlText]}>{label}</Text>
      <Text style={[styles.infoValue, isRTL && styles.ltrText]}>{value}</Text>
    </View>
  );
}

function EditField({ Icon, label, last, isRTL, children }: { Icon: any; label: string; last?: boolean; isRTL?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.editField, last && styles.editFieldLast, isRTL && styles.rowReverse]}>
      <View style={styles.editFieldIcon}>
        <Icon size={15} color={COLORS.primary} strokeWidth={2} />
      </View>
      <View style={styles.editFieldBody}>
        <Text style={[styles.editFieldLabel, isRTL && styles.rtlText]}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // RTL helpers
  rtlText:    { textAlign: 'right' },
  ltrText:    { textAlign: 'left' },
  rowReverse: { flexDirection: 'row-reverse' },
  selfEnd:    { alignSelf: 'flex-end' },
  selfStart:  { alignSelf: 'flex-start' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18,
  },
  avatarWrap: { position: 'relative' },
  avatarRing: {
    width: 62, height: 62, borderRadius: 31,
    borderWidth: 2, borderColor: COLORS.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.primary,
    borderWidth: 2.5, borderColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTextWrap: { flex: 1, gap: 3 },
  headerEyebrow: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { fontSize: 21, fontWeight: '800', color: COLORS.text },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 3,
    borderWidth: 1, borderColor: COLORS.goldTint,
    backgroundColor: COLORS.goldBg,
  },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.gold, letterSpacing: 0.2 },

  // Stats (mirror ProfileScreen)
  statsCard: {
    flexDirection: 'row', backgroundColor: COLORS.card,
    marginHorizontal: 16, marginTop: 4, borderRadius: 22, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: COLORS.textSecondary },
  statsDivider: { width: 1, backgroundColor: COLORS.border, marginVertical: 4 },

  section: {
    backgroundColor: COLORS.card, borderRadius: 22,
    marginHorizontal: 16, marginTop: 14,
    padding: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  infoLabel:    { flex: 1, fontSize: 14, color: COLORS.textSecondary },
  infoValue:    { fontSize: 14, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  editBtn:      { paddingTop: 12, alignItems: 'flex-end' },
  editBtnText:  { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  settingRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingRowLast:  { borderBottomWidth: 0 },
  settingLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  settingLabel:    { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  langToggle:      { fontSize: 12, fontWeight: '700', color: COLORS.primary, backgroundColor: COLORS.primaryBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },

  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginHorizontal: 16, marginTop: 16, padding: 16, backgroundColor: COLORS.errorBg, borderRadius: 18, borderWidth: 1, borderColor: '#fecaca' },
  logoutText: { fontSize: 15, fontWeight: '700', color: COLORS.error },

  // Modal — centered iOS-style dialog
  modalOverlay: {
    flex: 1, backgroundColor: COLORS.overlay,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: '100%', maxWidth: 400,
    backgroundColor: COLORS.card, borderRadius: 28,
    padding: 24,
    shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 12 }, shadowRadius: 28, elevation: 12,
  },
  modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:    { fontSize: 20, fontWeight: '800', color: COLORS.text },

  // Edit fields (mirror ProfileScreen)
  editField:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 14 },
  editFieldLast:  { borderBottomWidth: 0, marginBottom: 20 },
  editFieldIcon:  { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  editFieldBody:  { flex: 1, gap: 3 },
  editFieldLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  editInput:      { fontSize: 15, color: COLORS.text, paddingVertical: 4 },

  saveBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4 },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
});
