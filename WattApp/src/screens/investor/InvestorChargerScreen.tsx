import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { useTabBarHeight } from '../../navigation/tabBarLayout';
import { api, ApiError } from '../../lib/api';
import { realtime } from '../../lib/realtime';
import { COLORS } from '../../constants/colors';
import type { ChargerListing, Booking } from '../../types';
import {
  ZapIcon, XIcon, CalendarIcon, CheckIcon,
} from '../../components/icons';


export default function InvestorChargerScreen() {
  const { profile } = useAuth();
  const { t, isRTL } = useLang();
  const tabBarHeight = useTabBarHeight();
  const navigation = useNavigation<any>();

  const [listing,  setListing]  = useState<ChargerListing | null | undefined>(undefined);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [toggling,     setToggling]     = useState(false);
  const [editModal,    setEditModal]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [selfCharging, setSelfCharging] = useState(false);
  const deviceRef = useRef<TextInput>(null);

  // Earnings summary (today / this month / this month's session count)
  const [earnToday, setEarnToday] = useState(0);
  const [earnMonth, setEarnMonth] = useState(0);
  const [sessMonth, setSessMonth] = useState(0);
  const [hostSummary, setHostSummary] = useState<Awaited<ReturnType<typeof api.host.summary>> | null>(null);

  // Edit form — price is NOT editable here: pricing is set by Go Watt admin
  const [editAddress,  setEditAddress]  = useState('');
  const [editPowerKw,  setEditPowerKw]  = useState('');
  const [editStart,    setEditStart]    = useState('08:00');
  const [editEnd,      setEditEnd]      = useState('22:00');
  const [editDesc,     setEditDesc]     = useState('');
  const [editDeviceId, setEditDeviceId] = useState('');

  const fetchListing = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const listData: any = await api.host.listing();
      setListing(listData as ChargerListing | null);
      if (listData) {
        const bData: any[] = await api.host.bookings();
        const mapped = (bData ?? []).map((r: any) => ({
          ...r,
          customer: { full_name: r.customer_name, phone: r.customer_phone },
        }));
        setBookings(mapped as Booking[]);
      }
    } catch { /* keep prior state */ }
    finally { setLoading(false); }
  }, [profile]);

  const fetchEarnings = useCallback(async () => {
    if (!profile) return;
    try {
      const summary = await api.host.summary();
      setHostSummary(summary);
      setEarnToday(summary.earnings.today);
      setEarnMonth(summary.earnings.month);
      setSessMonth(summary.month_sessions);
    } catch { /* preserve the last successful summary */ }
  }, [profile?.id]);

  useEffect(() => { fetchListing(); fetchEarnings(); }, [fetchListing, fetchEarnings]);

  // Live-update the charger row (switch_status / is_available) when a
  // session starts, auto-shutoff fires, or an admin changes it.
  useEffect(() => {
    if (!listing?.id) return;
    const off = realtime.onTable('charger_listings', (row) => {
      if (row?.id === listing.id) setListing(prev => (prev ? { ...prev, ...row } : row));
    });
    return off;
  }, [listing?.id]);

  const openEdit = (focusDevice = false) => {
    if (listing) {
      setEditAddress(listing.address);
      setEditPowerKw(String(listing.power_kw));
      setEditStart(listing.availability_start ?? '08:00');
      setEditEnd(listing.availability_end ?? '22:00');
      setEditDesc(listing.description ?? '');
      setEditDeviceId(listing.tuya_device_id ?? '');
    }
    setEditModal(true);
    if (focusDevice) {
      setTimeout(() => deviceRef.current?.focus(), 400);
    }
  };

  const handleSave = async () => {
    if (!listing || !editAddress.trim()) {
      Alert.alert(t.error, t.inv_charger_address); return;
    }
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        address:            editAddress.trim(),
        power_kw:           parseFloat(editPowerKw) || listing.power_kw,
        availability_start: editStart,
        availability_end:   editEnd,
        description:        editDesc.trim() || null,
      };
      // Device id is locked once the admin has verified the charger. Only send
      // it while still editable (the server enforces this too).
      if (!listing.tuya_verified) {
        updates.tuya_device_id = editDeviceId.trim() || null;
      }
      const saved: any = await api.host.editListing(updates);
      setListing(prev => prev ? { ...prev, ...(saved ?? updates) } : prev);
      setEditModal(false);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally { setSaving(false); }
  };

  const handleCreateListing = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const data: any = await api.host.createListing();   // built server-side from the approved application
      setListing(data as ChargerListing);
      openEdit();
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally { setSaving(false); }
  };

  const handleToggle = async () => {
    if (!listing) return;
    if (!listing.tuya_verified) {
      Alert.alert(
        t.warning,
        listing.tuya_device_id ? t.inv_device_pending : t.inv_device_not_linked,
        [
          { text: t.cancel, style: 'cancel' },
          { text: t.inv_setup_step2_cta, onPress: () => openEdit(true) },
        ],
      );
      return;
    }
    const newVal  = !listing.is_available;
    const prevVal = listing.is_available;
    setToggling(true);
    try {
      // AVAILABILITY is just a listing flag — "can customers see and book this
      // charger?" It does NOT power the plug. The physical switch is turned on
      // ONLY during an authorised charging session (customer start / self-charge)
      // and off when the session ends. So nobody can get free electricity, and
      // the investor's toggle can never clash with a charging customer.
      //
      // Guard: can't go OFFLINE while a customer is mid-charge (they'd lose the
      // booking they're using). Checked server-side (RLS hides their session).
      // Instant + reliable: no hardware call. The backend rejects going offline
      // (409 'busy') if a customer is mid-charge.
      setListing(prev => prev ? { ...prev, is_available: newVal } : prev);
      try {
        await api.host.setAvailability(newVal);
      } catch (e: any) {
        setListing(prev => prev ? { ...prev, is_available: prevVal } : prev);
        if (e instanceof ApiError && e.code === 'busy') { Alert.alert(t.warning, t.inv_toggle_busy); return; }
        throw e;
      }
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally { setToggling(false); }
  };

  // ── Self-charge ──────────────────────────────────────────────
  const handleSelfCharge = () => {
    if (!listing || !profile) return;
    if (!listing.tuya_device_id) {
      Alert.alert(t.warning, t.inv_charge_no_device, [
        { text: t.cancel, style: 'cancel' },
        { text: t.inv_setup_step2_cta, onPress: () => openEdit(true) },
      ]);
      return;
    }
    if (!listing.tuya_verified) {
      Alert.alert(t.warning, t.inv_charge_not_verified);
      return;
    }
    Alert.alert(t.inv_charge_confirm_title, t.inv_charge_confirm_msg, [
      { text: t.cancel, style: 'cancel' },
      { text: t.inv_charge_my_car, onPress: doSelfCharge },
    ]);
  };

  const doSelfCharge = async () => {
    if (!listing || !profile) return;
    setSelfCharging(true);
    try {
      // Backend turns on the switch and creates the (no-booking) session.
      const { session_id } = await api.host.selfCharge();
      navigation.navigate('Charging', {
        sessionId:   session_id,
        stationName: listing.station_name || listing.address || t.inv_charger_tab,
      });
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setSelfCharging(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.loadingWrap}><ActivityIndicator color={COLORS.primary} size="large" /></View>
    </SafeAreaView>
  );

  // ── Setup states ─────────────────────────────────────────────
  const hasDevice   = !!listing?.tuya_device_id;
  const isVerified  = !!listing?.tuya_verified;
  const isOnline    = !!listing?.is_available;
  const setupDone   = hasDevice && isVerified;

  // ── No listing: welcome + guide ───────────────────────────────
  if (!listing) return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.welcomeHero}>
        <View style={s.heroDeco1} /><View style={s.heroDeco2} />
        <View style={s.welcomeIconWrap}>
          <ZapIcon size={36} color={COLORS.gold} strokeWidth={2} />
        </View>
        <Text style={s.welcomeTitle}>{t.inv_congratulations}</Text>
        <Text style={s.welcomeSub}>{t.inv_congratulations_sub}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: tabBarHeight + 16 }} showsVerticalScrollIndicator={false}>
        <SetupStep num={1} title={t.inv_setup_step1_title} sub={t.inv_setup_step1_sub} done />
        <SetupStep num={2} title={t.inv_setup_step2_title} sub={t.inv_setup_step2_sub} active />
        <SetupStep num={3} title={t.inv_setup_step3_title} sub={t.inv_setup_step3_sub} />
        <SetupStep num={4} title={t.inv_setup_step4_title} sub={t.inv_setup_step4_sub} />

        <TouchableOpacity
          style={[s.cta, saving && s.ctaOff]}
          onPress={handleCreateListing} disabled={saving} activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.ctaText}>{t.inv_charger_setup_btn}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ── Full management view ──────────────────────────────────────
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}>
        {hostSummary && <View style={{margin:20,padding:16,gap:10,backgroundColor:COLORS.card,borderRadius:16}}>
          <Text style={{fontWeight:'700',color:COLORS.text}}>{isRTL?'العمليات الحالية':'Current operations'}</Text>
          <Text style={{color:COLORS.text}}>{isRTL?'دفعات قيد الانتظار':'Pending payouts'}: {hostSummary.pending_payout.toFixed(3)} OMR</Text>
          <Text style={{color:COLORS.text}}>{isRTL?'جلسات نشطة':'Active sessions'}: {hostSummary.active_sessions.length}</Text>
          {hostSummary.active_sessions.map(session=><View key={session.id} style={{gap:4}}>
            <Text style={{color:COLORS.text}}>{new Date(session.started_at).toLocaleString()} · {Number(session.kwh_delivered||0).toFixed(2)} kWh · {Number(session.cost||0).toFixed(3)} OMR</Text>
          </View>)}
        </View>}

        {/* ── Hero status card ── */}
        <View style={[s.hero, isOnline ? s.heroOn : s.heroOff]}>
          <View style={s.heroDeco1} /><View style={s.heroDeco2} />
          <View style={s.heroTop}>
            <View>
              <View style={s.heroStatusRow}>
                <View style={[s.statusDot, { backgroundColor: isOnline ? COLORS.success : COLORS.textTertiary }]} />
                <Text style={s.heroStatus}>
                  {isOnline ? t.inv_charger_status_online : t.inv_charger_status_offline}
                </Text>
              </View>
              <Text style={s.heroChargerName}>
                {listing.charger_type} · {listing.power_kw} kW
              </Text>
              <Text style={s.heroAddress} numberOfLines={1}>📍 {listing.address}</Text>
            </View>

            {/* Big toggle */}
            <View style={s.toggleWrap}>
              {toggling
                ? <ActivityIndicator color={COLORS.primary} />
                : <Switch
                    value={isOnline}
                    onValueChange={handleToggle}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor="#fff"
                    style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
                  />
              }
            </View>
          </View>

          {/* Today's earnings strip */}
          <View style={s.heroEarnRow}>
            <Text style={s.heroEarnLabel}>{t.inv_earn_today}</Text>
            <Text style={s.heroEarnValue}>{earnToday.toFixed(3)} OMR</Text>
          </View>

          {/* Tuya device badge */}
          <View style={s.deviceBadgeRow}>
            {!hasDevice ? (
              <TouchableOpacity style={[s.deviceBadge, s.deviceBadgeWarn]} onPress={() => openEdit(true)} activeOpacity={0.8}>
                <Text style={s.deviceBadgeText}>⚠ {t.inv_device_not_linked} — {t.inv_setup_step2_cta}</Text>
              </TouchableOpacity>
            ) : !isVerified ? (
              <View style={[s.deviceBadge, s.deviceBadgeAmber]}>
                <Text style={s.deviceBadgeText}>⏳ {t.inv_device_pending}</Text>
              </View>
            ) : (
              <View style={[s.deviceBadge, s.deviceBadgeGreen]}>
                <Text style={s.deviceBadgeText}>⚡ {t.inv_device_verified}</Text>
              </View>
            )}
            <TouchableOpacity style={s.editBadge} onPress={() => openEdit()} activeOpacity={0.8}>
              <Text style={s.editBadgeText}>✎ Edit</Text>
            </TouchableOpacity>
          </View>

          {/* Charge My Car button — only shown when device is verified */}
          {isVerified && (
            <TouchableOpacity
              style={[s.selfChargeBtn, selfCharging && s.selfChargeBtnOff]}
              onPress={handleSelfCharge}
              disabled={selfCharging}
              activeOpacity={0.85}
            >
              {selfCharging
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.selfChargeBtnText}>⚡ {t.inv_charge_my_car}</Text>
              }
            </TouchableOpacity>
          )}

          {isVerified && (
            <Text style={s.heroTip}>{t.inv_online_tip}</Text>
          )}
        </View>

        {/* ── Setup progress (only when not fully configured) ── */}
        {!setupDone && (
          <View style={s.setupCard}>
            <Text style={s.setupCardTitle}>Setup Progress</Text>
            <SetupStep num={1} title={t.inv_setup_step1_title} sub={t.inv_setup_step1_sub} done compact />
            <SetupStep num={2} title={t.inv_setup_step2_title} sub={t.inv_setup_step2_sub}
              done={hasDevice} active={!hasDevice} compact
              cta={!hasDevice ? t.inv_setup_step2_cta : undefined}
              onCta={() => openEdit(true)}
            />
            <SetupStep num={3} title={t.inv_setup_step3_title} sub={t.inv_setup_step3_sub}
              done={isVerified} active={hasDevice && !isVerified} compact
            />
            <SetupStep num={4} title={t.inv_setup_step4_title} sub={t.inv_setup_step4_sub}
              active={setupDone && !isOnline} compact
            />
          </View>
        )}

        {/* ── This-month stats ── */}
        <View style={s.statsRow}>
          <StatCard value={earnMonth.toFixed(3)} label={t.inv_earn_month} color={COLORS.gold} emoji="💰" />
          <StatCard value={String(sessMonth)} label={t.inv_sessions_month} color={COLORS.primary} emoji="⚡" />
          <StatCard
            value={listing.rating > 0 ? listing.rating.toFixed(1) : '—'}
            label={t.host_rating_label} color="#F59E0B" emoji="⭐"
          />
        </View>

        {/* ── Charger info ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t.host_charger_info}</Text>
          <InfoRow icon="⚡" label={t.host_charger_type}  value={listing.charger_type} />
          <InfoRow icon="🔋" label={t.host_charger_power} value={`${listing.power_kw} kW`} />
          <InfoRow icon="💰" label={t.host_charger_price} value={`${listing.price_per_kwh} OMR/kWh`} />
          <InfoRow icon="🕐" label={t.host_charger_hours}
            value={`${listing.availability_start ?? '08:00'} – ${listing.availability_end ?? '22:00'}`} />
          {listing.description ? (
            <InfoRow icon="📝" label={t.inv_charger_desc} value={listing.description} last />
          ) : null}
        </View>

        {/* ── Device section ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t.inv_device_section}</Text>
          <InfoRow icon="🔌" label={t.tuya_device_id_label}
            value={listing.tuya_device_id ? `••••${listing.tuya_device_id.slice(-6)}` : '—'} />
          <InfoRow icon={isVerified ? '✅' : '⏳'} label={t.tuya_status_label}
            value={!hasDevice ? t.inv_device_not_linked : isVerified ? t.inv_device_verified : t.inv_device_pending}
            last
            valueColor={isVerified ? COLORS.success : hasDevice ? COLORS.gold : COLORS.error}
          />
          {!hasDevice && (
            <TouchableOpacity style={s.addDeviceBtn} onPress={() => openEdit(true)} activeOpacity={0.85}>
              <Text style={s.addDeviceBtnText}>+ {t.inv_setup_step2_cta}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Customer Bookings ── */}
        <BookingsSection bookings={bookings} t={t} />

      </ScrollView>

      {/* ── Edit Modal ── */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setEditModal(false)} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t.inv_charger_edit_modal}</Text>
              <TouchableOpacity onPress={() => setEditModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <XIcon size={20} color={COLORS.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <EditField label={t.inv_charger_address} required>
                <TextInput style={s.input} value={editAddress} onChangeText={setEditAddress}
                  placeholder={t.inv_charger_address_ph} placeholderTextColor={COLORS.textTertiary} returnKeyType="next" />
              </EditField>

              <EditField label={t.host_charger_power}>
                <TextInput style={s.input} value={editPowerKw} onChangeText={setEditPowerKw}
                  placeholder={t.inv_charger_power_ph} placeholderTextColor={COLORS.textTertiary}
                  keyboardType="decimal-pad" returnKeyType="next" />
              </EditField>

              {/* Price is read-only — set centrally by Go Watt admin */}
              <EditField label={t.host_charger_price}>
                <View style={[s.input, { justifyContent: 'center' }]}>
                  <Text style={{ color: COLORS.text, fontSize: 15 }}>
                    {listing?.price_per_kwh} OMR/kWh
                  </Text>
                  <Text style={{ color: COLORS.textTertiary, fontSize: 11, marginTop: 2 }}>
                    {t.inv_price_admin_note}
                  </Text>
                </View>
              </EditField>

              <View style={s.timeRow}>
                <View style={[s.field, { flex: 1 }]}>
                  <Text style={s.fieldLabel}>{t.inv_charger_avail_start}</Text>
                  <TextInput style={s.input} value={editStart} onChangeText={setEditStart}
                    placeholder="08:00" placeholderTextColor={COLORS.textTertiary} returnKeyType="next" />
                </View>
                <View style={[s.field, { flex: 1 }]}>
                  <Text style={s.fieldLabel}>{t.inv_charger_avail_end}</Text>
                  <TextInput style={s.input} value={editEnd} onChangeText={setEditEnd}
                    placeholder="22:00" placeholderTextColor={COLORS.textTertiary} returnKeyType="next" />
                </View>
              </View>

              <EditField label={t.inv_charger_desc}>
                <TextInput style={[s.input, { minHeight: 60 }]} value={editDesc} onChangeText={setEditDesc}
                  placeholder={t.inv_charger_desc_ph} placeholderTextColor={COLORS.textTertiary}
                  multiline textAlignVertical="top" returnKeyType="next" />
              </EditField>

              {/* Tuya device — highlighted section */}
              <View style={s.deviceSection}>
                <Text style={s.deviceSectionTitle}>🔌 {t.inv_device_section}</Text>
                <Text style={s.deviceSectionSub}>
                  {listing?.tuya_verified
                    ? `✅ ${t.inv_device_verified}`
                    : listing?.tuya_device_id
                      ? `⏳ ${t.inv_device_pending}`
                      : `⚠ ${t.inv_device_not_linked}`}
                </Text>

                {listing?.tuya_verified ? (
                  // Verified & accepted by admin → device id is LOCKED. Only the
                  // admin can re-assign it (also enforced server-side).
                  <>
                    <View style={[s.input, s.deviceInput, s.deviceLocked]}>
                      <Text style={s.deviceLockedText}>
                        🔒 ••••{(listing.tuya_device_id ?? '').slice(-6)}
                      </Text>
                    </View>
                    <Text style={s.deviceHintText}>{t.inv_device_locked_note}</Text>
                  </>
                ) : (
                  <>
                    <TextInput
                      ref={deviceRef}
                      style={[s.input, s.deviceInput]}
                      value={editDeviceId}
                      onChangeText={setEditDeviceId}
                      placeholder={t.tuya_device_id_ph}
                      placeholderTextColor={COLORS.textTertiary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                    />
                    <Text style={s.deviceHintText}>
                      Find your device ID in the Tuya / Smart Life app under Device Info.
                    </Text>
                  </>
                )}
              </View>

              <TouchableOpacity
                style={[s.saveBtn, saving && s.saveBtnOff]}
                onPress={handleSave} disabled={saving} activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.saveBtnText}>{t.inv_charger_save}</Text>}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── BookingsSection ────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  active:    { label: 'Active',    bg: '#dcfce7', text: '#16a34a' },
  confirmed: { label: 'Confirmed', bg: '#dbeafe', text: '#2563eb' },
  pending:   { label: 'Pending',   bg: '#fef9c3', text: '#ca8a04' },
  completed: { label: 'Done',      bg: '#f0fdf4', text: '#15803d' },
  cancelled: { label: 'Cancelled', bg: '#fee2e2', text: '#dc2626' },
  no_show:   { label: 'No Show',   bg: '#f3f4f6', text: '#6b7280' },
};

