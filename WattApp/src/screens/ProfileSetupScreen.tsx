import React, { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { COLORS } from '../constants/colors';
import { FONTS, FONTS_AR } from '../constants/typography';
import { ArrowLeftIcon, CarIcon, PhoneIcon, UserIcon, ZapIcon } from '../components/icons';
import GradientButton from '../components/GradientButton';
import SearchablePicker from '../components/SearchablePicker';
import { evMakes, evModelsFor, evYears, findEv } from '../data/evCatalog';
import { parseVehicle, serializeVehicle } from '../lib/vehicle';

const CONNECTORS = ['Type2', 'CCS', 'CHAdeMO', 'GBT'] as const;
const BATTERY_PRESETS = [40, 50, 60, 75, 100];
const PHONE_DIGITS = 8;   // Oman mobile numbers, after +968

// Shown by the root navigator right after a new account is created (any sign-up
// path), until profiles.onboarding_completed is true:
//   1. name + mobile number  (required)
//   2. EV details            (optional — one "Skip for now" tap)
// Finishing either way flips onboarding_completed, and the navigator moves on.
export default function ProfileSetupScreen() {
  const { profile, updateProfile, signOut } = useAuth();
  const { t, isRTL, toggleLanguage } = useLang();

  const [step, setStep] = useState<0 | 1>(0);
  const [saving, setSaving] = useState<'next' | 'finish' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState((profile?.phone ?? '').replace(/^\+?968/, '').replace(/\D/g, '').slice(0, PHONE_DIGITS));
  const phoneRef = useRef<TextInput>(null);

  const [carMake, setCarMake] = useState(profile?.car_make ?? '');
  const [carModel, setCarModel] = useState(() => parseVehicle(profile?.car_model).model);
  const [carYear, setCarYear] = useState(() => parseVehicle(profile?.car_model).year);
  const [battery, setBattery] = useState(profile?.battery_kwh ? String(profile.battery_kwh) : '');
  const [connector, setConnector] = useState<string>(profile?.connector_type ?? '');
  const [autoFilled, setAutoFilled] = useState(false);

  const font = (w: 'regular' | 'medium' | 'bold' | 'extrabold') => ({ fontFamily: isRTL ? FONTS_AR[w] : FONTS[w] });
  const align = { textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left' };
  const row = isRTL ? 'row-reverse' as const : 'row' as const;

  const makeOptions = useMemo(() => evMakes().map(m => ({ value: m, label: m })), []);
  const modelOptions = useMemo(() => evModelsFor(carMake).map(e => ({
    value: e.model, label: e.model, sub: `${e.batteryKwh} kWh · ${e.connector}`,
  })), [carMake]);
  const yearOptions = useMemo(() => evYears(findEv(carMake, carModel)).map(y => ({ value: y, label: y })), [carMake, carModel]);

  const pickMake = (m: string) => { setCarMake(m); setCarModel(''); setAutoFilled(false); };
  // Picking a known model fills battery + connector, so make → model → Finish
  // is the whole step for most people.
  const pickModel = (m: string) => {
    setCarModel(m);
    const entry = findEv(carMake, m);
    if (entry) { setBattery(String(entry.batteryKwh)); setConnector(entry.connector); setAutoFilled(true); }
    else setAutoFilled(false);
  };

  const nameOk = name.trim().length >= 2;
  const phoneOk = phone.length === PHONE_DIGITS;
  const carOk = !!connector && parseFloat(battery) > 0;

  const saveAbout = async () => {
    if (!nameOk) { setError(t.ps_name_error); return; }
    if (!phoneOk) { setError(t.ps_phone_error); return; }
    setSaving('next'); setError(null);
    try {
      await updateProfile({ full_name: name.trim(), phone: `+968${phone}` });
      setStep(1);
    } catch (e: any) { setError(e?.message ?? t.error); }
    finally { setSaving(null); }
  };

  const finish = async (withCar: boolean) => {
    setSaving(withCar ? 'finish' : 'skip'); setError(null);
    try {
      await updateProfile({
        ...(withCar ? {
          car_make: carMake.trim() || undefined,
          // Same shape the Profile editor writes, so the two round-trip.
          car_model: carModel.trim() ? serializeVehicle({ model: carModel.trim(), connector, year: carYear }) : undefined,
          battery_kwh: parseFloat(battery),
          connector_type: connector,
        } : {}),
        profile_prompted: true,        // the older "complete your car" nudge is now covered
        onboarding_completed: true,
      });
      // Navigator moves on by itself once the profile says setup is done.
    } catch (e: any) { setError(e?.message ?? t.error); setSaving(null); }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={[s.header, { flexDirection: row }]}>
        {step === 1 ? (
          <Pressable onPress={() => { setError(null); setStep(0); }} hitSlop={10} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={isRTL ? 'رجوع' : 'Back'}>
            <View style={isRTL && s.flipX}><ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.4} /></View>
          </Pressable>
        ) : <View style={s.iconSpacer} />}
        <View style={[s.progress, { flexDirection: row }]}>
          {[0, 1].map(i => <View key={i} style={[s.progressSeg, i <= step && s.progressOn]} />)}
        </View>
        <Pressable onPress={toggleLanguage} hitSlop={10} style={s.pill} accessibilityRole="button">
          <Text style={[s.pillText, font('bold')]}>{t.profile_language_label}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={[{ flexDirection: row, alignItems: 'center', gap: 8 }]}>
            <Text style={[s.stepLabel, font('bold')]}>{step === 0 ? t.ps_step_1 : t.ps_step_2}</Text>
            {step === 1 && <View style={s.optional}><Text style={[s.optionalText, font('bold')]}>{t.ps_optional}</Text></View>}
          </View>
          <Text style={[s.title, font('extrabold'), align]}>{step === 0 ? t.ps_about_title : t.ps_ev_title}</Text>
          <Text style={[s.sub, font('regular'), align]}>{step === 0 ? t.ps_about_sub : t.ps_ev_sub}</Text>

          {step === 0 ? <>
            <Text style={[s.label, font('bold'), align]}>{t.ps_name}</Text>
            <View style={[s.inputBox, { flexDirection: row }]}>
              <UserIcon size={19} color={COLORS.textTertiary} strokeWidth={2} />
              <TextInput
                style={[s.input, font('medium'), align]}
                value={name}
                onChangeText={v => { setName(v); if (error) setError(null); }}
                placeholder={t.ps_name_ph}
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                autoCorrect={false}
                autoFocus={!name}
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            <Text style={[s.label, font('bold'), align]}>{t.ps_phone}</Text>
            {/* The number itself is always written left-to-right. */}
            <View style={[s.inputBox, { flexDirection: 'row' }]}>
              <PhoneIcon size={18} color={COLORS.textTertiary} strokeWidth={2} />
              <Text style={[s.prefix, { fontFamily: FONTS.bold }]}>+968</Text>
              <View style={s.prefixDivider} />
              <TextInput
                ref={phoneRef}
                style={[s.input, { fontFamily: FONTS.medium, textAlign: 'left', letterSpacing: 1 }]}
                value={phone}
                onChangeText={v => { setPhone(v.replace(/\D/g, '').slice(0, PHONE_DIGITS)); if (error) setError(null); }}
                placeholder="9XXXXXXX"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={PHONE_DIGITS}
                returnKeyType="done"
                onSubmitEditing={saveAbout}
              />
            </View>
            <Text style={[s.hint, font('regular'), align]}>{t.ps_phone_hint}</Text>

            {!!error && <Text style={[s.error, font('medium'), align]}>{error}</Text>}
            <GradientButton label={t.su_continue} onPress={saveAbout} loading={saving === 'next'} disabled={!nameOk || !phoneOk} textStyle={font('bold')} />
          </> : <>
            <SearchablePicker label={t.cp_make} value={carMake} options={makeOptions} onChange={pickMake} placeholder={t.cp_make_ph} allowCustom />
            <SearchablePicker label={t.cp_model} value={carModel} options={modelOptions} onChange={pickModel} placeholder={t.cp_model_ph}
              allowCustom disabled={!carMake} disabledHint={t.cp_pick_make_first} />
            {!!carModel && <SearchablePicker label={t.cp_year} value={carYear} options={yearOptions} onChange={setCarYear} placeholder={t.cp_year_ph} />}

            {autoFilled && (
              <View style={[s.note, { flexDirection: row }]}>
                <ZapIcon size={14} color={COLORS.primary} strokeWidth={2.2} />
                <Text style={[s.noteText, font('regular'), align]}>{t.cp_autofilled}</Text>
              </View>
            )}

            <Text style={[s.label, font('bold'), align]}>{t.cp_connector}</Text>
            <View style={[s.chips, { flexDirection: row }]}>
              {CONNECTORS.map(c => (
                <Pressable key={c} onPress={() => setConnector(c)} style={[s.chip, connector === c && s.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: connector === c }}>
                  <Text style={[s.chipText, { fontFamily: FONTS.bold }, connector === c && { color: COLORS.primaryDark }]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.label, font('bold'), align]}>{t.cp_battery}</Text>
            <View style={[s.chips, { flexDirection: row }]}>
              {BATTERY_PRESETS.map(b => (
                <Pressable key={b} onPress={() => setBattery(String(b))} style={[s.chip, battery === String(b) && s.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: battery === String(b) }}>
                  <Text style={[s.chipText, { fontFamily: FONTS.bold }, battery === String(b) && { color: COLORS.primaryDark }]}>{b} kWh</Text>
                </Pressable>
              ))}
            </View>
            <View style={[s.inputBox, { flexDirection: row }]}>
              <CarIcon size={18} color={COLORS.textTertiary} strokeWidth={2} />
              <TextInput
                style={[s.input, font('medium'), align]}
                value={battery}
                onChangeText={v => setBattery(v.replace(/[^0-9.]/g, ''))}
                placeholder={t.cp_battery_ph}
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>

            {!!error && <Text style={[s.error, font('medium'), align]}>{error}</Text>}
            <GradientButton label={t.ps_finish} onPress={() => finish(true)} loading={saving === 'finish'} disabled={!carOk || !!saving} textStyle={font('bold')} />
            <Pressable onPress={() => finish(false)} disabled={!!saving} style={({ pressed }) => [s.skip, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <Text style={[s.skipText, font('bold')]}>{saving === 'skip' ? '…' : t.ps_skip}</Text>
            </Pressable>
          </>}

          <Pressable onPress={() => void signOut()} hitSlop={8} style={{ alignSelf: 'center', padding: 8, marginTop: 6 }} accessibilityRole="button">
            <Text style={[s.signOut, font('medium')]}>{t.ps_sign_out}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: 42, height: 42 },
  flipX: { transform: [{ scaleX: -1 }] },
  progress: { flex: 1, gap: 6 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  progressOn: { backgroundColor: COLORS.primary },
  pill: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center' },
  pillText: { fontSize: 12, color: COLORS.textSecondary },

  body: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 32, gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center' },
  stepLabel: { fontSize: 12, color: COLORS.primary, letterSpacing: 0.3 },
  optional: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: COLORS.goldBg },
  optionalText: { fontSize: 11, color: COLORS.goldDark },
  title: { fontSize: 27, lineHeight: 35, color: COLORS.text, marginTop: -4 },
  sub: { fontSize: 15, lineHeight: 22, color: COLORS.textSecondary, marginBottom: 8 },
  label: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },

  inputBox: { height: 56, alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border },
  input: { flex: 1, height: '100%', fontSize: 16, color: COLORS.text, paddingVertical: 0 },
  prefix: { fontSize: 16, color: COLORS.text },
  prefixDivider: { width: 1, height: 24, backgroundColor: COLORS.border },
  hint: { fontSize: 12, color: COLORS.textTertiary, marginTop: -4 },
  error: { fontSize: 13, lineHeight: 19, color: COLORS.error },

  note: { alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryTint },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: COLORS.textSecondary },
  chips: { flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.card, justifyContent: 'center' },
  chipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  chipText: { fontSize: 14, color: COLORS.text },

  skip: { height: 50, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 15, color: COLORS.textSecondary },
  signOut: { fontSize: 13, color: COLORS.textTertiary },
});
