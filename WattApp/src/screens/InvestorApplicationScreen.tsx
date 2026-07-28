import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import OSMMap, { OSMMapHandle, OSMRegion as Region } from '../components/OSMMap';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { api } from '../lib/api';
import { COLORS } from '../constants/colors';
import type { CustomerStackParamList } from '../types';
import {
  ChevronRightIcon, CheckIcon, ZapIcon, MapPinIcon,
  UserIcon, ShieldIcon, XIcon, LocateIcon,
} from '../components/icons';
import GradientButton from '../components/GradientButton';

type Props = NativeStackScreenProps<CustomerStackParamList, 'InvestorApplication'>;

const CHARGER_TYPES = ['Type2', 'CCS', 'CHAdeMO', 'GBT'] as const;
type ChargerType = typeof CHARGER_TYPES[number];

const OMAN_REGION: Region = {
  latitude: 23.588,
  longitude: 58.383,
  latitudeDelta: 3.0,
  longitudeDelta: 3.0,
};

interface PickedLocation {
  latitude: number;
  longitude: number;
  governorate: string;
  city: string;
  address: string;
}

// ── Main screen ────────────────────────────────────────────────

export default function InvestorApplicationScreen({ navigation, route }: Props) {
  const { profile, session } = useAuth();
  const { t, isRTL } = useLang();
  const reapply = route.params?.reapply ?? false;

  // Form state
  const [fullName, setFullName]               = useState(profile?.full_name ?? '');
  const [phone, setPhone]                     = useState(profile?.phone ?? '');
  const [stationName, setStationName]         = useState('');
  const [location, setLocation]               = useState<PickedLocation | null>(null);
  const [chargerType, setChargerType]         = useState<ChargerType | ''>('');
  const [powerKw, setPowerKw]                 = useState('');
  const [electricityForm, setElectricityForm] = useState('');
  const [commercialReg, setCommercialReg]     = useState('');
  const [idCard, setIdCard]                   = useState('');

  // UI state
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [mapVisible, setMapVisible]   = useState(false);

  // Pre-fill from existing application when reapplying
  useEffect(() => {
    if (!reapply || !profile) return;
    (async () => {
      const data = await api.applications.mine().catch(() => null);
      if (data) {
        setFullName(data.full_name);
        setPhone(data.phone);
        if (data.latitude && data.longitude) {
          setLocation({
            latitude: data.latitude,
            longitude: data.longitude,
            governorate: data.governorate,
            city: data.city,
            address: `${data.city}, ${data.governorate}`,
          });
        }
        setStationName(data.station_name ?? '');
        setChargerType(data.charger_type as ChargerType);
        setPowerKw(data.power_kw ? String(data.power_kw) : '');
        setElectricityForm(data.electricity_form_name);
        setCommercialReg(data.commercial_registration);
        setIdCard(data.id_card_number);
      }
    })();
  }, [reapply, profile]);

  const isValid =
    fullName.trim() &&
    phone.trim() &&
    location !== null &&
    chargerType &&
    electricityForm.trim() &&
    commercialReg.trim() &&
    idCard.trim();

  const handleSubmit = async () => {
    if (!isValid || !location) {
      Alert.alert(t.error, t.inv_app_validation);
      return;
    }
    if (!profile || !session) return;
    setSubmitting(true);
    try {
      await api.applications.submit({
        full_name: fullName.trim(),
        phone: phone.trim(),
        station_name: stationName.trim() || null,
        governorate: location.governorate,
        city: location.city,
        latitude: location.latitude,
        longitude: location.longitude,
        charger_type: chargerType,
        power_kw: powerKw ? parseFloat(powerKw) : null,
        electricity_form_name: electricityForm.trim(),
        commercial_registration: commercialReg.trim(),
        id_card_number: idCard.trim(),
      });

      // TODO: send a confirmation email once SMTP is configured on the server.

      setSubmitted(true);
    } catch (e: any) {
      Alert.alert(t.error, e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success state ──────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.successWrap}>
          <View style={styles.successIconWrap}>
            <CheckIcon size={40} color="#fff" strokeWidth={3} />
          </View>
          <Text style={styles.successTitle}>{t.inv_app_success_title}</Text>
          <Text style={styles.successSub}>{t.inv_app_success_sub}</Text>
          <View style={styles.successSteps}>
            {[t.investor_step1, t.investor_step2, t.investor_step3, t.investor_step4].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                <Text style={styles.stepLabel}>{step}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>{t.inv_app_back}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.headerBack}>{t.back}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.inv_app_title}</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.heroIconWrap}>
              <ZapIcon size={28} color={COLORS.gold} strokeWidth={2} />
            </View>
            <Text style={styles.heroTitle}>{t.inv_app_title}</Text>
            <Text style={styles.heroSub}>{t.inv_app_subtitle}</Text>
          </View>

          {/* ── Personal Info ───────────────────────────────────── */}
          <SectionHeader icon={<UserIcon size={16} color={COLORS.primary} strokeWidth={2} />} title={t.inv_app_personal} />
          <View style={styles.card}>
            <FormField label={t.inv_app_name} required>
              <TextInput style={styles.input} value={fullName} onChangeText={setFullName}
                placeholder={t.inv_app_name_ph} placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="words" returnKeyType="next" />
            </FormField>
            <FormField label={t.inv_app_phone} required last>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone}
                placeholder={t.inv_app_phone_ph} placeholderTextColor={COLORS.textTertiary}
                keyboardType="phone-pad" returnKeyType="next" />
            </FormField>
          </View>

          {/* ── Location (Map Picker) ────────────────────────────── */}
          <SectionHeader icon={<MapPinIcon size={16} color={COLORS.primary} strokeWidth={2} />} title={t.inv_app_location} />
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.mapPickerBtn}
              onPress={() => setMapVisible(true)}
              activeOpacity={0.8}
            >
              {location ? (
                /* Location picked — show map thumbnail + details */
                <View style={styles.mapPickerContent}>
                  <View style={styles.mapThumbWrap}>
                    <OSMMap
                      style={styles.mapThumb}
                      initialRegion={{
                        latitude: location.latitude,
                        longitude: location.longitude,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
                      }}
                      interactive={false}
                    />
                    {/* Static pin overlay on thumbnail */}
                    <View style={styles.mapThumbPin} pointerEvents="none">
                      <MapPinIcon size={20} color={COLORS.primary} strokeWidth={2.5} />
                    </View>
                  </View>
                  <View style={styles.mapPickerInfo}>
                    <Text style={styles.mapPickerCity} numberOfLines={1}>{location.city}</Text>
                    <Text style={styles.mapPickerGov} numberOfLines={1}>{location.governorate}</Text>
                    <Text style={styles.mapPickerCoords}>
                      {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    </Text>
                  </View>
                  <View style={styles.mapPickerChange}>
                    <Text style={styles.mapPickerChangeText}>{t.inv_app_map_change}</Text>
                  </View>
                </View>
              ) : (
                /* No location yet */
                <View style={styles.mapPickerEmpty}>
                  <View style={styles.mapPickerEmptyIcon}>
                    <MapPinIcon size={26} color={COLORS.primary} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mapPickerEmptyTitle}>{t.inv_app_map_pick}</Text>
                    <Text style={styles.mapPickerEmptySub}>{t.inv_app_map_not_picked}</Text>
                  </View>
                  <ChevronRightIcon size={18} color={COLORS.textTertiary} strokeWidth={2} />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Station Name ─────────────────────────────────────── */}
          <SectionHeader icon={<ZapIcon size={16} color={COLORS.primary} strokeWidth={2} />} title={t.inv_app_station_name} />
          <View style={styles.card}>
            <FormField label={t.inv_app_station_name} last>
              <TextInput style={styles.input} value={stationName} onChangeText={setStationName}
                placeholder={t.inv_app_station_name_ph} placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="words" returnKeyType="next" />
            </FormField>
          </View>

          {/* ── Charger Details ──────────────────────────────────── */}
          <SectionHeader icon={<ZapIcon size={16} color={COLORS.primary} strokeWidth={2} />} title={t.inv_app_charger} />
          <View style={styles.card}>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>
                {t.inv_app_charger_type} <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.chipRow}>
                {CHARGER_TYPES.map(ct => (
                  <TouchableOpacity
                    key={ct}
                    style={[styles.chip, chargerType === ct && styles.chipActive]}
                    onPress={() => setChargerType(ct)}
                    activeOpacity={0.7}
                  >
                    {chargerType === ct && <CheckIcon size={11} color={COLORS.primary} strokeWidth={3} />}
                    <Text style={[styles.chipText, chargerType === ct && styles.chipTextActive]}>{ct}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <FormField label={t.inv_app_power} last>
              <TextInput style={styles.input} value={powerKw} onChangeText={setPowerKw}
                placeholder={t.inv_app_power_ph} placeholderTextColor={COLORS.textTertiary}
                keyboardType="decimal-pad" returnKeyType="next" />
            </FormField>
          </View>

          {/* ── Government Requirements ──────────────────────────── */}
          <SectionHeader icon={<ShieldIcon size={16} color={COLORS.primary} strokeWidth={2} />} title={t.inv_app_gov_req} />
          <View style={styles.card}>
            <FormField label={t.inv_app_elec_form} required>
              <TextInput style={styles.input} value={electricityForm} onChangeText={setElectricityForm}
                placeholder={t.inv_app_elec_form_ph} placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="words" returnKeyType="next" />
            </FormField>
            <FormField label={t.inv_app_commercial_reg} required>
              <TextInput style={styles.input} value={commercialReg} onChangeText={setCommercialReg}
                placeholder={t.inv_app_commercial_reg_ph} placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="characters" returnKeyType="next" />
            </FormField>
            <FormField label={t.inv_app_id_card} required last>
              <TextInput style={styles.input} value={idCard} onChangeText={setIdCard}
                placeholder={t.inv_app_id_card_ph} placeholderTextColor={COLORS.textTertiary}
                keyboardType="number-pad" returnKeyType="done" />
            </FormField>
          </View>

          {/* Submit */}
          <View style={{ marginHorizontal: 16, marginTop: 24 }}>
            <GradientButton
              label={t.inv_app_submit}
              variant="gold"
              onPress={handleSubmit}
              loading={submitting}
              disabled={!isValid}
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Map Picker Modal ─────────────────────────────────────── */}
      <LocationPickerModal
        visible={mapVisible}
        initial={location ? { latitude: location.latitude, longitude: location.longitude } : null}
        onConfirm={(picked) => { setLocation(picked); setMapVisible(false); }}
        onClose={() => setMapVisible(false)}
        t={t}
      />
    </SafeAreaView>
  );
}

