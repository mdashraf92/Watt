import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Linking,
  Modal, Platform, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { api } from '../lib/api';
import { COLORS, GRADIENTS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import Constants from 'expo-constants';
import TermsScreen from './TermsScreen';
import PrivacyScreen from './PrivacyScreen';
import type { ChargingSession, ChargerApplication, CustomerStackParamList } from '../types';
import { useTabBarHeight } from '../navigation/tabBarLayout';
import {
  BellIcon, ShieldIcon, HelpCircleIcon, InfoIcon, GlobeIcon,
  LogOutIcon, ChevronRightIcon, UserIcon, CarIcon, PhoneIcon, MailIcon,
  AwardIcon, XIcon, CheckIcon, ZapIcon, BatteryChargingIcon, StarIcon,
  CameraIcon, HistoryIcon, PlugZapIcon, ClockIcon, NavigationIcon, AlertTriangleIcon,
  HeartIcon,
} from '../components/icons';

// ── Vehicle helpers ────────────────────────────────────────────

interface VehicleData { model: string; connector: string; year: string }

const DEFAULT_VEHICLE: VehicleData = { model: '', connector: '', year: '' };

const CONNECTOR_TYPES = ['Type 2', 'CCS2', 'CHAdeMO', 'Tesla'] as const;

function parseVehicle(raw?: string): VehicleData {
  if (!raw) return DEFAULT_VEHICLE;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed.model !== undefined) return parsed as VehicleData;
  } catch {}
  return { model: raw, connector: '', year: '' };
}

function serializeVehicle(v: VehicleData): string {
  return JSON.stringify(v);
}


// ── Screen ─────────────────────────────────────────────────────

const AVATAR_KEY = (id: string) => `watt_avatar_${id}`;
const INVESTOR_BANNER_DISMISSED_KEY = (id: string) => `watt_investor_banner_dismissed_${id}`;
// The mobile-charging and trip-planner teasers that used to live here have both
// shipped, so their waitlist/dismissal state is gone. The old AsyncStorage keys
// (watt_coming_soon_notified_*, watt_coming_soon_hidden_*) are simply orphaned —
// a few bytes per account, not worth a migration to delete.

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;

