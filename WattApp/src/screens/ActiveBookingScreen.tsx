import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { Booking, MainStackParamList } from '../types';
import { api, ApiError } from '../lib/api';
import { realtime } from '../lib/realtime';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { stationDisplayName } from '../i18n/govMap';
import { COLORS } from '../constants/colors';
import GradientButton from '../components/GradientButton';
import {
  ArrowLeftIcon, ZapIcon, CalendarIcon, ClockIcon,
  BatteryChargingIcon, WalletIcon, MapPinIcon,
} from '../components/icons';

type Nav   = NativeStackNavigationProp<MainStackParamList, 'ActiveBooking'>;
type Route = RouteProp<MainStackParamList, 'ActiveBooking'>;

// The start RPC raises "INSUFFICIENT_BALANCE|required=..|available=..|shortfall=.."
// when the wallet can't cover the hold. Returns the shortfall in OMR, or null
// if this wasn't an insufficient-balance error.
function parseInsufficient(message?: string): number | null {
  if (!message || !message.includes('INSUFFICIENT_BALANCE')) return null;
  const m = message.match(/shortfall=([0-9.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

export default function ActiveBookingScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { bookingId } = route.params;
  const { profile } = useAuth();
  const { t, isRTL } = useLang();
  const locale = isRTL ? 'ar-OM' : 'en-GB';

  const [booking,       setBooking]       = useState<Booking | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [startLoading,  setStartLoading]  = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [now,           setNow]           = useState(Date.now());

  // Tick every second so the countdown and button state stay live
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch booking + real-time updates
  useEffect(() => {
    fetchBooking();
    const off = realtime.onTable('bookings', (row) => {
      if (row?.id === bookingId) setBooking(prev => prev ? { ...prev, ...row } : prev);
    });
    return off;
  }, [bookingId]);


  const fetchBooking = async () => {
    try {
      const data = await api.bookings.get(bookingId);
      if (data) setBooking(data as Booking);
    } catch { /* keep null */ }
    finally { setLoading(false); }
  };

  const handleStartCharging = async () => {
    if (!booking || !profile) return;

    // Client-side time guard — prevents calling the edge function too early
    const bookedAt = new Date(booking.booked_at).getTime();
    const bookingEnd = bookedAt + booking.duration_minutes * 60_000;
    if (now < bookedAt) {
      const secsLeft = Math.ceil((bookedAt - now) / 1000);
      const minsLeft = Math.ceil(secsLeft / 60);
      Alert.alert(
        t.active_time_expired,
        isRTL
          ? `الحجز يبدأ بعد ${minsLeft} دقيقة`
          : `Booking starts in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}`,
      );
      return;
    }
    if (now > bookingEnd) {
      Alert.alert(t.error, isRTL ? 'انتهت نافذة الحجز' : 'Booking window has expired');
      return;
    }

    setStartLoading(true);
    try {
      // 1) Reserve the money FIRST. The server verifies the wallet has enough,
      //    places a hold for the estimated cost, and creates the session — all
      //    atomically. Nothing is powered on until the money is secured, so a
      //    customer can never charge without paying.
      let startRes: any;
      try {
        startRes = await api.sessions.start(booking.id);
      } catch (startErr: any) {
        const short = parseInsufficient(startErr instanceof ApiError ? startErr.message : startErr?.message);
        if (startErr instanceof ApiError && startErr.code === 'insufficient_balance' || short != null) {
          Alert.alert(
            t.charging_insufficient_title,
            `${t.charging_insufficient_msg} ${(short ?? 0).toFixed(3)} OMR`,
            [
              { text: t.cancel, style: 'cancel' },
              { text: t.booking_top_up, onPress: () => navigation.navigate('Tabs') },
            ],
          );
          return;
        }
        throw startErr;
      }
      const sessionId = startRes.session_id as string;

      // 2) Power on the Tuya switch for private chargers. If it fails, release
      //    the hold by finishing the just-started session at zero cost.
      if (booking.listing_id) {
        try {
          await api.devices.switch({ booking_id: booking.id, action: 'on' });
        } catch (switchErr: any) {
          try {
            await api.sessions.complete(sessionId, { kwh: 0, battery_end: null, description: 'Cancelled — charger did not start' });
          } catch { /* hold auto-repairs; surfacing the switch error matters more */ }
          Alert.alert(t.active_charger_err_title, switchErr?.message ?? 'Charger did not start');
          return;
        }
      }

      const listingData = (booking as any).listing;
      const displayName = booking.station?.name
        || listingData?.station_name
        || listingData?.address
        || 'Private Charger';

      navigation.replace('Charging', {
        sessionId,
        stationName: displayName,
      });
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setStartLoading(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      t.active_cancel_title,
      t.active_cancel_msg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.active_cancel_btn,
          style: 'destructive',
          onPress: async () => {
            setCancelLoading(true);
            try { await api.bookings.cancel(bookingId, 'user_cancelled'); } catch { /* ignore */ }
            setCancelLoading(false);
            navigation.goBack();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!booking) return null;

  const bookedAt   = new Date(booking.booked_at);
  const dateStr    = bookedAt.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr    = bookedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const refCode    = booking.qr_code.slice(0, 8).toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t.a11y_back}>
          <ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.active_header}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Confirmation hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <ZapIcon size={36} color={COLORS.primary} strokeWidth={2.5} />
          </View>
          <Text style={styles.heroTitle}>{t.active_confirmed}</Text>
          <Text style={styles.heroSub}>{t.active_confirmed_sub}</Text>
          <View style={styles.refBadge}>
            <Text style={styles.refLabel}>Ref #</Text>
            <Text style={styles.refCode}>{refCode}</Text>
          </View>
        </View>

        {/* ── Booking details ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.active_details_title}</Text>

          <InfoRow
            Icon={MapPinIcon}
            iconColor="#7c3aed" iconBg="#f5f3ff"
            label={t.active_station}
            value={booking.station ? stationDisplayName(booking.station, isRTL) : '—'}
          />
          <InfoRow
            Icon={CalendarIcon}
            iconColor="#2563eb" iconBg="#eff6ff"
            label={t.active_date}
            value={dateStr}
          />
          <InfoRow
            Icon={ClockIcon}
            iconColor="#0891b2" iconBg="#ecfeff"
            label={t.active_time}
            value={timeStr}
          />
          <InfoRow
            Icon={BatteryChargingIcon}
            iconColor={COLORS.primary} iconBg={COLORS.primaryBg}
            label={t.active_kwh}
            value={`~${booking.estimated_kwh?.toFixed(1) || '—'} kWh`}
          />

          <View style={styles.divider} />

          <View style={styles.costRow}>
            <View style={[styles.costIcon, { backgroundColor: '#fefce8' }]}>
              <WalletIcon size={16} color="#ca8a04" strokeWidth={2} />
            </View>
            <Text style={styles.costLabel}>{t.active_cost}</Text>
            <Text style={styles.costValue}>
              {booking.estimated_cost?.toFixed(3) || '—'} OMR
            </Text>
          </View>
        </View>


      </ScrollView>

      {/* ── Footer buttons ── */}
      <View style={styles.footer}>
        {/* Countdown badge — visible before booking time */}
        {booking && now < new Date(booking.booked_at).getTime() && (() => {
          const secsLeft = Math.max(0, Math.ceil((new Date(booking.booked_at).getTime() - now) / 1000));
          const h = Math.floor(secsLeft / 3600);
          const m = Math.floor((secsLeft % 3600) / 60);
          const s = secsLeft % 60;
          const label = h > 0
            ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
            : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
          return (
            <View style={styles.countdownBadge}>
              <ClockIcon size={14} color={COLORS.gold} strokeWidth={2} />
              <Text style={styles.countdownText}>
                {isRTL ? `يبدأ الحجز خلال  ${label}` : `Booking starts in  ${label}`}
              </Text>
            </View>
          );
        })()}

        <GradientButton
          label={t.active_start_btn}
          onPress={handleStartCharging}
          loading={startLoading}
          disabled={!!booking && now < new Date(booking.booked_at).getTime()}
          icon={<ZapIcon size={20} color="#fff" strokeWidth={2.5} />}
        />

        <TouchableOpacity
          style={[styles.cancelBtn, cancelLoading && styles.btnDisabled]}
          onPress={handleCancel}
          disabled={cancelLoading}
          activeOpacity={0.75}
        >
          <Text style={styles.cancelBtnText}>{t.active_cancel_btn}</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function InfoRow({
  Icon, iconColor, iconBg, label, value,
}: { Icon: any; iconColor: string; iconBg: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: iconBg }]}>
        <Icon size={15} color={iconColor} strokeWidth={2} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.text },

  scroll: { padding: 16, gap: 14, paddingBottom: 32 },

  // Hero
  hero: {
    backgroundColor: COLORS.primaryBg,
    borderRadius: 24, padding: 28,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: COLORS.primaryTint,
  },
  heroIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.primaryTint, marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  heroSub:   { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  refBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4, borderWidth: 1, borderColor: COLORS.border },
  refLabel:  { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  refCode:   { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: 1.5 },

  // Details card
  card: {
    backgroundColor: COLORS.card, borderRadius: 22,
    padding: 18, gap: 14,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7 },
  infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, maxWidth: '55%', textAlign: 'right' },
  divider:   { height: 1, backgroundColor: COLORS.border },
  costRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  costIcon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  costLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  costValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary },

  // Footer
  footer: {
    padding: 16, paddingBottom: 32, gap: 10,
    backgroundColor: COLORS.card,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  countdownBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.goldBg, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: COLORS.goldTint, marginBottom: 4,
  },
  countdownText: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark, fontVariant: ['tabular-nums'] as any },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.primary, borderRadius: 18, paddingVertical: 17,
    shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 5,
  },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  cancelBtn:    { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText:{ fontSize: 14, color: COLORS.error, fontWeight: '600' },
  btnDisabled:  { opacity: 0.5 },
});
