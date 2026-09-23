import React, { useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { useLang } from '../context/LanguageContext';
import type { CustomerStackParamList, PackageBenefit } from '../types';
import GradientButton from '../components/GradientButton';
import { PackageHeader, packageStyles as styles } from './packageShared';

export default function PackageStaffScreen({ navigation }: NativeStackScreenProps<CustomerStackParamList, 'PackageStaff'>) {
  const { t, isRTL } = useLang();
  const [code, setCode] = useState('');
  const [benefit, setBenefit] = useState<PackageBenefit | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const perform = async (redeem: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      if (redeem && benefit) {
        const result = await api.packages.redeemBenefit(benefit.id);
        setBenefit({ ...benefit, benefit_redeemed_at: result.benefit_redeemed_at });
      } else { setBenefit(null); setBenefit(await api.packages.lookupBenefit(code.trim())); }
    } catch { setError(t.pkg_staff_error); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const available = benefit && !benefit.benefit_redeemed_at && ['active', 'consumed'].includes(benefit.status) && Date.parse(benefit.expires_at) > Date.now();
  return <SafeAreaView style={styles.screen}>
    <PackageHeader title={t.pkg_staff} onBack={() => navigation.goBack()} />
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <Text style={[styles.body, align]}>{t.pkg_staff_hint}</Text>
      <TextInput accessibilityLabel={t.pkg_code} placeholder={t.pkg_code} value={code} onChangeText={value => { setCode(value); setBenefit(null); }}
        editable={!busy} autoCapitalize="characters" autoCorrect={false} maxLength={100} style={[styles.card, styles.code]} />
      <GradientButton label={t.pkg_lookup} loading={busy} disabled={!code.trim()} onPress={() => perform(false)} />
      {!!error && <Text accessibilityRole="alert" style={[styles.error, align]}>{error}</Text>}
      {benefit && <View style={styles.card}>
        <Text style={[styles.cardTitle, align]}>{isRTL ? benefit.package_name_ar : benefit.package_name}</Text>
        <Text style={[styles.body, align]}>{isRTL ? benefit.station_name_ar || benefit.station_name : benefit.station_name}</Text>
        <Text style={[styles.benefit, align]}>{isRTL ? benefit.partner_benefit_ar : benefit.partner_benefit}</Text>
        <Text style={[styles.notice, align]}>{benefit.benefit_redeemed_at ? t.pkg_benefit_used : available ? t.pkg_benefit_ready : t.pkg_benefit_unavailable}</Text>
        {available && <GradientButton label={t.pkg_deliver_benefit} loading={busy} onPress={() => perform(true)} />}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
