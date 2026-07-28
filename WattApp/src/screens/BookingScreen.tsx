import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../types';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { isCarProfileComplete } from '../lib/profileComplete';
import { translateGov, stationDisplayName } from '../i18n/govMap';
import { COLORS } from '../constants/colors';
import { ZapIcon, ArrowLeftIcon, MapPinIcon, CheckIcon, ClockIcon } from '../components/icons';
import GradientButton from '../components/GradientButton';

type Nav   = NativeStackNavigationProp<MainStackParamList, 'Booking'>;
type Route = RouteProp<MainStackParamList, 'Booking'>;

// ── Step wizard: one decision per screen ──────────────────────
//   1 Day  →  2 Start time  →  3 Duration (Full charge | h:m)  →  4 Confirm
// Fewer things on screen at once = less thinking, faster booking.

const MIN_DUR = 15;                     // shortest bookable duration (minutes)
const FULL_CHARGE_CAP_MIN = 8 * 60;     // Full charge reserves at most 8 h

type Step = 0 | 1 | 2 | 3;

function fmtTime(minOfDay: number) {
  const h24 = Math.floor(minOfDay / 60), m = minOfDay % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  let h = h24 % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${period}`;
}
function fmtDur(mins: number, hAbbr: string, mAbbr: string) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h > 0 && m > 0) return `${h}${hAbbr} ${m}${mAbbr}`;
  if (h > 0) return `${h}${hAbbr}`;
  return `${m}${mAbbr}`;
}

// Convert a 12-hour clock selection to minutes-from-midnight.
function to24Min(hour12: number, period: 'AM' | 'PM', minute: number): number {
  let h = hour12;
  if (period === 'AM' && hour12 === 12) h = 0;
  if (period === 'PM' && hour12 !== 12) h = hour12 + 12;
  return h * 60 + minute;
}

const HOURS   = Array.from({ length: 12 }, (_, i) => i + 1);            // 1…12
const MINUTES = Array.from({ length: 60 }, (_, i) => i);               // 0…59 (any minute)
const PERIODS = ['AM', 'PM'] as const;

// ── Scroll-wheel (drum) picker ────────────────────────────────
// A single spinnable column; snaps to the nearest row. Reused for
// hour / minute / AM-PM. nestedScrollEnabled lets each column scroll
// independently inside the outer ScrollView on Android.
const DRUM_ITEM_H = 44;
const DRUM_VISIBLE = 3;
const DRUM_PAD = DRUM_ITEM_H * Math.floor(DRUM_VISIBLE / 2);

function DrumColumn<T extends string | number>({
  items, selected, onSelect, width, format,
}: {
  items: readonly T[]; selected: T; onSelect: (v: T) => void; width: number; format?: (v: T) => string;
}) {
  const svRef = React.useRef<ScrollView>(null);
  const dragTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const idx = items.findIndex(it => String(it) === String(selected));
    if (idx < 0) return;
    const tm = setTimeout(() => svRef.current?.scrollTo({ y: idx * DRUM_ITEM_H, animated: false }), 100);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapTo = (offsetY: number) => {
    const idx = Math.max(0, Math.min(Math.round(offsetY / DRUM_ITEM_H), items.length - 1));
    onSelect(items[idx]);
    svRef.current?.scrollTo({ y: idx * DRUM_ITEM_H, animated: false });
  };

  return (
    <View style={{ width, height: DRUM_VISIBLE * DRUM_ITEM_H }}>
      <View style={[drum.highlight, { top: DRUM_PAD }]} pointerEvents="none" />
      <ScrollView
        ref={svRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={DRUM_ITEM_H}
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: DRUM_PAD }}
        onMomentumScrollBegin={() => { if (dragTimeout.current) clearTimeout(dragTimeout.current); }}
        onMomentumScrollEnd={e => snapTo(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={e => {
          const y = e.nativeEvent.contentOffset.y;
          dragTimeout.current = setTimeout(() => snapTo(y), 80);
        }}
      >
        {items.map((item, i) => {
          const isSel = String(item) === String(selected);
          return (
            <TouchableOpacity
              key={String(item) + i}
              style={[drum.item, { height: DRUM_ITEM_H }]}
              onPress={() => { onSelect(item); svRef.current?.scrollTo({ y: i * DRUM_ITEM_H, animated: true }); }}
              activeOpacity={0.7}
            >
              <Text style={[drum.text, isSel && drum.textSel]}>{format ? format(item) : String(item)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Month calendar ────────────────────────────────────────────
// Whole-month grid; today ringed, past days disabled, selected day filled.
function MonthCalendar({
  month, selectedDate, today, onPrev, onNext, onSelect, monthNames, dayNames,
}: {
  month: Date; selectedDate: Date; today: Date;
  onPrev: () => void; onNext: () => void; onSelect: (d: Date) => void;
  monthNames: string[]; dayNames: string[];
}) {
  const y = month.getFullYear(), m = month.getMonth();
  const firstWeekday = new Date(y, m, 1).getDay();          // 0=Sun
  const daysInMonth  = new Date(y, m + 1, 0).getDate();
  const atCurrentMonth = y === today.getFullYear() && m === today.getMonth();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <View style={cal.card}>
      {/* Month header */}
      <View style={cal.header}>
        <TouchableOpacity onPress={onPrev} disabled={atCurrentMonth} style={cal.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[cal.navArrow, atCurrentMonth && cal.navDisabled]}>‹</Text>
        </TouchableOpacity>
        <Text style={cal.title}>{monthNames[m]} {y}</Text>
        <TouchableOpacity onPress={onNext} style={cal.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={cal.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday labels (first letter) */}
      <View style={cal.weekRow}>
        {dayNames.map((d, i) => (
          <Text key={i} style={cal.weekLabel}>{d.slice(0, 1)}</Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={cal.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={cal.cell} />;
          const isPast = d.getTime() < today.getTime();
          const isToday = sameDay(d, today);
          const isSel = sameDay(d, selectedDate);
          return (
            <TouchableOpacity
              key={i}
              style={cal.cell}
              disabled={isPast}
              onPress={() => onSelect(d)}
              activeOpacity={0.7}
            >
              <View style={[
                cal.dayCircle,
                isToday && !isSel && cal.dayToday,
                isSel && cal.daySelected,
              ]}>
                <Text style={[
                  cal.dayText,
                  isPast && cal.dayPast,
                  isToday && !isSel && cal.dayTodayText,
                  isSel && cal.daySelectedText,
                ]}>
                  {d.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function BookingScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { station, listingId } = route.params;
  const { profile } = useAuth();
  const { t, isRTL } = useLang();
  const insets = useSafeAreaInsets();

  const DAY_NAMES   = [t.day_0, t.day_1, t.day_2, t.day_3, t.day_4, t.day_5, t.day_6];
  const MONTH_NAMES = [t.month_0, t.month_1, t.month_2, t.month_3, t.month_4,
    t.month_5, t.month_6, t.month_7, t.month_8, t.month_9, t.month_10, t.month_11];

  const [step, setStep] = useState<Step>(0);

  // Gate: a customer must complete their car profile before booking. Send them
  // to the completion flow, which returns here once done.
  useEffect(() => {
    if (profile && !isCarProfileComplete(profile)) {
      navigation.replace('CompleteProfile', { station, listingId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Day is a real calendar date now (month view). Default: today.
  const startOfToday = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday);
  const [calMonth, setCalMonth] = useState<Date>(() => new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1));
  const [startNow,     setStartNow]     = useState(true);          // step 2: start immediately?
  // Start time is chosen with three spin wheels (hour / minute / AM-PM).
  const [pickHour,   setPickHour]   = useState(8);
  const [pickMinute, setPickMinute] = useState(0);
  const [pickPeriod, setPickPeriod] = useState<'AM' | 'PM'>('AM');
  const [durMode,      setDurMode]      = useState<'full' | 'set'>('set');
  const [durHours,     setDurHours]     = useState(1);
  const [durMinutes,   setDurMinutes]   = useState(0);

  const [bookedRanges,  setBookedRanges]  = useState<[number, number][]>([]);
  const [fetchingSlots, setFetchingSlots] = useState(false);
  const [loading,       setLoading]       = useState(false);

  // Live clock (updates once a minute) so "Now" and today's free slots stay honest.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const now    = new Date(nowTick);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  useEffect(() => { fetchBookedSlots(); }, [selectedDate]);

  const fetchBookedSlots = async () => {
    setFetchingSlots(true);
    const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
    try {
      const data: any = await api.stations.availability({
        from: startOfDay.toISOString(),
        to:   endOfDay.toISOString(),
        station_id: listingId ? undefined : station.id,
        listing_id: listingId ?? undefined,
      });
      setBookedRanges(
        ((data ?? []) as { booked_at: string; duration_minutes: number }[]).map(b => {
          const start = new Date(b.booked_at);
          const startMin = start.getHours() * 60 + start.getMinutes();
          return [startMin, startMin + b.duration_minutes] as [number, number];
        }),
      );
    } catch { setBookedRanges([]); }
    finally { setFetchingSlots(false); }
  };

  // ── Derived timing ──────────────────────────────────────────
  const isToday = selectedDate.getTime() === startOfToday.getTime();

  // Start minute the wheels point at (any minute, not fixed slots).
  const pickedSlot = to24Min(pickHour, pickPeriod, pickMinute);

  // The chosen start minute: "start now" uses the current minute; else the wheels.
  const startMin = startNow && isToday ? nowMin : pickedSlot;

  // Is the wheel-picked start actually bookable? (past, or lands inside a booking)
  const slotPast   = isToday && pickedSlot <= nowMin;
  const slotBooked = bookedRanges.some(([bs, be]) => pickedSlot >= bs && pickedSlot < be);
  const pickingTime = !startNow || !isToday;
  const slotUnavailable = pickingTime && (slotPast || slotBooked);

  // Size the free window from our start. If a booking is already in progress at
  // the start (straddles it), the window is 0 (busy now). Otherwise the window
  // runs until the next booking begins, or end of day.
  const maxWindowMin = useMemo(() => {
    if (startMin == null) return 0;
    const busyNow = bookedRanges.some(([bs, be]) => bs <= startMin && startMin < be);
    if (busyNow) return 0;
    const laterStarts = bookedRanges.map(([bs]) => bs).filter(bs => bs > startMin).sort((a, b) => a - b);
    const nextStart = laterStarts.length ? laterStarts[0] : 24 * 60;
    return Math.max(0, nextStart - startMin);
  }, [bookedRanges, startMin]);
  // Full-charge time estimate, by the charger's power (Oman charging brackets):
  //   DC fast 50kW+  → ~30–60 min       (full ≈ 1h)
  //   public 22kW    → 2–4 hours
  //   home fast 7–11 → 7–12 hours
  //   slow socket    → 12–24 hours
  // Actual time varies with the car's battery — shown as a range, reserved by
  // the upper bound (so the car has enough time), capped by the free window/8h.
  const fullEst = useMemo(() => {
    const p = station.power_kw;
    const batt = profile?.battery_kwh ?? 0;
    // Personalised: time ≈ battery ÷ power, +15% for the slow top-off.
    if (batt > 0 && p > 0) {
      const minutes = Math.max(30, Math.round((batt / p) * 1.15 * 60));
      return { maxMin: minutes, label: fmtDur(minutes, t.hour_abbr, t.min_abbr) };
    }
    // Fallback to Oman charger-power brackets when battery size is unknown.
    if (p >= 50) return { maxMin: 60,   label: t.booking_full_dc };
    if (p >= 22) return { maxMin: 240,  label: t.booking_full_public };
    if (p >= 7)  return { maxMin: 720,  label: t.booking_full_home };
    return              { maxMin: 1440, label: t.booking_full_slow };
  }, [station.power_kw, profile?.battery_kwh, t]);

  const desiredFull   = Math.min(fullEst.maxMin, FULL_CHARGE_CAP_MIN);
  const fullChargeMin = Math.min(desiredFull, maxWindowMin);

  const setDurationMin = durHours * 60 + durMinutes;
  const durationMin = durMode === 'full' ? fullChargeMin : setDurationMin;

  const estimatedKwh  = (durationMin / 60) * station.power_kw;
  const estimatedCost = estimatedKwh * station.price_per_kwh;

  // Default the wheels sensibly when the day changes: today → round up to the
  // next 15 min from now; future day → 8:00 AM.
  useEffect(() => {
    const base = isToday ? Math.min(23 * 60 + 45, Math.ceil((nowMin + 15) / 15) * 15) : 8 * 60;
    const h24 = Math.floor(base / 60);
    setPickHour(((h24 + 11) % 12) + 1);
    setPickMinute(base % 60);
    setPickPeriod(h24 < 12 ? 'AM' : 'PM');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const adjust = (setter: (fn: (v: number) => number) => void, delta: number, min: number, max: number) =>
    setter(v => Math.max(min, Math.min(max, v + delta)));

  const handleDirections = () => {
    const { latitude, longitude, name } = station;
    const url = Platform.OS === 'ios'
      ? `maps://app?daddr=${latitude},${longitude}&q=${encodeURIComponent(name)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
    Linking.openURL(url).catch(() => Alert.alert(t.error, 'Unable to open maps.'));
  };

  // ── Step navigation ─────────────────────────────────────────
  const canNext = (): boolean => {
    if (step === 0) return true;                                   // day always chosen
    if (step === 1) return (startNow && isToday) || !slotUnavailable;
    if (step === 2) return durationMin >= MIN_DUR;                 // full window big enough / set-time valid
    return true;
  };
  const next = () => { if (step < 3) setStep((step + 1) as Step); };
  const back = () => { if (step > 0) setStep((step - 1) as Step); else navigation.goBack(); };

  const handleBook = async () => {
    if (!profile || startMin == null) return;
    if (profile.wallet_balance < -0.5) {
      Alert.alert(t.booking_debt_title, `${t.booking_debt_msg} ${Math.abs(profile.wallet_balance).toFixed(3)} OMR`, [
        { text: t.cancel, style: 'cancel' },
        { text: t.booking_top_up, onPress: () => navigation.navigate('Tabs') },
      ]);
      return;
    }
    if (durationMin < MIN_DUR) { Alert.alert(t.warning, t.booking_no_window); return; }
    setLoading(true);
    try {
      const bookedAt = new Date(selectedDate);
      bookedAt.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
      // Freshness: if "start now" and time slid past, re-anchor to current minute.
      if (startNow && isToday) bookedAt.setTime(Date.now());

      // The backend sends the host a push automatically on create.
      const data: any = await api.bookings.create({
        station_id:       listingId ? null : station.id,
        listing_id:       listingId ?? null,
        booked_at:        bookedAt.toISOString(),
        duration_minutes: durationMin,
        estimated_kwh:    estimatedKwh,
        estimated_cost:   estimatedCost,
      });
      navigation.replace('ActiveBooking', { bookingId: data.id });
    } catch (e: any) {
      // Someone booked this exact slot first — the DB overlap guard rejected it
      // (backend maps it to a 409 conflict).
      const isOverlap = (e instanceof ApiError && e.code === 'conflict') ||
        /bookings_no_overlap|exclusion|just taken/i.test(e?.message ?? '');
      if (isOverlap) {
        await fetchBookedSlots();
        Alert.alert(t.warning, t.booking_slot_taken);
        setStep(1);
      } else {
        Alert.alert(t.booking_error, e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const align = { textAlign: (isRTL ? 'right' : 'left') as 'left' | 'right' };
  const stepTitles = [t.booking_step_day, t.booking_step_start, t.booking_step_duration, t.booking_step_confirm];

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header + progress */}
      <View style={s.header}>
        <TouchableOpacity onPress={back} style={s.backBtn} accessibilityRole="button" accessibilityLabel={t.a11y_back}>
          <ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{stepTitles[step]}</Text>
        <Text style={s.stepCount}>{step + 1}/4</Text>
      </View>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${((step + 1) / 4) * 100}%` }]} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 130 + insets.bottom }}>

        {/* Station mini-card for context — hidden on the time step (2) */}
        {step !== 1 && (
          <View style={s.stationCard}>
            <View style={s.stationIconWrap}><ZapIcon size={20} color={COLORS.primary} strokeWidth={2.5} /></View>
            <View style={s.stationInfo}>
              <Text style={s.stationName} numberOfLines={1}>{stationDisplayName(station, isRTL)}</Text>
              <Text style={s.stationSub}>{translateGov(station.governorate, isRTL)} · {station.price_per_kwh.toFixed(3)} OMR/kWh</Text>
            </View>
            <TouchableOpacity style={s.directionsBtn} onPress={handleDirections} activeOpacity={0.8}>
              <MapPinIcon size={14} color={COLORS.primary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 1 — DAY (month calendar) ── */}
        {step === 0 && (
          <MonthCalendar
            month={calMonth}
            selectedDate={selectedDate}
            today={startOfToday}
            onPrev={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            onNext={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            onSelect={setSelectedDate}
            monthNames={MONTH_NAMES}
            dayNames={DAY_NAMES}
          />
        )}

        {/* ── STEP 2 — START ── */}
        {step === 1 && (
          <>
            {isToday && (
              <TouchableOpacity
                style={[s.bigOption, startNow && s.cardActive]}
                onPress={() => setStartNow(true)}
                activeOpacity={0.85}
              >
                <View style={s.bigOptionRow}>
                  <ZapIcon size={20} color={startNow ? COLORS.primary : COLORS.textSecondary} strokeWidth={2.2} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.bigOptionTitle, startNow && s.activeText]}>{t.booking_start_now}</Text>
                    <Text style={s.bigOptionSub}>{t.booking_start_now_sub} · {fmtTime(nowMin)}</Text>
                  </View>
                  {startNow && <CheckIcon size={20} color={COLORS.primary} strokeWidth={2.5} />}
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.bigOption, (!startNow || !isToday) && s.cardActive]}
              onPress={() => setStartNow(false)}
              activeOpacity={0.85}
            >
              <View style={s.bigOptionRow}>
                <ClockIcon size={20} color={(!startNow || !isToday) ? COLORS.primary : COLORS.textSecondary} strokeWidth={2.2} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.bigOptionTitle, (!startNow || !isToday) && s.activeText]}>{t.booking_pick_time}</Text>
                  <Text style={s.bigOptionSub}>{t.booking_pick_time_sub}</Text>
                </View>
                {(!startNow || !isToday) && <CheckIcon size={20} color={COLORS.primary} strokeWidth={2.5} />}
              </View>
            </TouchableOpacity>

            {/* Scroll-wheel time picker (only when picking a specific time) */}
            {pickingTime && (
              <View style={s.pickerCard}>
                <View style={s.pickerRow}>
                  <DrumColumn items={HOURS} selected={pickHour} onSelect={setPickHour} width={70} format={v => String(v)} />
                  <Text style={s.pickerColon}>:</Text>
                  <DrumColumn items={MINUTES} selected={pickMinute} onSelect={setPickMinute} width={70} format={v => String(v).padStart(2, '0')} />
                  <DrumColumn items={PERIODS} selected={pickPeriod} onSelect={(v) => setPickPeriod(v as 'AM' | 'PM')} width={64} />
                </View>
                <View style={[s.pickedBanner, slotUnavailable && s.pickedBannerWarn]}>
                  <Text style={[s.pickedText, slotUnavailable && s.pickedTextWarn]}>
                    {slotUnavailable
                      ? (slotPast ? `⚠ ${t.booking_time_past}` : `⚠ ${t.booking_time_taken}`)
                      : `${t.booking_starts_at} ${fmtTime(pickedSlot)}`}
                  </Text>
                </View>
              </View>
            )}

            {/* Already-booked times for the chosen day — just the times */}
            {pickingTime && bookedRanges.length > 0 && (
              <View style={s.bookedBox}>
                <Text style={[s.bookedTitle, align]}>{t.booking_already_booked}</Text>
                <View style={s.bookedWrap}>
                  {[...bookedRanges].sort((a, b) => a[0] - b[0]).map(([bs, be], i) => (
                    <View key={i} style={s.bookedChip}>
                      <Text style={s.bookedChipText}>{fmtTime(bs)} – {fmtTime(be % (24 * 60))}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* ── STEP 3 — DURATION ── */}
        {step === 2 && (
          <>
            {/* Full charge */}
            <TouchableOpacity
              style={[s.bigOption, durMode === 'full' && s.cardActive, fullChargeMin < MIN_DUR && s.optionDisabled]}
              onPress={() => fullChargeMin >= MIN_DUR && setDurMode('full')}
              activeOpacity={0.85}
              disabled={fullChargeMin < MIN_DUR}
            >
              <View style={s.bigOptionRow}>
                <ZapIcon size={20} color={durMode === 'full' ? COLORS.primary : COLORS.textSecondary} strokeWidth={2.2} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.bigOptionTitle, durMode === 'full' && s.activeText]}>⚡ {t.booking_full_charge}</Text>
                  <Text style={s.bigOptionSub}>
                    {fullChargeMin < MIN_DUR
                      ? t.booking_no_window
                      : `${t.booking_full_est} ${fullEst.label} · ${station.power_kw} kW`}
                  </Text>
                  {fullChargeMin >= MIN_DUR && (
                    <Text style={s.fullDepends}>{t.booking_full_depends}</Text>
                  )}
                </View>
                {durMode === 'full' && <CheckIcon size={20} color={COLORS.primary} strokeWidth={2.5} />}
              </View>
            </TouchableOpacity>

            {/* Set a time */}
            <TouchableOpacity
              style={[s.bigOption, durMode === 'set' && s.cardActive]}
              onPress={() => setDurMode('set')}
              activeOpacity={0.85}
            >
              <View style={s.bigOptionRow}>
                <ClockIcon size={20} color={durMode === 'set' ? COLORS.primary : COLORS.textSecondary} strokeWidth={2.2} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.bigOptionTitle, durMode === 'set' && s.activeText]}>⏱ {t.booking_set_time}</Text>
                  <Text style={s.bigOptionSub}>{t.booking_set_time_sub}</Text>
                </View>
                {durMode === 'set' && <CheckIcon size={20} color={COLORS.primary} strokeWidth={2.5} />}
              </View>
            </TouchableOpacity>

            {/* Hours + minutes steppers */}
            {durMode === 'set' && (
              <View style={s.hmRow}>
                <Stepper label={t.booking_hours} value={durHours}
                  onMinus={() => adjust(setDurHours, -1, 0, 12)} onPlus={() => adjust(setDurHours, 1, 0, 12)} />
                <Stepper label={t.booking_minutes} value={durMinutes} step={15} pad
                  onMinus={() => adjust(setDurMinutes, -15, 0, 45)} onPlus={() => adjust(setDurMinutes, 15, 0, 45)} />
              </View>
            )}
          </>
        )}

        {/* ── STEP 4 — CONFIRM ── */}
        {step === 3 && (
          <View style={s.confirmCard}>
            <Text style={[s.confirmTitle, align]}>{t.booking_summary}</Text>
            <ConfirmRow label={t.booking_choose_day} value={
              isToday ? t.booking_today
                : `${DAY_NAMES[selectedDate.getDay()]} ${selectedDate.getDate()} ${MONTH_NAMES[selectedDate.getMonth()].slice(0,3)}`
            } />
            <ConfirmRow label={t.booking_step_start} value={startMin == null ? '—' : fmtTime(startMin)} />

            {durMode === 'full' ? (
              // Full charge: no fixed cost — it stops automatically when full.
              <>
                <ConfirmRow label={t.booking_step_duration} value={`⚡ ${t.booking_full_charge}`} />
                <ConfirmRow label={t.booking_full_est} value={`${fullEst.label} · ${station.power_kw} kW`} />
                <View style={s.confirmDivider} />
                <View style={s.autoStopBox}>
                  <ZapIcon size={18} color={COLORS.primary} strokeWidth={2} />
                  <Text style={s.autoStopText}>{t.booking_full_auto_stop}</Text>
                </View>
              </>
            ) : (
              // Set duration: show the estimate + cost.
              <>
                <ConfirmRow label={t.booking_step_duration} value={fmtDur(durationMin, t.hour_abbr, t.min_abbr)} />
                <View style={s.confirmDivider} />
                <ConfirmRow label={t.booking_kwh}   value={`≈ ${estimatedKwh.toFixed(1)} kWh`} />
                <ConfirmRow label={t.booking_total} value={`${estimatedCost.toFixed(3)} OMR`} bold />
                {profile && (
                  <ConfirmRow label={t.booking_balance_after}
                    value={`${(profile.wallet_balance - estimatedCost).toFixed(3)} OMR`}
                    color={profile.wallet_balance >= estimatedCost ? COLORS.success : COLORS.error} />
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Sticky footer: Next / Confirm */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {step < 3 ? (
          <GradientButton label={t.booking_next} onPress={next} disabled={!canNext()} />
        ) : (
          <GradientButton
            label={durMode === 'full'
              ? t.booking_confirm_btn
              : `${t.booking_confirm_btn} · ${estimatedCost.toFixed(3)} OMR`}
            onPress={handleBook}
            loading={loading}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function Stepper({ label, value, onMinus, onPlus, step = 1, pad }: {
  label: string; value: number; onMinus: () => void; onPlus: () => void; step?: number; pad?: boolean;
}) {
  return (
    <View style={s.stepperCol}>
      <Text style={s.stepperLabel}>{label}</Text>
      <View style={s.stepperBox}>
        <TouchableOpacity style={s.stepBtn} onPress={onMinus} activeOpacity={0.7}>
          <Text style={s.stepBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={s.stepValue}>{pad ? String(value).padStart(2, '0') : value}</Text>
        <TouchableOpacity style={s.stepBtn} onPress={onPlus} activeOpacity={0.7}>
          <Text style={s.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ConfirmRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={s.confirmRow}>
      <Text style={[s.confirmLabel, bold && { fontWeight: '700', color: COLORS.text }]}>{label}</Text>
      <Text style={[s.confirmValue, bold && s.confirmValueBold, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.card,
  },
  backBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: COLORS.text },
  stepCount:   { width: 40, textAlign: 'right', fontSize: 13, fontWeight: '700', color: COLORS.textTertiary },
  progressTrack: { height: 3, backgroundColor: COLORS.border },
  progressFill:  { height: 3, backgroundColor: COLORS.primary },

  stationCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  stationIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  stationInfo:     { flex: 1 },
  stationName:     { fontSize: 14, fontWeight: '700', color: COLORS.text },
  stationSub:      { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  directionsBtn:   { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.primaryTint },

  cardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  activeText: { color: COLORS.primary },

  // Already-booked times list (time step)
  bookedBox: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginTop: 12, borderWidth: 1, borderColor: COLORS.border },
  bookedTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  bookedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bookedChip: { backgroundColor: COLORS.backgroundAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.border },
  bookedChipText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, fontVariant: ['tabular-nums'] as any },

  // Full-charge auto-stop note (confirm step)
  autoStopBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.primaryBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.primaryTint },
  autoStopText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.primary, lineHeight: 18 },

  bigOption: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: COLORS.border },
  optionDisabled: { opacity: 0.5 },
  bigOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bigOptionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  bigOptionSub:   { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  fullDepends:    { fontSize: 11, color: COLORS.textTertiary, marginTop: 2, fontStyle: 'italic' },

  // Scroll-wheel time picker
  pickerCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 12, borderWidth: 1.5, borderColor: COLORS.border, marginTop: 4 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  pickerColon: { fontSize: 26, fontWeight: '800', color: COLORS.textTertiary, marginHorizontal: 2 },
  pickedBanner: { marginTop: 10, backgroundColor: COLORS.primaryBg, borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: COLORS.primaryTint },
  pickedBannerWarn: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  pickedText: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  pickedTextWarn: { color: COLORS.error },

  hmRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  stepperCol: { flex: 1, alignItems: 'center', gap: 8 },
  stepperLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  stepperBox: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 10, alignSelf: 'stretch', justifyContent: 'center' },
  stepBtn:  { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
  stepValue: { fontSize: 26, fontWeight: '800', color: COLORS.text, minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] as any },

  confirmCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border },
  confirmTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 14 },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  confirmLabel: { fontSize: 14, color: COLORS.textSecondary },
  confirmValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  confirmValueBold: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  confirmDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 6 },
  fullNote: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17, marginTop: 8, fontStyle: 'italic' },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border },
});

// Drum-column (spin wheel) styles
const drum = StyleSheet.create({
  highlight: {
    position: 'absolute', left: 2, right: 2, height: DRUM_ITEM_H,
    backgroundColor: COLORS.primaryBg, borderRadius: 12,
    borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: COLORS.primaryTint,
  },
  item:    { alignItems: 'center', justifyContent: 'center' },
  text:    { fontSize: 20, fontWeight: '500', color: COLORS.textTertiary, fontVariant: ['tabular-nums'] as any },
  textSel: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
});

// Month-calendar styles
const cal = StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 26, fontWeight: '800', color: COLORS.primary, lineHeight: 30 },
  navDisabled: { color: COLORS.border },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: COLORS.textTertiary },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1.5, borderColor: COLORS.primary },
  daySelected: { backgroundColor: COLORS.primary },
  dayText: { fontSize: 15, fontWeight: '600', color: COLORS.text, fontVariant: ['tabular-nums'] as any },
  dayPast: { color: COLORS.border },
  dayTodayText: { color: COLORS.primary, fontWeight: '800' },
  daySelectedText: { color: '#fff', fontWeight: '800' },
});
