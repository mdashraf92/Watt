import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { CustomerStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { COLORS } from '../constants/colors';
import { ArrowLeftIcon, CheckIcon, ZapIcon } from '../components/icons';
import GradientButton from '../components/GradientButton';
import PaymentMethodsSection from '../components/PaymentMethodsSection';
import SearchablePicker from '../components/SearchablePicker';
import { evMakes, evModelsFor, evYears, findEv } from '../data/evCatalog';
import { parseVehicle, serializeVehicle } from '../lib/vehicle';

type Nav   = NativeStackNavigationProp<CustomerStackParamList, 'CompleteProfile'>;
type Route = RouteProp<CustomerStackParamList, 'CompleteProfile'>;

const CONNECTORS = ['Type2', 'CCS', 'CHAdeMO', 'GBT'] as const;
// Common EV battery sizes (kWh) for one-tap selection; "Other" lets them type.
const BATTERY_PRESETS = [40, 50, 60, 75, 100];

export default function CompleteProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { station, listingId } = route.params ?? {};
  const { profile, updateProfile, refreshProfile } = useAuth();
  const { t, isRTL } = useLang();
  const insets = useSafeAreaInsets();

  const [subStep, setSubStep] = useState<0 | 1>(0);   // 0 = car, 1 = payment

  const [carMake,   setCarMake]   = useState(profile?.car_make ?? '');
  const [carModel,  setCarModel]  = useState(() => parseVehicle(profile?.car_model).model);
  const [carYear,   setCarYear]   = useState(() => parseVehicle(profile?.car_model).year);
  const [battery,   setBattery]   = useState(profile?.battery_kwh ? String(profile.battery_kwh) : '');
  const [connector, setConnector] = useState<string>(profile?.connector_type ?? '');
  const [autoFilled, setAutoFilled] = useState(false);
  const [saving,    setSaving]    = useState(false);

  useFocusEffect(useCallback(() => { refreshProfile(); }, []));

  // ── Car picker options ───────────────────────────────────────
  const makeOptions  = useMemo(() => evMakes().map(m => ({ value: m, label: m })), []);
  const modelOptions = useMemo(
    () => evModelsFor(carMake).map(e => ({
      value: e.model,
      label: e.model,
      sub: `${e.batteryKwh} kWh · ${e.connector}`,
    })),
    [carMake],
  );
  const yearOptions = useMemo(
    () => evYears(findEv(carMake, carModel)).map(y => ({ value: y, label: y })),
    [carMake, carModel],
  );

  // Changing the make invalidates the model (and so the year).
  const pickMake = (m: string) => {
    setCarMake(m);
    setCarModel('');
    setAutoFilled(false);
  };

  // Picking a known model is what fills battery + connector. Values stay
  // editable afterwards — the catalog is a starting point, not the truth.
  const pickModel = (m: string) => {
    setCarModel(m);
    const entry = findEv(carMake, m);
    if (entry) {
      setBattery(String(entry.batteryKwh));
      setConnector(entry.connector);
      setAutoFilled(true);
    } else {
      setAutoFilled(false);
    }
  };

  const carValid = !!connector && parseFloat(battery) > 0;

  const saveCar = async () => {
    if (!carValid) { Alert.alert(t.warning, t.cp_car_required); return; }
    setSaving(true);
    try {
      await updateProfile({
        car_make:       carMake.trim() || undefined,
        // Stored in the same shape the Profile screen's editor writes, so the
        // two screens round-trip each other instead of clobbering.
        car_model:      carModel.trim()
          ? serializeVehicle({ model: carModel.trim(), connector, year: carYear })
          : undefined,
        battery_kwh:    parseFloat(battery),
        connector_type: connector,
        profile_prompted: true,
      });
      setSubStep(1);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally { setSaving(false); }
  };

  // If we came from booking a specific charger, continue there; otherwise this
  // was the "complete profile" nudge — just return.
  const finish = () => {
    if (station) navigation.replace('Booking', { station, listingId });
    else navigation.goBack();
  };

  const align = { textAlign: (isRTL ? 'right' : 'left') as 'left' | 'right' };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => subStep === 1 ? setSubStep(0) : navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{subStep === 0 ? t.cp_title_car : t.cp_title_pay}</Text>
        <Text style={s.stepCount}>{subStep + 1}/2</Text>
      </View>
      <View style={s.progressTrack}><View style={[s.progressFill, { width: subStep === 0 ? '50%' : '100%' }]} /></View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 + insets.bottom }} keyboardShouldPersistTaps="handled">

          <Text style={[s.intro, align]}>{subStep === 0 ? t.cp_car_intro : t.cp_pay_intro}</Text>

          {subStep === 0 ? (
            <>
              {/* Pick the car first: choosing a known model fills in battery and
                  connector below, which are the two fields people get wrong. */}
              <SearchablePicker
                label={t.cp_make}
                value={carMake}
                options={makeOptions}
                onChange={pickMake}
                placeholder={t.cp_make_ph}
                allowCustom
              />
              <View style={{ height: 12 }} />
              <SearchablePicker
                label={t.cp_model}
                value={carModel}
                options={modelOptions}
                onChange={pickModel}
                placeholder={t.cp_model_ph}
                allowCustom
                disabled={!carMake}
                disabledHint={t.cp_pick_make_first}
              />
              <View style={{ height: 12 }} />
              <SearchablePicker
                label={t.cp_year}
                value={carYear}
                options={yearOptions}
                onChange={setCarYear}
                placeholder={t.cp_year_ph}
              />

              {autoFilled && (
                <View style={s.autoFillNote}>
                  <ZapIcon size={14} color={COLORS.primary} strokeWidth={2.2} />
                  <Text style={[s.autoFillText, align]}>{t.cp_autofilled}</Text>
                </View>
              )}

              {/* Connector type */}
              <Text style={[s.label, align]}>{t.cp_connector}</Text>
              <View style={s.chipRow}>
                {CONNECTORS.map(c => (
                  <TouchableOpacity key={c} style={[s.chip, connector === c && s.chipActive]} onPress={() => setConnector(c)} activeOpacity={0.85}>
                    <Text style={[s.chipText, connector === c && s.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Battery size */}
              <Text style={[s.label, align]}>{t.cp_battery}</Text>
              <View style={s.chipRow}>
                {BATTERY_PRESETS.map(b => (
                  <TouchableOpacity key={b} style={[s.chip, battery === String(b) && s.chipActive]} onPress={() => setBattery(String(b))} activeOpacity={0.85}>
                    <Text style={[s.chipText, battery === String(b) && s.chipTextActive]}>{b} kWh</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={s.input}
                value={battery}
                onChangeText={v => setBattery(v.replace(/[^0-9.]/g, ''))}
                placeholder={t.cp_battery_ph}
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="decimal-pad"
              />
            </>
          ) : (
            <PaymentMethodsSection showWalletRow quickTopUpAmount={10} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {subStep === 0 ? (
          <GradientButton label={t.cp_next} onPress={saveCar} loading={saving} disabled={!carValid} />
        ) : (
          <GradientButton
            label={station ? t.cp_continue_booking : t.cp_done}
            onPress={finish}
            icon={<CheckIcon size={18} color="#fff" strokeWidth={2.5} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.card },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: COLORS.text },
  stepCount: { width: 40, textAlign: 'right', fontSize: 13, fontWeight: '700', color: COLORS.textTertiary },
  progressTrack: { height: 3, backgroundColor: COLORS.border },
  progressFill: { height: 3, backgroundColor: COLORS.primary },

  intro: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.card },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  chipText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  chipTextActive: { color: COLORS.primary },
  input: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: COLORS.text, marginBottom: 10 },
  autoFillNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.primaryBg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.primaryTint,
    padding: 12, marginTop: 14,
  },
  autoFillText: { flex: 1, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 18 },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 18, paddingVertical: 17, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