function BookingCard({ b, last }: { b: any; last: boolean }) {
  const cfg = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending;
  const customer = (b as any).customer;
  const date = new Date(b.booked_at);
  const dateStr = date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={[bs.row, last && { borderBottomWidth: 0 }]}>
      <View style={bs.iconWrap}>
        <CalendarIcon size={15} color={COLORS.primary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={bs.customer} numberOfLines={1}>
          {customer?.full_name ?? '—'}
        </Text>
        <Text style={bs.meta}>
          {dateStr} · {timeStr} · {b.duration_minutes} min
        </Text>
        <Text style={bs.cost}>
          {b.estimated_cost?.toFixed(3) ?? '—'} OMR
        </Text>
      </View>
      <View style={[bs.badge, { backgroundColor: cfg.bg }]}>
        <Text style={[bs.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
      </View>
    </View>
  );
}

function BookingsSection({ bookings, t }: { bookings: Booking[]; t: any }) {
  const active   = bookings.filter(b => b.status === 'active');
  const upcoming = bookings.filter(b => b.status === 'confirmed' || b.status === 'pending');
  const past     = bookings.filter(b => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show');

  if (bookings.length === 0) {
    return (
      <View style={s.card}>
        <Text style={s.cardTitle}>{t.inv_charger_recent_bookings}</Text>
        <View style={s.emptyBookings}>
          <CalendarIcon size={28} color={COLORS.textTertiary} strokeWidth={1.5} />
          <Text style={s.emptyBookingsTitle}>{t.inv_charger_no_bookings}</Text>
          <Text style={s.emptyBookingsSub}>{t.inv_charger_no_bookings_sub}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{t.inv_charger_recent_bookings} ({bookings.length})</Text>

      {active.length > 0 && (
        <>
          <View style={bs.groupHeader}>
            <View style={bs.activeDot} />
            <Text style={[bs.groupLabel, { color: '#16a34a' }]}>{t.inv_charger_active_now}</Text>
          </View>
          {active.map((b, i) => <BookingCard key={b.id} b={b} last={i === active.length - 1 && upcoming.length === 0 && past.length === 0} />)}
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <View style={bs.groupHeader}>
            <Text style={[bs.groupLabel, { color: COLORS.primary }]}>{t.inv_charger_upcoming} ({upcoming.length})</Text>
          </View>
          {upcoming.map((b, i) => <BookingCard key={b.id} b={b} last={i === upcoming.length - 1 && past.length === 0} />)}
        </>
      )}

      {past.length > 0 && (
        <>
          <View style={bs.groupHeader}>
            <Text style={[bs.groupLabel, { color: COLORS.textSecondary }]}>{t.inv_charger_past} ({past.length})</Text>
          </View>
          {past.map((b, i) => <BookingCard key={b.id} b={b} last={i === past.length - 1} />)}
        </>
      )}
    </View>
  );
}

const bs = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  customer:  { fontSize: 13, fontWeight: '700', color: COLORS.text },
  meta:      { fontSize: 11, color: COLORS.textSecondary },
  cost:      { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 12, paddingBottom: 4,
  },
  groupLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16a34a' },
});

// ── Sub-components ─────────────────────────────────────────────

function SetupStep({ num, title, sub, done, active, cta, onCta, compact }: {
  num: number; title: string; sub: string;
  done?: boolean; active?: boolean; cta?: string; onCta?: () => void; compact?: boolean;
}) {
  return (
    <View style={[ss.row, compact && ss.rowCompact]}>
      <View style={[ss.circle,
        done   && ss.circleDone,
        active && ss.circleActive,
      ]}>
        {done
          ? <CheckIcon size={14} color="#fff" strokeWidth={3} />
          : <Text style={[ss.num, (done || active) && ss.numActive]}>{num}</Text>
        }
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[ss.title, done && ss.titleDone, active && ss.titleActive]}>{title}</Text>
        <Text style={ss.sub}>{sub}</Text>
        {cta && onCta && (
          <TouchableOpacity onPress={onCta} style={ss.ctaBtn} activeOpacity={0.8}>
            <Text style={ss.ctaBtnText}>{cta} →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowCompact: { paddingVertical: 10 },
  circle:     { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.backgroundAlt, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  circleDone: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  circleActive:{ backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  num:        { fontSize: 13, fontWeight: '700', color: COLORS.textTertiary },
  numActive:  { color: COLORS.primary },
  title:      { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
  titleDone:  { color: COLORS.text },
  titleActive:{ color: COLORS.primary },
  sub:        { fontSize: 12, color: COLORS.textTertiary, lineHeight: 17 },
  ctaBtn:     { marginTop: 6, alignSelf: 'flex-start', backgroundColor: COLORS.primaryBg, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primaryTint },
  ctaBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
});

function StatCard({ value, label, color, emoji }: { value: string; label: string; color: string; emoji: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statEmoji}>{emoji}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, last, valueColor }: {
  icon: string; label: string; value: string; last?: boolean; valueColor?: string;
}) {
  return (
    <View style={[s.infoRow, last && s.infoRowLast]}>
      <Text style={s.infoIcon}>{icon}</Text>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor ? { color: valueColor } : null]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function EditField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}{required ? ' *' : ''}</Text>
      {children}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Welcome screen ──
  welcomeHero: {
    backgroundColor: COLORS.primaryDark, alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 24 : 16,
    paddingBottom: 32, paddingHorizontal: 24,
    gap: 10, overflow: 'hidden',
  },
  welcomeIconWrap: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.35)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  welcomeTitle: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center' },
  welcomeSub:   { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 21 },

  cta:    { backgroundColor: COLORS.primary, borderRadius: 18, paddingVertical: 16, alignItems: 'center', shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 5, marginTop: 4 },
  ctaOff: { opacity: 0.55 },
  ctaText:{ color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Hero card ──
  hero: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 12,
    borderRadius: 24, padding: 20, overflow: 'hidden',
    borderWidth: 1,
  },
  heroOn:  { backgroundColor: COLORS.primaryDark, borderColor: '#065f46' },
  heroOff: { backgroundColor: '#1f2937', borderColor: '#374151' },
  heroDeco1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.04)', top: -60, right: -40 },
  heroDeco2: { position: 'absolute', width: 130, height: 130, borderRadius: 65,  backgroundColor: 'rgba(255,255,255,0.03)', bottom: -40, left: -30 },

  heroTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  statusDot:     { width: 10, height: 10, borderRadius: 5 },
  heroStatus:    { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroChargerName:{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 4 },
  heroAddress:   { fontSize: 12, color: 'rgba(255,255,255,0.5)', maxWidth: 220 },
  toggleWrap:    { minWidth: 60, alignItems: 'center', justifyContent: 'center' },

  heroEarnRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14, marginBottom: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)',
  },
  heroEarnLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  heroEarnValue: { fontSize: 20, color: '#fff', fontWeight: '800' },

  selfChargeBtn: {
    marginTop: 14,
    backgroundColor: COLORS.gold,
    borderRadius: 16, paddingVertical: 14,
    alignItems: 'center',
    shadowColor: COLORS.gold, shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 5,
  },
  selfChargeBtnOff: { opacity: 0.55 },
  selfChargeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  deviceBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  deviceBadge:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  deviceBadgeWarn:  { backgroundColor: 'rgba(239,68,68,0.2)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  deviceBadgeAmber: { backgroundColor: 'rgba(245,158,11,0.2)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  deviceBadgeGreen: { backgroundColor: 'rgba(16,185,129,0.2)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  deviceBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  editBadge:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  editBadgeText:{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  heroTip:      { marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' },

  // ── Setup progress card ──
  setupCard:      { backgroundColor: COLORS.card, borderRadius: 20, marginHorizontal: 16, marginBottom: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  setupCardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 },

  // ── Stats ──
  statsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 18, padding: 14, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: COLORS.border },
  statEmoji:{ fontSize: 20, marginBottom: 2 },
  statValue:{ fontSize: 15, fontWeight: '800', textAlign: 'center' },
  statLabel:{ fontSize: 10, color: COLORS.textSecondary, textAlign: 'center' },

  // ── Card ──
  card:      { backgroundColor: COLORS.card, borderRadius: 20, marginHorizontal: 16, marginBottom: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 12 },

  // ── Info rows ──
  infoRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  infoRowLast: { borderBottomWidth: 0 },
  infoIcon:    { fontSize: 16, width: 24 },
  infoLabel:   { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  infoValue:   { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', flex: 1.3 },

  addDeviceBtn:    { marginTop: 12, backgroundColor: COLORS.primaryBg, borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: COLORS.primaryTint },
  addDeviceBtnText:{ fontSize: 14, fontWeight: '700', color: COLORS.primary },

  // ── Bookings ──
  emptyBookings:     { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyBookingsTitle:{ fontSize: 14, fontWeight: '700', color: COLORS.text },
  emptyBookingsSub:  { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  bookingRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  bookingIcon:  { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  bookingDate:  { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  bookingMeta:  { fontSize: 11, color: COLORS.textSecondary },
  bookingBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: COLORS.backgroundAlt },
  badgeDone:    { backgroundColor: COLORS.successBg },
  badgePending: { backgroundColor: COLORS.goldBg },
  bookingBadgeText: { fontSize: 10, fontWeight: '700' },

  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay },
  modalSheet:   {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 24, paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    maxHeight: '90%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:  { fontSize: 20, fontWeight: '800', color: COLORS.text },

  field:      { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:      { fontSize: 15, color: COLORS.text, paddingVertical: Platform.OS === 'ios' ? 4 : 2 },
  timeRow:    { flexDirection: 'row', gap: 16 },

  // Tuya device section in modal
  deviceSection: {
    marginTop: 16, padding: 16, backgroundColor: COLORS.primaryBg,
    borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.primaryTint, gap: 8,
  },
  deviceSectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  deviceSectionSub:   { fontSize: 12, color: COLORS.textSecondary },
  deviceInput:        {
    borderBottomWidth: 1, borderBottomColor: COLORS.primaryTint,
    paddingVertical: 8, fontSize: 15,
  },
  deviceHintText: { fontSize: 11, color: COLORS.textTertiary, lineHeight: 16 },
  deviceLocked:     { justifyContent: 'center', backgroundColor: COLORS.backgroundAlt, borderRadius: 10, paddingHorizontal: 12 },
  deviceLockedText: { fontSize: 15, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1 },

  saveBtn:    { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 20, shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4 },
  saveBtnOff: { opacity: 0.55 },
  saveBtnText:{ color: '#fff', fontWeight: '700', fontSize: 16 },
});