// ── Location Picker Modal ──────────────────────────────────────

function LocationPickerModal({ visible, initial, onConfirm, onClose, t }: {
  visible: boolean;
  initial: { latitude: number; longitude: number } | null;
  onConfirm: (loc: PickedLocation) => void;
  onClose: () => void;
  t: any;
}) {
  const mapRef = useRef<OSMMapHandle>(null);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [region, setRegion] = useState<Region>(
    initial
      ? { ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : OMAN_REGION
  );
  const [geocoded, setGeocoded] = useState<{ governorate: string; city: string; address: string } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [locating,  setLocating]  = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (!visible) return;
    const r = initial
      ? { ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : OMAN_REGION;
    setRegion(r);
    setGeocoded(null);
    doReverseGeocode(r.latitude, r.longitude);
  }, [visible]);

  const doReverseGeocode = async (lat: number, lon: number) => {
    setDetecting(true);
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (results.length > 0) {
        const r = results[0];
        const gov  = r.region ?? r.subregion ?? r.city ?? '';
        const city = r.city ?? r.district ?? r.subregion ?? gov;
        const addr = [r.name, r.street, city].filter(Boolean).join(', ');
        setGeocoded({ governorate: gov, city, address: addr || `${lat.toFixed(4)}, ${lon.toFixed(4)}` });
      }
    } catch {
      setGeocoded({ governorate: '', city: '', address: `${lat.toFixed(5)}, ${lon.toFixed(5)}` });
    } finally {
      setDetecting(false);
    }
  };

  const handleRegionChangeComplete = (r: Region) => {
    setRegion(r);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(() => doReverseGeocode(r.latitude, r.longitude), 700);
  };

  const handleMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('', t.inv_app_map_no_permission);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const newRegion: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      mapRef.current?.animateToRegion(newRegion, 600);
      setRegion(newRegion);
      doReverseGeocode(loc.coords.latitude, loc.coords.longitude);
    } finally {
      setLocating(false);
    }
  };

  const handleConfirm = () => {
    onConfirm({
      latitude: region.latitude,
      longitude: region.longitude,
      governorate: geocoded?.governorate ?? '',
      city: geocoded?.city ?? '',
      address: geocoded?.address ?? `${region.latitude.toFixed(5)}, ${region.longitude.toFixed(5)}`,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={mapStyles.container}>
        {/* Map — free OpenStreetMap (no API key); see OSMMap.tsx */}
        <OSMMap
          ref={mapRef}
          style={mapStyles.map}
          initialRegion={region}
          onRegionChangeComplete={handleRegionChangeComplete}
          showsUserLocation
        />

        {/* Fixed center pin — stays still while map moves */}
        <View style={mapStyles.pinWrap} pointerEvents="none">
          <MapPinIcon size={44} color={COLORS.primary} strokeWidth={2} />
          <View style={mapStyles.pinShadow} />
        </View>

        {/* Top bar */}
        <SafeAreaView style={mapStyles.topBar} edges={['top']}>
          <View style={mapStyles.topBarInner}>
            <TouchableOpacity style={mapStyles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <XIcon size={20} color={COLORS.text} strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={mapStyles.topBarCenter}>
              <Text style={mapStyles.topBarTitle}>{t.inv_app_map_title}</Text>
              <Text style={mapStyles.topBarSub}>{t.inv_app_map_subtitle}</Text>
            </View>
          </View>
        </SafeAreaView>

        {/* My Location button */}
        <TouchableOpacity style={mapStyles.locateBtn} onPress={handleMyLocation} activeOpacity={0.85}>
          {locating
            ? <ActivityIndicator color={COLORS.primary} size="small" />
            : <LocateIcon size={20} color={COLORS.primary} strokeWidth={2} />
          }
        </TouchableOpacity>

        {/* Bottom card */}
        <View style={mapStyles.bottomCard}>
          <View style={mapStyles.bottomHandle} />

          {detecting ? (
            <View style={mapStyles.detectingRow}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={mapStyles.detectingText}>{t.inv_app_map_detecting}</Text>
            </View>
          ) : geocoded ? (
            <View style={mapStyles.locationInfo}>
              <View style={mapStyles.locationIconWrap}>
                <MapPinIcon size={20} color={COLORS.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={mapStyles.locationCity} numberOfLines={1}>
                  {geocoded.city || geocoded.address}
                </Text>
                <Text style={mapStyles.locationGov} numberOfLines={1}>
                  {geocoded.governorate}
                </Text>
                <Text style={mapStyles.locationCoords}>
                  {region.latitude.toFixed(5)}, {region.longitude.toFixed(5)}
                </Text>
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[mapStyles.confirmBtn, detecting && mapStyles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={detecting}
            activeOpacity={0.9}
          >
            <CheckIcon size={18} color="#fff" strokeWidth={2.5} />
            <Text style={mapStyles.confirmBtnText}>{t.inv_app_map_confirm}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>{icon}</View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function FormField({ label, required, last, children }: {
  label: string; required?: boolean; last?: boolean; children: React.ReactNode;
}) {
  return (
    <View style={[styles.fieldWrap, last && styles.fieldWrapLast]}>
      <Text style={styles.fieldLabel}>
        {label}{required && <Text style={styles.required}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerBack:  { fontSize: 20, color: COLORS.primary, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },

  hero: {
    alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20,
    backgroundColor: COLORS.primaryDark, gap: 6,
  },
  heroIconWrap: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: 'rgba(245,158,11,0.18)', borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.35)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroSub:   { fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 20, marginBottom: 6,
  },
  sectionIconWrap: { width: 28, height: 28, borderRadius: 9, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, flex: 1 },

  card: { backgroundColor: COLORS.card, borderRadius: 18, marginHorizontal: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },

  fieldWrap:     { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  fieldWrapLast: { borderBottomWidth: 0 },
  fieldLabel:    { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  required:      { color: COLORS.error },
  input: {
    fontSize: 15, color: COLORS.text,
    paddingVertical: Platform.OS === 'ios' ? 4 : 2, minHeight: 36,
  },

  // Map picker button
  mapPickerBtn: { overflow: 'hidden' },
  mapPickerEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
  },
  mapPickerEmptyIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  mapPickerEmptyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  mapPickerEmptySub:   { fontSize: 12, color: COLORS.textSecondary },

  mapPickerContent: { flexDirection: 'row', alignItems: 'center' },
  mapThumbWrap: { width: 90, height: 80, position: 'relative', overflow: 'hidden' },
  mapThumb:     { width: '100%', height: '100%' },
  mapThumbPin:  {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 10,
    alignItems: 'center', justifyContent: 'flex-end',
  },
  mapPickerInfo:  { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  mapPickerCity:  { fontSize: 14, fontWeight: '700', color: COLORS.text },
  mapPickerGov:   { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  mapPickerCoords:{ fontSize: 10, color: COLORS.textTertiary, marginTop: 3, fontVariant: ['tabular-nums'] },
  mapPickerChange:{ paddingRight: 14, paddingVertical: 12 },
  mapPickerChangeText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // Charger type chips
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.background },
  chipActive:    { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  chipText:      { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive:{ color: COLORS.primary },

  // Submit
  submitBtn:         { marginHorizontal: 16, marginTop: 24, backgroundColor: COLORS.gold, borderRadius: 18, paddingVertical: 16, alignItems: 'center', shadowColor: COLORS.gold, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 5 },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText:     { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Success
  successWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  successIconWrap: { width: 88, height: 88, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8, shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 6 }, shadowRadius: 16, elevation: 8 },
  successTitle:    { fontSize: 24, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  successSub:      { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  successSteps:    { width: '100%', backgroundColor: COLORS.card, borderRadius: 18, padding: 16, gap: 12, marginTop: 8, borderWidth: 1, borderColor: COLORS.border },
  stepRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum:         { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primaryBg, borderWidth: 1.5, borderColor: COLORS.primaryTint, alignItems: 'center', justifyContent: 'center' },
  stepNumText:     { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  stepLabel:       { fontSize: 14, color: COLORS.text, flex: 1, fontWeight: '500' },
  backBtn:         { marginTop: 8, backgroundColor: COLORS.primaryDark, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  backBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ── Map modal styles ───────────────────────────────────────────

const mapStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map:       { flex: 1 },

  // Fixed center pin
  pinWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    // Offset upward by half the pin height so the tip of the pin is at dead center
    marginBottom: 44,
  },
  pinShadow: {
    width: 8, height: 4, borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginTop: -2,
  },

  // Top bar
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
  },
  topBarInner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    marginHorizontal: 16, marginTop: 8,
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.10, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 6,
    gap: 10,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  topBarCenter: { flex: 1 },
  topBarTitle:  { fontSize: 15, fontWeight: '800', color: COLORS.text },
  topBarSub:    { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },

  // My location button
  locateBtn: {
    position: 'absolute', right: 16, bottom: 210,
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },

  // Bottom card
  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 12,
    shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: -4 }, shadowRadius: 16, elevation: 20,
  },
  bottomHandle: { width: 40, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },

  detectingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  detectingText:{ fontSize: 14, color: COLORS.textSecondary },

  locationInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, backgroundColor: COLORS.primaryBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.primaryTint },
  locationIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.primaryTint },
  locationCity:   { fontSize: 15, fontWeight: '700', color: COLORS.text },
  locationGov:    { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  locationCoords: { fontSize: 10, color: COLORS.textTertiary, marginTop: 3, fontVariant: ['tabular-nums'] },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 18, paddingVertical: 16,
    shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 6,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
