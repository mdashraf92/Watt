import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { CustomerStackParamList } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { COLORS } from '../constants/colors';
import { ArrowLeftIcon, CheckIcon, ZapIcon, CreditCardIcon, WalletIcon } from '../components/icons';
import GradientButton from '../components/GradientButton';

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
  const [carModel,  setCarModel]  = useState(profile?.car_model ?? '');
  const [battery,   setBattery]   = useState(profile?.battery_kwh ? String(profile.battery_kwh) : '');
  const [connector, setConnector] = useState<string>(profile?.connector_type ?? '');
  const [saving,    setSaving]    = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(false);

  useFocusEffect(useCallback(() => { refreshProfile(); }, []));

  const carValid = !!connector && parseFloat(battery) > 0;

  const saveCar = async () => {
    if (!carValid) { Alert.alert(t.warning, t.cp_car_required); return; }
    setSaving(true);
    try {
      await updateProfile({
        car_make:       carMake.trim() || undefined,
        car_model:      carModel.trim() || undefined,
        battery_kwh:    parseFloat(battery),
        connector_type: connector,
        profile_prompted: true,
      });
      setSubStep(1);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally { setSaving(false); }
  };

  const topUp = async () => {
    setTopUpLoading(true);
    try {
      const created: any = await api.payments.create(10);
      if (!created?.pay_url) throw new Error(t.wallet_payment_error);
      const result = await WebBrowser.openAuthSessionAsync(created.pay_url, 'watt://wallet');
      if (result.type === 'success' || result.type === 'dismiss') {
        await api.payments.verify(created.session_id);
        await refreshProfile();
      }
    } catch (e: any) {
      Alert.alert(t.error, e.message ?? t.wallet_payment_error);
    } finally { setTopUpLoading(false); }
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

              {/* Car make / model (optional) */}
              <Text style={[s.label, align]}>{t.cp_car_optional}</Text>
              <TextInput style={s.input} value={carMake} onChangeText={setCarMake}
                placeholder={t.cp_make_ph} placeholderTextColor={COLORS.textTertiary} />
              <TextInput style={s.input} value={carModel} onChangeText={setCarModel}
                placeholder={t.cp_model_ph} placeholderTextColor={COLORS.textTertiary} />
            </>
          ) : (
            <>
              {/* Wallet — the working payment rail */}
              <View style={s.payCard}>
                <View style={s.payRow}>
                  <View style={s.payIcon}><WalletIcon size={20} color={COLORS.primary} strokeWidth={2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.payTitle}>{t.cp_wallet}</Text>
                    <Text style={s.payBalance}>{profile?.wallet_balance?.toFixed(3) ?? '0.000'} OMR</Text>
                  </View>
                </View>
                <TouchableOpacity style={s.topUpBtn} onPress={topUp} disabled={topUpLoading} activeOpacity={0.85}>
                  {topUpLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.topUpText}>{t.cp_topup}</Text>}
                </TouchableOpacity>
              </View>

              {/* Saved card — coming soon (Thawani tokenization to be wired) */}
              <View style={[s.payCard, s.payCardDisabled]}>
                <View style={s.payRow}>
                  <View style={s.payIcon}><CreditCardIcon size={20} color={COLORS.textTertiary} strokeWidth={2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.payTitle, { color: COLORS.textSecondary }]}>{t.cp_card}</Text>
                    <Text style={s.paySoon}>{t.cp_card_soon}</Text>
                  </View>
                </View>
              </View>

              <Text style={s.payNote}>{t.cp_pay_note}</Text>
            </>
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

  payCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  payCardDisabled: { opacity: 0.7 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  payIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  payTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  payBalance: { fontSize: 18, fontWeight: '800', color: COLORS.primary, marginTop: 2 },
  paySoon: { fontSize: 12, color: COLORS.textTertiary, marginTop: 2, fontStyle: 'italic' },
  topUpBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  topUpText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  payNote: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginTop: 4, textAlign: 'center' },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 18, paddingVertical: 17, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
