import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { COLORS } from '../constants/colors';
import type { CustomerStackParamList, VenuePackage } from '../types';
import GradientButton from '../components/GradientButton';
import ErrorView from '../components/ErrorView';
import { packageStyles as styles, PackageHeader, PackageSkeleton } from './packageShared';

export default function VenuePackagesScreen({ route, navigation }: NativeStackScreenProps<CustomerStackParamList, 'VenuePackages'>) {
  const { t, isRTL } = useLang();
  const { profile, refreshProfile } = useAuth();
  const [offers, setOffers] = useState<VenuePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<VenuePackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const text = (en: string, ar: string) => isRTL ? ar || en : en;
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [items, availability] = await Promise.all([
        api.packages.atVenue(route.params.stationId), api.packages.availability(),
      ]);
      setOffers(items); setEnabled(availability.purchase_enabled);
    } catch { setError(true); setEnabled(false); }
    finally { setLoading(false); }
  }, [route.params.stationId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const buy = async () => {
    if (!selected || !profile || inFlight.current || !enabled) return;
    inFlight.current = true; setBusy(true); setMessage('');
    // Persist BEFORE sending: an interrupted response or app restart must reuse
    // the same request. The server, never the UI, owns the debit and replay check.
    const storageKey = `package-purchase:${profile.id}:${selected.id}`;
    try {
      const saved = await AsyncStorage.getItem(storageKey);
      const pending: { key: string; price: number; version: string } = saved ? JSON.parse(saved) : {
        key: `pkg-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
        price: selected.price, version: selected.offer_version,
      };
      await AsyncStorage.setItem(storageKey, JSON.stringify(pending));
      await api.packages.purchase(selected.id, pending.key, pending.price, pending.version);
      // A failed cleanup must not turn a successful purchase into a failure.
      await AsyncStorage.removeItem(storageKey).catch(() => {});
      void refreshProfile();
      setSelected(null);
      navigation.navigate('MyPackages');
    } catch (e) {
      if (e instanceof ApiError && [400, 402, 404, 409].includes(e.status)) {
        await AsyncStorage.removeItem(storageKey).catch(() => {});
      }
      setMessage(e instanceof ApiError && e.status === 402 ? t.pkg_insufficient
        : e instanceof ApiError && e.status === 409 ? t.pkg_offer_changed : t.pkg_error);
    } finally { inFlight.current = false; setBusy(false); }
  };

  return <SafeAreaView style={styles.screen}>
    <PackageHeader title={t.pkg_title} onBack={() => navigation.goBack()} />
    <FlatList data={loading || error ? [] : offers} keyExtractor={item => item.id}
      contentContainerStyle={styles.list} refreshing={loading} onRefresh={load}
      ListHeaderComponent={<View style={styles.intro}>
        <Text style={[styles.eyebrow, align]}>Go Watt</Text>
        <Text style={[styles.title, align]}>{route.params.stationName}</Text>
        <Text style={[styles.body, align]}>{t.pkg_intro}</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('MyPackages')} style={styles.link}>
          <Text style={[styles.linkText, align]}>{t.pkg_mine} →</Text>
        </Pressable>
        {!loading && !error && !enabled && <Text style={[styles.notice, align]}>{t.pkg_launch_pending}</Text>}
      </View>}
      ListEmptyComponent={loading ? <PackageSkeleton /> : error ? <ErrorView onRetry={load} />
        : <Text style={[styles.body, align]}>{t.pkg_none_at_venue}</Text>}
      renderItem={({ item }) => <View style={styles.card}>
        <Text style={[styles.cardTitle, align]}>{text(item.name, item.name_ar)}</Text>
        <Text style={[styles.benefit, align]}>{text(item.partner_benefit, item.partner_benefit_ar)}</Text>
        {!!text(item.description, item.description_ar) && <Text style={[styles.body, align]}>{text(item.description, item.description_ar)}</Text>}
        <View style={styles.allowance}>
          {item.included_minutes !== null && <Text style={[styles.body, align]}>{t.pkg_includes_minutes.replace('{n}', String(item.included_minutes))}</Text>}
          {item.included_kwh !== null && <Text style={[styles.body, align]}>{t.pkg_includes_kwh.replace('{n}', String(item.included_kwh))}</Text>}
          <Text style={[styles.small, align]}>{t.pkg_valid_hours.replace('{n}', String(item.validity_hours))}</Text>
          {item.included_minutes !== null && item.included_kwh !== null && <Text style={[styles.small, align]}>{t.pkg_cap_first}</Text>}
        </View>
        <Text style={[styles.price, align]}>{item.price.toFixed(3)} OMR</Text>
        <GradientButton label={t.pkg_buy} disabled={!enabled} onPress={() => { setMessage(''); setSelected(item); }} />
      </View>} />
    <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => { if (!busy) setSelected(null); }}>
      <View style={local.overlay}><View style={local.sheet}>
        <Text style={[styles.cardTitle, align]}>{t.pkg_confirm_title}</Text>
        <Text style={[styles.benefit, align]}>{selected && text(selected.name, selected.name_ar)}</Text>
        <Text style={[styles.body, align]}>{t.pkg_confirm_body.replace('{price}', (selected?.price ?? 0).toFixed(3))}</Text>
        <Text style={[styles.notice, align]}>{t.pkg_no_reservation}</Text>
        {!!message && <Text accessibilityRole="alert" style={[styles.error, align]}>{message}</Text>}
        <GradientButton label={t.pkg_buy} loading={busy} onPress={buy} />
        <Pressable accessibilityRole="button" disabled={busy} style={styles.link} onPress={() => { setSelected(null); if (message === t.pkg_offer_changed) void load(); }}>
          <Text style={styles.linkText}>{t.cancel}</Text>
        </Pressable>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const local = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: COLORS.card, borderRadius: 24, padding: 24, gap: 16 },
});
