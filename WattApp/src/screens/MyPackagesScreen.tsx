import React, { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../lib/api';
import { useLang } from '../context/LanguageContext';
import type { CustomerStackParamList, Entitlement } from '../types';
import GradientButton from '../components/GradientButton';
import ErrorView from '../components/ErrorView';
import { PackageHeader, PackageSkeleton, packageStyles as styles } from './packageShared';

export default function MyPackagesScreen({ navigation }: NativeStackScreenProps<CustomerStackParamList, 'MyPackages'>) {
  const { t, isRTL } = useLang();
  const [items, setItems] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState(false);
  const [error, setError] = useState(false);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [packages, venues] = await Promise.all([api.packages.mine(true), api.packages.staffVenues().catch(() => [])]);
      setItems(packages); setStaff(venues.length > 0);
    }
    catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <SafeAreaView style={styles.screen}>
    <PackageHeader title={t.pkg_mine} onBack={() => navigation.goBack()} />
    <FlatList data={loading || error ? [] : items} keyExtractor={item => item.id}
      contentContainerStyle={styles.list} refreshing={loading} onRefresh={load}
      ListHeaderComponent={<View style={styles.intro}><Text style={[styles.body, align]}>{t.pkg_balance_separate}</Text>{staff && <GradientButton label={t.pkg_staff} onPress={() => navigation.navigate('PackageStaff')} />}</View>}
      ListEmptyComponent={loading ? <PackageSkeleton /> : error ? <ErrorView onRetry={load} />
        : <Text style={[styles.body, align]}>{t.pkg_none_mine}</Text>}
      renderItem={({ item }) => {
        const status = item.status === 'active' && Date.parse(item.expires_at) <= Date.now() ? 'expired' : item.status;
        return <View style={styles.card}>
          <Text style={[styles.eyebrow, align]}>{t[`pkg_status_${status}`]}</Text>
          <Text style={[styles.cardTitle, align]}>{isRTL ? item.package_name_ar || item.package_name : item.package_name}</Text>
          <Text style={[styles.body, align]}>{isRTL ? item.station_name_ar || item.station_name : item.station_name}</Text>
          <Text style={[styles.benefit, align]}>{isRTL ? item.partner_benefit_ar || item.partner_benefit : item.partner_benefit}</Text>
          <View style={styles.allowance}>
            <Text style={[styles.small, align]}>{t.pkg_remaining}</Text>
            {item.minutes_total !== null && <Text style={[styles.body, align]}>{t.pkg_remaining_minutes.replace('{n}', String(Math.max(0, item.minutes_total - item.minutes_used)))}</Text>}
            {item.kwh_total !== null && <Text style={[styles.body, align]}>{t.pkg_remaining_kwh.replace('{n}', Math.max(0, item.kwh_total - item.kwh_used).toFixed(3))}</Text>}
          </View>
          <Text style={[styles.small, align]}>{t.pkg_expires_at.replace('{date}', new Date(item.expires_at).toLocaleString(isRTL ? 'ar-OM' : 'en-GB'))}</Text>
          <Text style={[styles.small, align]}>{item.benefit_redeemed_at ? t.pkg_benefit_used : ['active', 'consumed'].includes(status) && Date.parse(item.expires_at) > Date.now() ? t.pkg_benefit_ready : t.pkg_benefit_unavailable}</Text>
          <GradientButton label={t.pkg_charging} onPress={() => navigation.navigate('PackageCharging', { entitlementId: item.id, stationName: isRTL ? item.station_name_ar || item.station_name : item.station_name })} />
          {(status === 'active' || (status === 'consumed' && !item.benefit_redeemed_at && Date.parse(item.expires_at) > Date.now())) && <>
            <View style={{ alignSelf: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12 }}>
              <QRCode value={item.redeem_code} size={144} />
            </View>
            <Text style={[styles.small, align]}>{t.pkg_code}</Text>
            <Text selectable style={styles.code}>{item.redeem_code}</Text>
            <Text style={[styles.small, align]}>{t.pkg_code_hint}</Text>
          </>}
        </View>;
      }} />
  </SafeAreaView>;
}
