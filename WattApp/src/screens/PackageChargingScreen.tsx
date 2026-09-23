import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError } from '../lib/api';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useCharging } from '../context/ChargingContext';
import type { CustomerStackParamList, PackageChargingState, PackageChargingRun } from '../types';
import GradientButton from '../components/GradientButton';
import { PackageHeader, PackageSkeleton, packageStyles as styles } from './packageShared';

export default function PackageChargingScreen({ route, navigation }: NativeStackScreenProps<CustomerStackParamList, 'PackageCharging'>) {
  const { entitlementId, stationName } = route.params;
  const { t, isRTL } = useLang();
  const { profile } = useAuth();
  const { setActiveSession, clearActiveSession, activeSessionId } = useCharging();
  const context = useRef({ setActiveSession, clearActiveSession, activeSessionId });
  context.current = { setActiveSession, clearActiveSession, activeSessionId };
  const [data, setData] = useState<PackageChargingState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const fetching = useRef(false);
  const revision = useRef(0);
  const [connector, setConnector] = useState<string | null>(null);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const storageKey = `package-start:${profile?.id}:${entitlementId}`;

  const track = useCallback((run: PackageChargingRun | null) => {
    if (!run) return;
    if (run.state !== 'completed') context.current.setActiveSession(run.id, stationName, entitlementId);
    else if (context.current.activeSessionId === run.id) context.current.clearActiveSession();
  }, [stationName, entitlementId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      if (fetching.current || busyRef.current) return;
      fetching.current = true;
      const currentRevision = revision.current;
      try {
        const response = await api.packages.charging(entitlementId);
        if (active && currentRevision === revision.current) { setData(response); setError(''); track(response.run); }
      } catch { if (active) setError(t.pkg_connection_error); }
      finally { fetching.current = false; }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [entitlementId, track, t.pkg_connection_error]));

  const start = async () => {
    if (!connector || !profile || busyRef.current) return;
    revision.current += 1;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const saved = await AsyncStorage.getItem(storageKey);
      const pending: { key: string; connector: string } = saved ? JSON.parse(saved) : {
        key: `start-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`, connector,
      };
      await AsyncStorage.setItem(storageKey, JSON.stringify(pending));
      const run = await api.packages.startCharging(entitlementId, pending.connector, pending.key);
      setData(prev => prev ? { ...prev, run } : prev); track(run);
      await AsyncStorage.removeItem(storageKey).catch(() => {});
    } catch (e) {
      if (e instanceof ApiError && [400, 403, 404].includes(e.status)) {
        await AsyncStorage.removeItem(storageKey).catch(() => {});
      }
      // Preserve the request key across uncertain responses. Never issue a new
      // hardware start just because the client lost the first acknowledgement.
      setError(t.pkg_start_error);
    } finally { busyRef.current = false; setBusy(false); }
  };

  const stop = async () => {
    if (!data?.run || busyRef.current) return;
    revision.current += 1;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const run = await api.packages.stopCharging(data.run.id);
      setData(prev => prev ? { ...prev, run } : prev); track(run);
      await AsyncStorage.removeItem(storageKey).catch(() => {});
    } catch { setError(t.pkg_stop_pending); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const running = data?.run && data.run.state !== 'completed';
  return <SafeAreaView style={styles.screen}>
    <PackageHeader title={t.pkg_charging} onBack={() => navigation.goBack()} />
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={[styles.title, align]}>{stationName}</Text>
      <Text style={[styles.notice, align]}>{t.pkg_no_second_bill}</Text>
      {!!error && <Text accessibilityRole="alert" style={[styles.error, align]}>{error}</Text>}
      {!data && !error && <PackageSkeleton />}
      {data?.run && <View style={styles.card}>
        <Text style={[styles.cardTitle, align]}>{t[`pkg_run_${data.run.state}`]}</Text>
        <Text style={[styles.price, align]}>{data.run.kwh_delivered.toFixed(3)} kWh</Text>
        <Text style={[styles.small, align]}>{t.pkg_expires_at.replace('{date}', new Date(data.run.deadline).toLocaleString(isRTL ? 'ar-OM' : 'en-GB'))}</Text>
        {data.run.flagged_review && <Text style={[styles.notice, align]}>{t.pkg_meter_review}</Text>}
        {running && <GradientButton label={t.pkg_stop} loading={busy} onPress={stop} />}
      </View>}
      {data && !running && <>
        <Text style={[styles.body, align]}>{t.pkg_choose_connector}</Text>
        {!data.enabled && <Text style={[styles.notice, align]}>{t.pkg_launch_pending}</Text>}
        {data.connectors.length === 0 && <Text style={[styles.body, align]}>{t.pkg_no_connectors}</Text>}
        {data.connectors.map(item => <Pressable key={item.id} accessibilityRole="radio"
          accessibilityState={{ checked: connector === item.id, disabled: item.busy || item.status !== 'available' || busy }}
          disabled={item.busy || item.status !== 'available' || busy} onPress={() => setConnector(item.id)} style={styles.card}>
          <Text style={[styles.cardTitle, align]}>{connector === item.id ? '● ' : '○ '}{item.connector_type} · {item.power_kw} kW</Text>
          <Text style={[styles.small, align]}>{item.id.slice(-6)} · {item.busy || item.status !== 'available' ? t.station_unavailable : t.status_available}</Text>
        </Pressable>)}
        <GradientButton label={t.pkg_start} loading={busy} disabled={!connector || !data.enabled || !!data.run?.flagged_review} onPress={start} />
      </>}
    </ScrollView>
  </SafeAreaView>;
}