export default function ProfileScreen() {
  const { profile, session, signOut, updateProfile, deleteAccount } = useAuth();
  const { t, toggleLanguage, isRTL } = useLang();
  const tabBarHeight = useTabBarHeight();
  const navigation = useNavigation<NavProp>();
  // This screen is reused by the operator (driver) tab, whose stack has none of
  // the customer routes below. Gate on role instead of forking the screen —
  // navigating to a route that isn't registered throws at runtime.
  const isDriver = profile?.role === 'operator';
  // Already an investor (role granted directly, or application approved) —
  // never show the "become an investor" invite/status card for them.
  const isInvestor = profile?.role === 'investor';

  // Modal visibility
  const [editModal,     setEditModal]     = useState(false);
  const [notifModal,    setNotifModal]    = useState(false);
  const [securityModal, setSecurityModal] = useState(false);
  const [helpModal,     setHelpModal]     = useState(false);
  const [aboutModal,    setAboutModal]    = useState(false);
  const [termsModal,    setTermsModal]    = useState(false);
  const [privacyModal,  setPrivacyModal]  = useState(false);
  const [historyModal,  setHistoryModal]  = useState(false);

  // Local avatar URI (stored in AsyncStorage, never uploaded)
  const [localAvatar,   setLocalAvatar]   = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);


  // Edit form state
  const [editName,      setEditName]      = useState(profile?.full_name ?? '');
  const [editPhone,     setEditPhone]     = useState(profile?.phone ?? '');
  const [editVehicle,   setEditVehicle]   = useState<VehicleData>(() => parseVehicle(profile?.car_model));
  const [saving,        setSaving]        = useState(false);

  // Load saved avatar on mount
  useEffect(() => {
    if (!profile?.id) return;
    AsyncStorage.getItem(AVATAR_KEY(profile.id)).then(uri => {
      if (uri) setLocalAvatar(uri);
    });
  }, [profile?.id]);

  // Notification toggles — initialised from the profile, persisted on change
  const [notifPush,     setNotifPush]     = useState(profile?.notif_push     ?? true);
  const [notifBooking,  setNotifBooking]  = useState(profile?.notif_booking  ?? true);
  const [notifCharging, setNotifCharging] = useState(profile?.notif_charging ?? true);
  const [notifPromo,    setNotifPromo]    = useState(profile?.notif_promo    ?? false);

  // Keep toggles in sync when the profile (re)loads, e.g. after login
  useEffect(() => {
    setNotifPush(profile?.notif_push         ?? true);
    setNotifBooking(profile?.notif_booking   ?? true);
    setNotifCharging(profile?.notif_charging ?? true);
    setNotifPromo(profile?.notif_promo       ?? false);
  }, [profile?.id]);

  // Optimistically flip the toggle, then persist to the profile.
  const persistNotif = (
    key: 'notif_push' | 'notif_booking' | 'notif_charging' | 'notif_promo',
    setter: (v: boolean) => void,
  ) => (value: boolean) => {
    setter(value);
    updateProfile({ [key]: value }).catch(() => setter(!value));
  };

  // Charging history
  const [sessions,         setSessions]         = useState<ChargingSession[]>([]);
  const [sessionsLoading,  setSessionsLoading]  = useState(false);

  // Investor application — refetch every time screen is focused
  const [application, setApplication] = useState<ChargerApplication | null | undefined>(undefined);

  // "Become an investor" invite is dismissible — once hidden it stays hidden
  // (local preference, not worth a backend column for a one-way UI dismiss).
  const [inviteDismissed, setInviteDismissed] = useState(false);
  useEffect(() => {
    if (!profile?.id) return;
    AsyncStorage.getItem(INVESTOR_BANNER_DISMISSED_KEY(profile.id)).then(v => setInviteDismissed(v === '1'));
  }, [profile?.id]);
  const dismissInvite = () => {
    setInviteDismissed(true);
    if (profile?.id) AsyncStorage.setItem(INVESTOR_BANNER_DISMISSED_KEY(profile.id), '1');
  };

  const fetchApplication = useCallback(() => {
    if (!profile) return;
    api.applications.mine()
      .then((data) => setApplication((data ?? null) as ChargerApplication | null))
      .catch(() => setApplication(null));
  }, [profile?.id]);

  useFocusEffect(fetchApplication);

  const vehicle = parseVehicle(profile?.car_model);

  // ── Photo pick (stored locally, no upload) ───────────────────

  const handleChangePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setAvatarLoading(true);
    try {
      const uri = result.assets[0].uri;
      await AsyncStorage.setItem(AVATAR_KEY(profile!.id), uri);
      setLocalAvatar(uri);
    } finally {
      setAvatarLoading(false);
    }
  };

  // ── Edit save ────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editName.trim()) {
      Alert.alert(t.error, t.auth_error_name);
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        full_name: editName.trim(),
        phone: editPhone.trim() || undefined,
        car_model: editVehicle.model.trim()
          ? serializeVehicle(editVehicle)
          : undefined,
      });
      setEditModal(false);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Charging history fetch ────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    if (!profile) return;
    setSessionsLoading(true);
    try {
      const data = await api.sessions.list();
      setSessions(data as ChargingSession[]);
    } catch { /* ignore */ }
    finally {
      setSessionsLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (historyModal) fetchSessions();
  }, [historyModal, fetchSessions]);

  // ── Sign out ─────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert(t.profile_logout_title, t.profile_logout_msg, [
      { text: t.cancel, style: 'cancel' },
      { text: t.profile_logout_confirm, style: 'destructive', onPress: signOut },
    ]);
  };

  // Permanent account deletion (App Store requirement). Two-step confirmation
  // because it is irreversible and erases all the user's data.
  const handleDelete = () => {
    Alert.alert(
      t.profile_deactivate_title,
      t.profile_deactivate_msg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.profile_deactivate_confirm,
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t.profile_delete_final_title,
              t.profile_delete_final_msg,
              [
                { text: t.cancel, style: 'cancel' },
                {
                  text: t.profile_delete_final_confirm,
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                    } catch (e: any) {
                      Alert.alert(t.error, e.message);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  if (!profile) return null;

  const email = session?.user?.email ?? '';

  const initials = profile.full_name ? profile.full_name[0].toUpperCase() : '?';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabBarHeight }}>

        {/* ── Hero ──────────────────────────────────────────── */}
        <LinearGradient
          colors={GRADIENTS.greenDeep}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroDeco1} />
          <View style={styles.heroDeco2} />

          {/* Avatar */}
          <TouchableOpacity style={styles.avatarWrap} onPress={handleChangePhoto} activeOpacity={0.85}>
            {localAvatar ? (
              <Image source={{ uri: localAvatar }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              {avatarLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <CameraIcon size={12} color="#fff" strokeWidth={2} />
              }
            </View>
          </TouchableOpacity>

          <Text style={styles.heroName}>
            {profile.full_name || t.profile_dev_name}
          </Text>
          {(profile.phone || session?.user?.email) ? (
            <Text style={styles.heroPhone}>{profile.phone || session?.user?.email}</Text>
          ) : null}
        </LinearGradient>

        {/* ── Stats ─────────────────────────────────────────── */}
        <View style={styles.statsCard}>
          <StatBox label={t.profile_sessions} value={String(profile.total_sessions)} Icon={ZapIcon}             color={COLORS.primary} />
          <View style={styles.statsDivider} />
          <StatBox label={t.profile_kwh}      value={profile.total_kwh.toFixed(0)}   Icon={BatteryChargingIcon} color="#3b82f6" />
        </View>

        {/* ── Investor Application Banner ────────────────────── */}
        {!isDriver && !isInvestor && !(application === null && inviteDismissed) && <InvestorBanner
          application={application}
          t={t}
          onApply={() => navigation.navigate('InvestorApplication', {})}
          onReapply={() => navigation.navigate('InvestorApplication', { reapply: true })}
          onDismiss={dismissInvite}
        />}

        {/* ── Services ───────────────────────────────────────── */}
        {/* Both of these shipped; the Coming Soon teasers they replaced used to
            live here (mobile charging and the trip planner). */}
        {!isDriver && (
        <View style={{ marginHorizontal: 16, marginTop: 14, gap: 12 }}>
          <TouchableOpacity
            style={[styles.serviceCard, isRTL && { flexDirection: 'row-reverse' }]}
            onPress={() => navigation.navigate('MobileCharge')}
            activeOpacity={0.85}
          >
            <View style={styles.serviceIcon}>
              <ZapIcon size={22} color="#fff" strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.serviceTitle, isRTL && { textAlign: 'right' }]}>{t.mc_entry_title}</Text>
              <Text style={[styles.serviceSub, isRTL && { textAlign: 'right' }]}>{t.mc_entry_sub}</Text>
            </View>
            <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
              <ChevronRightIcon size={18} color={COLORS.textTertiary} strokeWidth={2} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.serviceCard, isRTL && { flexDirection: 'row-reverse' }]}
            onPress={() => navigation.navigate('TripPlanner')}
            activeOpacity={0.85}
          >
            <View style={[styles.serviceIcon, { backgroundColor: COLORS.primaryDark }]}>
              <NavigationIcon size={22} color="#fff" strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.serviceTitle, isRTL && { textAlign: 'right' }]}>{t.tp_entry_title}</Text>
              <Text style={[styles.serviceSub, isRTL && { textAlign: 'right' }]}>{t.tp_entry_sub}</Text>
            </View>
            <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
              <ChevronRightIcon size={18} color={COLORS.textTertiary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        </View>
        )}

        {/* ── My Info ───────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.profile_my_info}</Text>
          <InfoRow Icon={UserIcon}  label={t.profile_name}   value={profile.full_name || '—'} />
          <InfoRow Icon={MailIcon}  label={t.profile_email}  value={email || '—'} />
          <InfoRow Icon={PhoneIcon} label={t.profile_phone}  value={profile.phone || '—'} />
          <InfoRow Icon={AwardIcon} label={t.profile_joined} value={new Date(profile.created_at).toLocaleDateString()} />
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => {
              setEditName(profile.full_name);
              setEditPhone(profile.phone ?? '');
              setEditVehicle(parseVehicle(profile.car_model));
              setEditModal(true);
            }}
          >
            <Text style={styles.editBtnText}>{t.profile_edit_clean}</Text>
          </TouchableOpacity>
        </View>

        {/* ── My Vehicle ────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.profile_vehicle_section}</Text>
          {vehicle.model ? (
            <VehicleCard vehicle={vehicle} onEdit={() => {
              setEditVehicle(parseVehicle(profile.car_model));
              setEditModal(true);
            }} />
          ) : (
            <TouchableOpacity
              style={styles.vehicleEmpty}
              onPress={() => {
                setEditVehicle(DEFAULT_VEHICLE);
                setEditModal(true);
              }}
              activeOpacity={0.8}
            >
              <CarIcon size={22} color={COLORS.textTertiary} strokeWidth={1.5} />
              <Text style={styles.vehicleEmptyText}>{t.profile_vehicle_none}</Text>
              <Text style={styles.vehicleEmptyAdd}>+ {t.profile_vehicle_add}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Settings ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.profile_settings}</Text>
          {!isDriver && (
            <SettingRow Icon={PlugZapIcon}  label={t.cp_edit_row}            onPress={() => navigation.navigate('CompleteProfile')} />
          )}
          <SettingRow Icon={BellIcon}       label={t.profile_notifications}  onPress={() => setNotifModal(true)} />
          <SettingRow Icon={ShieldIcon}     label={t.profile_security}       onPress={() => setSecurityModal(true)} />
          <SettingRow Icon={HistoryIcon}    label={t.profile_history_title}  onPress={() => setHistoryModal(true)} />
          <SettingRow Icon={HeartIcon}      label={t.profile_favorites}      onPress={() => navigation.navigate('Favorites')} />
          {!isDriver && (
            <SettingRow Icon={ZapIcon}      label={t.mc_history_title}       onPress={() => navigation.navigate('MobileChargeHistory')} />
          )}
          {!isDriver && (
            <SettingRow Icon={NavigationIcon} label={t.tp_my_trips}          onPress={() => navigation.navigate('MyTrips')} />
          )}
          <SettingRow Icon={AlertTriangleIcon} label={t.report_entry_profile} onPress={() => navigation.navigate('ReportIssue')} />
          <SettingRow Icon={HelpCircleIcon} label={t.profile_help}           onPress={() => setHelpModal(true)} />
          <SettingRow Icon={InfoIcon}       label={t.profile_about}          onPress={() => setAboutModal(true)} />
          <TouchableOpacity style={[styles.settingRow, styles.settingRowLast]} onPress={toggleLanguage} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconWrap, { backgroundColor: '#eff6ff' }]}>
                <GlobeIcon size={16} color="#3b82f6" strokeWidth={2} />
              </View>
              <Text style={styles.settingLabel}>{t.profile_language}</Text>
            </View>
            <Text style={styles.langToggle}>{t.profile_language_label}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Sign out ──────────────────────────────────────── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.85}>
          <LogOutIcon size={18} color={COLORS.error} strokeWidth={2} />
          <Text style={styles.logoutText}>{t.profile_logout_clean}</Text>
        </TouchableOpacity>

        {/* ── Delete / Deactivate account ───────────────────── */}
        <TouchableOpacity style={styles.deactivateBtn} onPress={handleDelete} activeOpacity={0.85}>
          <Text style={styles.deactivateBtnText}>{t.profile_deactivate_btn}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ══ Edit Info Modal ══════════════════════════════════════ */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditModal(false)}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <View style={styles.modalTitleRow}>
                  <Text style={styles.modalTitle}>{t.profile_edit_title}</Text>
                  <TouchableOpacity onPress={() => setEditModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <XIcon size={20} color={COLORS.textSecondary} strokeWidth={2} />
                  </TouchableOpacity>
                </View>

                {/* Full Name */}
                <EditField Icon={UserIcon} label={t.profile_edit_name}>
                  <TextInput
                    style={styles.editInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder={t.profile_edit_name_ph}
                    placeholderTextColor={COLORS.textTertiary}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </EditField>

                {/* Phone */}
                <EditField Icon={PhoneIcon} label={t.profile_edit_phone}>
                  <TextInput
                    style={styles.editInput}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder={t.profile_edit_phone_ph}
                    placeholderTextColor={COLORS.textTertiary}
                    keyboardType="phone-pad"
                    returnKeyType="next"
                  />
                </EditField>

                {/* Vehicle model */}
                <EditField Icon={CarIcon} label={t.profile_edit_car}>
                  <TextInput
                    style={styles.editInput}
                    value={editVehicle.model}
                    onChangeText={v => setEditVehicle(prev => ({ ...prev, model: v }))}
                    placeholder={t.profile_edit_car_ph}
                    placeholderTextColor={COLORS.textTertiary}
                    returnKeyType="next"
                  />
                </EditField>

                {/* Connector type picker */}
                <View style={styles.editField}>
                  <View style={styles.editFieldIcon}>
                    <PlugZapIcon size={15} color={COLORS.primary} strokeWidth={2} />
                  </View>
                  <View style={styles.editFieldBody}>
                    <Text style={styles.editFieldLabel}>{t.profile_vehicle_connector}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                      <View style={styles.connectorRow}>
                        {CONNECTOR_TYPES.map(c => (
                          <TouchableOpacity
                            key={c}
                            style={[styles.connectorChip, editVehicle.connector === c && styles.connectorChipActive]}
                            onPress={() => setEditVehicle(prev => ({ ...prev, connector: c }))}
                          >
                            {editVehicle.connector === c && (
                              <CheckIcon size={11} color={COLORS.primary} strokeWidth={3} />
                            )}
                            <Text style={[styles.connectorText, editVehicle.connector === c && styles.connectorTextActive]}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                </View>

                {/* Year */}
                <View style={[styles.editField, styles.editFieldLast]}>
                  <View style={styles.editFieldIcon}>
                    <ClockIcon size={15} color={COLORS.primary} strokeWidth={2} />
                  </View>
                  <View style={styles.editFieldBody}>
                    <Text style={styles.editFieldLabel}>{t.profile_vehicle_year}</Text>
                    <TextInput
                      style={styles.editInput}
                      value={editVehicle.year}
                      onChangeText={v => setEditVehicle(prev => ({ ...prev, year: v }))}
                      placeholder={t.profile_vehicle_year_ph}
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="numeric"
                      returnKeyType="done"
                      maxLength={4}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>{saving ? t.saving : t.save}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </Modal>

      {/* ══ Notifications Modal ══════════════════════════════════ */}
      <Modal visible={notifModal} transparent animationType="slide" onRequestClose={() => setNotifModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setNotifModal(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t.notif_title}</Text>
            <ToggleRow label={t.notif_push}     sub={t.notif_push_sub}     value={notifPush}     onToggle={persistNotif('notif_push', setNotifPush)} />
            <ToggleRow label={t.notif_booking}  sub={t.notif_booking_sub}  value={notifBooking}  onToggle={persistNotif('notif_booking', setNotifBooking)} />
            <ToggleRow label={t.notif_charging} sub={t.notif_charging_sub} value={notifCharging} onToggle={persistNotif('notif_charging', setNotifCharging)} />
            <ToggleRow label={t.notif_promo}    sub={t.notif_promo_sub}    value={notifPromo}    onToggle={persistNotif('notif_promo', setNotifPromo)} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══ Security Modal ═══════════════════════════════════════ */}
      <Modal visible={securityModal} transparent animationType="slide" onRequestClose={() => setSecurityModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSecurityModal(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t.security_title}</Text>
            <Text style={styles.sectionMini}>{t.security_account}</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoCardLabel}>{t.security_email_label}</Text>
              <Text style={styles.infoCardValue}>{session?.user?.email || profile?.phone || '—'}</Text>
            </View>
            <Text style={styles.sectionMini}>{t.security_protection}</Text>
            <ProtRow emoji="🔐" label={t.security_ssl}      sub={t.security_ssl_sub} />
            <ProtRow emoji="🚫" label={t.security_no_share} sub={t.security_no_share_sub} />
            <ProtRow emoji="📱" label={t.security_local}    sub={t.security_local_sub} />
            <Text style={styles.sectionMini}>{t.security_danger}</Text>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => Alert.alert(t.security_delete, t.security_delete_msg, [
                { text: t.cancel, style: 'cancel' },
                { text: t.security_delete_confirm, style: 'destructive', onPress: signOut },
              ])}
            >
              <Text style={styles.deleteBtnText}>🗑 {t.security_delete}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══ Charging History Modal ═══════════════════════════════ */}
      <Modal visible={historyModal} transparent animationType="slide" onRequestClose={() => setHistoryModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setHistoryModal(false)}>
          <View style={[styles.modalSheet, { maxHeight: '88%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>{t.profile_history_title}</Text>
              <TouchableOpacity onPress={() => setHistoryModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <XIcon size={20} color={COLORS.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            {sessionsLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40, marginBottom: 40 }} />
            ) : sessions.length === 0 ? (
              <View style={styles.historyEmpty}>
                <View style={styles.historyEmptyIcon}>
                  <HistoryIcon size={32} color={COLORS.textTertiary} strokeWidth={1.5} />
                </View>
                <Text style={styles.historyEmptyTitle}>{t.profile_history_empty}</Text>
                <Text style={styles.historyEmptySub}>{t.profile_history_empty_sub}</Text>
              </View>
            ) : (
              <FlatList
                data={sessions}
                keyExtractor={s => s.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
                renderItem={({ item }) => <SessionCard session={item} t={t} />}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══ Help Modal ═══════════════════════════════════════════ */}
      <Modal visible={helpModal} transparent animationType="slide" onRequestClose={() => setHelpModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setHelpModal(false)}>
          <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t.help_title}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionMini}>{t.help_faq}</Text>
              <FaqItem q={t.help_q1} a={t.help_a1} />
              <FaqItem q={t.help_q2} a={t.help_a2} />
              <FaqItem q={t.help_q3} a={t.help_a3} />
              <FaqItem q={t.help_q4} a={t.help_a4} />
              <Text style={styles.sectionMini}>{t.help_contact}</Text>
              <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL('https://wa.me/96892421050')} activeOpacity={0.8}>
                <Text style={styles.contactEmoji}>💬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>{t.help_whatsapp}</Text>
                  <Text style={styles.contactSub}>{t.help_whatsapp_sub}</Text>
                </View>
                <ChevronRightIcon size={16} color={COLORS.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL('mailto:support@watt.om')} activeOpacity={0.8}>
                <Text style={styles.contactEmoji}>✉️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>{t.help_email_support}</Text>
                  <Text style={styles.contactSub}>{t.help_email_sub}</Text>
                </View>
                <ChevronRightIcon size={16} color={COLORS.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══ About Modal ══════════════════════════════════════════ */}
      <Modal visible={aboutModal} transparent animationType="slide" onRequestClose={() => setAboutModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAboutModal(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t.about_title}</Text>
            <View style={styles.aboutHero}>
              <View style={styles.aboutLogoWrap}>
                <ZapIcon size={32} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.aboutAppName}>GO WATT</Text>
              <Text style={styles.aboutTagline}>{t.about_tagline}</Text>
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>{t.about_version} {Constants.expoConfig?.version ?? '1.0.0'}</Text>
              </View>
            </View>
            <Text style={styles.aboutDesc}>{t.about_desc}</Text>
            <Text style={styles.sectionMini}>{t.about_legal}</Text>
            <TouchableOpacity style={styles.contactRow} activeOpacity={0.8} onPress={() => setTermsModal(true)}>
              <Text style={styles.contactEmoji}>📄</Text>
              <Text style={styles.contactLabel}>{t.about_terms}</Text>
              <ChevronRightIcon size={16} color={COLORS.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.contactRow} activeOpacity={0.8} onPress={() => setPrivacyModal(true)}>
              <Text style={styles.contactEmoji}>🔒</Text>
              <Text style={styles.contactLabel}>{t.about_privacy}</Text>
              <ChevronRightIcon size={16} color={COLORS.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.copyright}>{t.about_copyright}</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <TermsScreen  visible={termsModal}   onClose={() => setTermsModal(false)} />
      <PrivacyScreen visible={privacyModal} onClose={() => setPrivacyModal(false)} />
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────

function StatBox({ label, value, Icon, color }: { label: string; value: string; Icon: React.ComponentType<any>; color: string }) {
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

function InfoRow({ Icon, label, value }: { Icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Icon size={15} color={COLORS.textSecondary} strokeWidth={2} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SettingRow({ Icon, label, onPress }: { Icon: any; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.settingLeft}>
        <View style={styles.settingIconWrap}>
          <Icon size={16} color={COLORS.primary} strokeWidth={2} />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <ChevronRightIcon size={18} color={COLORS.borderStrong} strokeWidth={2} />
    </TouchableOpacity>
  );
}

function VehicleCard({ vehicle, onEdit }: { vehicle: VehicleData; onEdit: () => void }) {
  const { t } = useLang();
  return (
    <View style={styles.vehicleCard}>
      <View style={styles.vehicleCardLeft}>
        <View style={styles.vehicleIconWrap}>
          <CarIcon size={22} color={COLORS.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.vehicleModel}>{vehicle.model}</Text>
          <View style={styles.vehicleMeta}>
            {vehicle.connector ? (
              <View style={styles.connectorBadge}>
                <PlugZapIcon size={10} color={COLORS.primary} strokeWidth={2.5} />
                <Text style={styles.connectorBadgeText}>{vehicle.connector}</Text>
              </View>
            ) : null}
            {vehicle.year ? (
              <Text style={styles.vehicleYear}>{vehicle.year}</Text>
            ) : null}
          </View>
        </View>
      </View>
      <TouchableOpacity onPress={onEdit} style={styles.vehicleEditBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.vehicleEditText}>{t.edit}</Text>
      </TouchableOpacity>
    </View>
  );
}

function EditField({ Icon, label, children }: { Icon: any; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.editField}>
      <View style={styles.editFieldIcon}>
        <Icon size={15} color={COLORS.primary} strokeWidth={2} />
      </View>
      <View style={styles.editFieldBody}>
        <Text style={styles.editFieldLabel}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

function ToggleRow({ label, sub, value, onToggle }: { label: string; sub: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onToggle} trackColor={{ false: COLORS.border, true: COLORS.primary }} thumbColor="#fff" />
    </View>
  );
}

function ProtRow({ emoji, label, sub }: { emoji: string; label: string; sub: string }) {
  return (
    <View style={styles.protRow}>
      <Text style={styles.protEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
      <CheckIcon size={18} color={COLORS.success} strokeWidth={2.5} />
    </View>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity style={styles.faqItem} onPress={() => setOpen(!open)} activeOpacity={0.8}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQ} numberOfLines={open ? undefined : 1}>{q}</Text>
        <ChevronRightIcon size={16} color={COLORS.primary} strokeWidth={2.5} />
      </View>
      {open && <Text style={styles.faqA}>{a}</Text>}
    </TouchableOpacity>
  );
}

function InvestorBanner({ application, t, onApply, onReapply, onDismiss }: {
  application: ChargerApplication | null | undefined;
  t: any; onApply: () => void; onReapply: () => void; onDismiss: () => void;
}) {
  if (application === undefined) return null; // still loading

  if (!application) {
    // Compact, icon-led pill in the brand's primary green — deliberately not
    // a full card like before, and dismissible (X) since it's an invite, not
    // status the user needs to keep seeing.
    return (
      <View style={invStyles.applyPill}>
        <TouchableOpacity style={invStyles.applyPillMain} onPress={onApply} activeOpacity={0.85}>
          <View style={invStyles.applyIconCircle}>
            <ZapIcon size={20} color="#fff" strokeWidth={2.2} />
          </View>
          <Text style={invStyles.applyPillText} numberOfLines={1}>{t.profile_app_become_investor}</Text>
          <ChevronRightIcon size={16} color="rgba(255,255,255,0.8)" strokeWidth={2.5} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={invStyles.applyDismiss}>
          <XIcon size={14} color="rgba(255,255,255,0.75)" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    );
  }

  const STATUS_CONFIG: Record<string, { bg: string; border: string; badge: string; badgeTxt: string; text: string; sub: string }> = {
    pending:      { bg: '#FFFBEB', border: '#FEF3C7', badge: '#F59E0B', badgeTxt: '#fff', text: t.inv_app_status_pending,      sub: t.profile_app_under_review_sub },
    under_review: { bg: '#FFFBEB', border: '#FEF3C7', badge: '#F59E0B', badgeTxt: '#fff', text: t.inv_app_status_under_review,  sub: t.profile_app_under_review_sub },
    approved:     { bg: '#ECFDF5', border: '#D1FAE5', badge: '#059669', badgeTxt: '#fff', text: t.inv_app_status_approved,      sub: '' },
    rejected:     { bg: '#FEF2F2', border: '#FECACA', badge: '#EF4444', badgeTxt: '#fff', text: t.inv_app_status_rejected,      sub: t.profile_app_not_approved_sub },
    needs_info:   { bg: '#EFF6FF', border: '#DBEAFE', badge: '#3B82F6', badgeTxt: '#fff', text: t.inv_app_status_needs_info,    sub: application.admin_comment ?? t.profile_app_needs_info_default },
  };

  const cfg = STATUS_CONFIG[application.status] ?? STATUS_CONFIG.pending;

  return (
    <View style={[invStyles.statusCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={invStyles.statusTop}>
        <View style={invStyles.statusLeft}>
          <View style={[invStyles.statusBadge, { backgroundColor: cfg.badge }]}>
            <Text style={[invStyles.statusBadgeText, { color: cfg.badgeTxt }]}>{cfg.text}</Text>
          </View>
          <Text style={invStyles.statusMain}>{t.inv_app_status_title}</Text>
        </View>
        <ZapIcon size={20} color={cfg.badge} strokeWidth={2} />
      </View>
      {cfg.sub ? <Text style={invStyles.statusSub}>{cfg.sub}</Text> : null}
      {(application.status === 'rejected' || application.status === 'needs_info') && (
        <TouchableOpacity style={invStyles.reapplyBtn} onPress={onReapply} activeOpacity={0.8}>
          <Text style={invStyles.reapplyBtnText}>{t.inv_app_reapply}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function SessionCard({ session, t }: { session: ChargingSession; t: any }) {
  const station = (session as any).station;
  const stationName = station?.name ?? 'Unknown Station';
  const durationMin = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
    : null;

  return (
    <View style={styles.sessionCard}>
      <View style={[styles.sessionIconWrap, { backgroundColor: COLORS.primaryBg }]}>
        <ZapIcon size={18} color={COLORS.primary} strokeWidth={2} />
      </View>
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionStation} numberOfLines={1}>{stationName}</Text>
        <Text style={styles.sessionDate}>
          {new Date(session.started_at).toLocaleDateString()} · {new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <View style={styles.sessionStats}>
          <View style={styles.sessionStat}>
            <BatteryChargingIcon size={11} color={COLORS.textTertiary} strokeWidth={2} />
            <Text style={styles.sessionStatText}>{session.kwh_delivered.toFixed(1)} kWh</Text>
          </View>
          {durationMin !== null && (
            <View style={styles.sessionStat}>
              <ClockIcon size={11} color={COLORS.textTertiary} strokeWidth={2} />
              <Text style={styles.sessionStatText}>{durationMin} min</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.sessionRight}>
        <Text style={styles.sessionCost}>{session.cost.toFixed(3)}</Text>
        <Text style={styles.sessionCostLabel}>OMR</Text>
        <View style={[styles.sessionStatus, session.status === 'completed' ? styles.sessionStatusDone : styles.sessionStatusInterrupted]}>
          <Text style={[styles.sessionStatusText, session.status === 'completed' ? { color: COLORS.success } : { color: COLORS.warning }]}>
            {session.status === 'completed' ? '✓' : '!'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Hero
  hero: {
    backgroundColor: COLORS.primaryDark,
    paddingTop: 24, paddingBottom: 36, paddingHorizontal: 24,
    alignItems: 'center', gap: 8, overflow: 'hidden',
  },
  heroGold: { backgroundColor: '#1a1400' },
  heroDeco1: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.05)', top: -80, right: -60 },
  heroDeco2: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.04)', bottom: -40, left: -20 },

  // Avatar
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderWidth: 2.5, borderColor: 'rgba(16,185,129,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 84, height: 84, borderRadius: 42, borderWidth: 2.5, borderColor: 'rgba(16,185,129,0.45)' },
  avatarGold: { borderColor: 'rgba(212,175,55,0.5)', backgroundColor: 'rgba(212,175,55,0.15)' },
  avatarInitial: { fontSize: 36, fontWeight: '800', color: '#fff' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primary,
    borderWidth: 2, borderColor: COLORS.primaryDark,
    alignItems: 'center', justifyContent: 'center',
  },
  memberDot: { position: 'absolute', top: 2, left: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: COLORS.primaryDark },

  heroName:  { fontFamily: FONTS.bold, fontSize: 22, color: '#fff' },
  heroPhone: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  memberEmoji: { fontSize: 13 },
  memberText:  { fontSize: 12, fontWeight: '700' },

  // Stats
  statsCard: {
    flexDirection: 'row', backgroundColor: COLORS.card,
    marginHorizontal: 16, marginTop: -20, borderRadius: 22, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.10, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 5,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: COLORS.textSecondary },
  statsDivider: { width: 1, backgroundColor: COLORS.border, marginVertical: 4 },

  // Section
  section: { backgroundColor: COLORS.card, borderRadius: 22, marginHorizontal: 16, marginTop: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  // Services — live features that used to be Coming Soon teasers
  serviceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.primaryTint,
  },
  serviceIcon: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  serviceTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  serviceSub: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },

  // Info rows
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { flex: 1, fontSize: 14, color: COLORS.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  editBtn: { paddingTop: 12, alignItems: 'flex-end' },
  editBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  // Vehicle
  vehicleCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.primaryBg,
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: COLORS.primaryTint,
    gap: 12,
  },
  vehicleCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.primaryTint },
  vehicleModel: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  vehicleMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectorBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.primaryTint },
  connectorBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  vehicleYear: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  vehicleEditBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  vehicleEditText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  vehicleEmpty: {
    alignItems: 'center', gap: 6, paddingVertical: 24,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16,
    borderStyle: 'dashed',
  },
  vehicleEmptyText: { fontSize: 14, color: COLORS.textSecondary },
  vehicleEmptyAdd: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  // Settings
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingRowLast: { borderBottomWidth: 0 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  langToggle: { fontSize: 12, fontWeight: '700', color: COLORS.primary, backgroundColor: COLORS.primaryBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },

  // Logout
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginHorizontal: 16, marginTop: 16, padding: 16, backgroundColor: COLORS.errorBg, borderRadius: 18, borderWidth: 1, borderColor: '#fecaca' },
  logoutText: { fontSize: 15, fontWeight: '700', color: COLORS.error },
  deactivateBtn:     { alignItems: 'center', marginHorizontal: 16, marginTop: 10, paddingVertical: 14 },
  deactivateBtnText: { fontSize: 13, color: COLORS.textTertiary, textDecorationLine: 'underline' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: COLORS.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 28 },
  modalHandle:  { width: 40, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: COLORS.text },

  // Edit fields
  editField: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 14 },
  editFieldLast: { borderBottomWidth: 0, marginBottom: 20 },
  editFieldIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  editFieldBody: { flex: 1, gap: 3 },
  editFieldLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  editInput: { fontSize: 15, color: COLORS.text, paddingVertical: 4 },

  // Connector chips
  connectorRow: { flexDirection: 'row', gap: 8 },
  connectorChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.background },
  connectorChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  connectorText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  connectorTextActive: { color: COLORS.primary },

  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4 },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sectionMini: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 18, marginBottom: 8 },

  // Toggle / prot rows
  toggleRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
  toggleLabel:{ fontSize: 14, fontWeight: '600', color: COLORS.text },
  toggleSub:  { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  protRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
  protEmoji:  { fontSize: 18, width: 28 },

  // Security
  infoCard:      { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 4 },
  infoCardLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  infoCardValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  deleteBtn:     { marginTop: 8, padding: 14, backgroundColor: COLORS.errorBg, borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', alignItems: 'center' },
  deleteBtnText: { color: COLORS.error, fontWeight: '700', fontSize: 14 },

  // Contact / FAQ
  contactRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
  contactEmoji:  { fontSize: 20, width: 30 },
  contactLabel:  { fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1 },
  contactSub:    { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  faqItem:       { borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 12 },
  faqHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faqQ:          { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text, marginRight: 8 },
  faqA:          { fontSize: 13, color: COLORS.textSecondary, marginTop: 8, lineHeight: 20 },

  // About
  aboutHero:    { alignItems: 'center', paddingVertical: 16, gap: 8 },
  aboutLogoWrap:{ width: 72, height: 72, borderRadius: 22, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 4, borderWidth: 1.5, borderColor: COLORS.primaryTint },
  aboutAppName: { fontSize: 28, fontWeight: '800', color: COLORS.primary, letterSpacing: 5 },
  aboutTagline: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  versionBadge: { backgroundColor: COLORS.primaryBg, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primaryTint },
  versionText:  { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  aboutDesc:    { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 4 },
  copyright:    { fontSize: 11, color: COLORS.textTertiary, textAlign: 'center', marginTop: 20, paddingBottom: 8 },

  // Investor banner (apply card)

  // Charging history
  historyEmpty:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
  historyEmptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.backgroundAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  historyEmptyTitle:{ fontSize: 16, fontWeight: '700', color: COLORS.text },
  historyEmptySub:  { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },

  // Session card (kept here intentionally)
  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 16, padding: 12, gap: 12, borderWidth: 1, borderColor: COLORS.border },
  sessionIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sessionInfo: { flex: 1 },
  sessionStation: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  sessionDate: { fontSize: 11, color: COLORS.textTertiary, marginBottom: 4 },
  sessionStats: { flexDirection: 'row', gap: 10 },
  sessionStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sessionStatText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  sessionRight: { alignItems: 'flex-end', gap: 2 },
  sessionCost: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  sessionCostLabel: { fontSize: 10, color: COLORS.textTertiary },
  sessionStatus: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  sessionStatusDone: { backgroundColor: COLORS.successBg },
  sessionStatusInterrupted: { backgroundColor: COLORS.warningBg },
  sessionStatusText: { fontSize: 11, fontWeight: '800' },
});

const invStyles = StyleSheet.create({
  // "Become an investor" — compact icon-led pill (brand primary green),
  // dismissible, deliberately lighter-weight than a full promo card.
  applyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 18, paddingVertical: 6, paddingRight: 8, paddingLeft: 6,
    shadowColor: COLORS.primary, shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4,
  },
  applyPillMain: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  applyIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  applyPillText: { flex: 1, fontSize: 14, fontWeight: '800', color: '#fff' },
  applyDismiss: { padding: 6 },

  // Application status card
  statusCard: {
    marginHorizontal: 16, marginTop: 14,
    borderRadius: 20, padding: 16, borderWidth: 1.5,
  },
  statusTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statusLeft: { gap: 4 },
  statusBadge:     { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  statusMain: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  statusSub:  { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 4 },
  reapplyBtn: {
    marginTop: 10, alignItems: 'center', paddingVertical: 10,
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  reapplyBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
});
