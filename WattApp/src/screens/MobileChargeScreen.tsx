/**
 * MobileChargeScreen — call a charging van to where you are stranded.
 *
 * The whole screen is built around one anxiety: the customer is stopped
 * somewhere with a flat battery. So the pin defaults to their GPS position, the
 * price is shown in full before they commit, and the wallet shortfall is
 * recovered from a saved card in place rather than bouncing them to the wallet
 * tab and losing the request.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import OSMMap, { OSMMapHandle, OSMRegion } from '../components/OSMMap';
import GradientButton from '../components/GradientButton';
import { api, ApiError } from '../lib/api';
import { coverShortfall, parseInsufficient } from '../lib/cardPay';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import type { CustomerStackParamList, MobileChargeConfig } from '../types';
import {
  ArrowLeftIcon, LocateIcon, MapPinIcon, ZapIcon, WalletIcon, InfoIcon,
} from '../components/icons';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'MobileCharge'>;

// Muscat, used only until the real fix arrives.
const FALLBACK: OSMRegion = {
  latitude: 23.5880, longitude: 58.3829, latitudeDelta: 0.05, longitudeDelta: 0.05,
};

// Rough real-world consumption for turning kWh into "how far will this get me".
// Deliberately conservative — over-promising range to someone already stranded
// is the one error that matters here.
const KM_PER_KWH = 5.5;

export default function MobileChargeScreen() {
  const navigation = useNavigation<Nav>();
  const { t, isRTL } = useLang();
  const mapRef = useRef<OSMMapHandle>(null);

  const [config, setConfig]     = useState<MobileChargeConfig | null>(null);
  const [loading, setLoading]   = useState(true);
  const [locating, setLocating] = useState(false);
  const [region, setRegion]     = useState<OSMRegion>(FALLBACK);
  const [pin, setPin]           = useState<{ latitude: number; longitude: number } | null>(null);
  const [kwh, setKwh]           = useState(10);
  const [address, setAddress]   = useState('');
  const [notes, setNotes]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;

  useEffect(() => {
    (async () => {
      const cfg = await api.mobile.config().catch(() => null);
      if (cfg) {
        setConfig(cfg);
        // Start the slider in the middle of what is allowed rather than at a
        // hardcoded 10, which may sit outside the configured range.
        setKwh(Math.round((cfg.min_kwh + cfg.max_kwh) / 2));
      }
      setLoading(false);
      locate();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If a job is already live, this screen is the wrong place to be.
  useEffect(() => {
    (async () => {
      const active = await api.mobile.active().catch(() => null);
      if (active) navigation.replace('MobileChargeTracking', { requestId: active.id });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = {
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        latitudeDelta: 0.01, longitudeDelta: 0.01,
      };
      setRegion(next);
      setPin({ latitude: next.latitude, longitude: next.longitude });
      mapRef.current?.animateToRegion(next);
    } catch { /* keep whatever pin the user has already placed */ }
    finally { setLocating(false); }
  }, []);

  // The pin is the centre of the map — the user aims the map, not a draggable
  // marker, which is far easier one-handed at the roadside.
  const onRegionChange = (r: OSMRegion) => setPin({ latitude: r.latitude, longitude: r.longitude });

  const energyCost = config ? kwh * config.price_per_kwh : 0;
  const total      = config ? config.callout_fee + energyCost : 0;
  const hold       = config ? total * config.hold_buffer : 0;

  const submit = async () => {
    if (!pin || !config) return;
    setSubmitting(true);
    try {
      let res;
      try {
        res = await api.mobile.request({
          latitude: pin.latitude, longitude: pin.longitude, kwh,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } catch (err: any) {
        const short = parseInsufficient(err?.message);
        const isShort = (err instanceof ApiError && err.code === 'insufficient_balance') || short != null;
        if (!isShort) throw err;

        // Top the wallet up from the saved card and retry, rather than sending
        // a stranded customer off to the wallet screen.
        const outcome = await coverShortfall(short ?? 0);
        if (outcome === 'no_card') {
          Alert.alert(
            t.charging_insufficient_title,
            `${t.charging_insufficient_msg} ${(short ?? 0).toFixed(3)} OMR`,
            [{ text: t.cancel, style: 'cancel' },
             { text: t.booking_top_up, onPress: () => navigation.navigate('Tabs', { screen: 'Wallet' }) }],
          );
          return;
        }
        if (outcome === 'failed') return;   // bank UI already told them why
        res = await api.mobile.request({
          latitude: pin.latitude, longitude: pin.longitude, kwh,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
      navigation.replace('MobileChargeTracking', { requestId: res.request_id });
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      Alert.alert(
        t.error,
        msg.startsWith('OUT_OF_AREA')     ? t.mc_err_area
        : msg.startsWith('OUT_OF_RANGE')  ? t.mc_err_range
        : msg.startsWith('ALREADY_ACTIVE') ? t.mc_err_active
        : msg.startsWith('DISABLED')      ? t.mc_disabled_sub
        : t.mc_err_generic,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }

  const blocked = !config?.enabled ? 'disabled' : config.vans_on_duty === 0 ? 'no_vans' : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ArrowLeftIcon size={22} color={COLORS.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: align }]}>{t.mc_title}</Text>
      </View>

      {blocked && (
        <View style={styles.banner}>
          <InfoIcon size={18} color={COLORS.goldDark} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { textAlign: align }]}>
              {blocked === 'disabled' ? t.mc_disabled_title : t.mc_no_vans_title}
            </Text>
            <Text style={[styles.bannerBody, { textAlign: align }]}>
              {blocked === 'disabled' ? t.mc_disabled_sub : t.mc_no_vans_sub}
            </Text>
          </View>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Where */}
          <Text style={[styles.sectionTitle, { textAlign: align }]}>{t.mc_where_title}</Text>
          <Text style={[styles.sectionSub, { textAlign: align }]}>{t.mc_where_sub}</Text>

          <View style={styles.mapWrap}>
            <OSMMap
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              onRegionChangeComplete={onRegionChange}
              showsUserLocation
            />
            {/* Centre pin, drawn over the map — the map moves under it. */}
            <View pointerEvents="none" style={styles.centrePin}>
              <MapPinIcon size={38} color={COLORS.primary} strokeWidth={2.2} />
            </View>
            <TouchableOpacity style={styles.locateBtn} onPress={locate} disabled={locating}>
              {locating
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <LocateIcon size={20} color={COLORS.primary} strokeWidth={2} />}
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.input, { textAlign: align }]}
            placeholder={t.mc_address_ph}
            placeholderTextColor={COLORS.textTertiary}
            value={address}
            onChangeText={setAddress}
            maxLength={300}
          />
          <TextInput
            style={[styles.input, styles.inputMulti, { textAlign: align }]}
            placeholder={t.mc_notes_ph}
            placeholderTextColor={COLORS.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={500}
          />

          {/* How much */}
          <Text style={[styles.sectionTitle, { textAlign: align, marginTop: 22 }]}>{t.mc_kwh_title}</Text>
          <Text style={[styles.sectionSub, { textAlign: align }]}>{t.mc_kwh_hint}</Text>

          <View style={styles.kwhCard}>
            <View style={[styles.kwhRow, { flexDirection: rowDir }]}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setKwh(k => Math.max((config?.min_kwh ?? 5), k - 5))}
                disabled={!config || kwh <= config.min_kwh}
              >
                <Text style={styles.stepTxt}>−</Text>
              </TouchableOpacity>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.kwhValue}>{kwh}</Text>
                <Text style={styles.kwhUnit}>{t.mc_kwh_unit}</Text>
              </View>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setKwh(k => Math.min((config?.max_kwh ?? 30), k + 5))}
                disabled={!config || kwh >= config.max_kwh}
              >
                <Text style={styles.stepTxt}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.kwhRange}>
              {t.mc_kwh_range.replace('{min}', String(config?.min_kwh ?? 5)).replace('{max}', String(config?.max_kwh ?? 30))}
            </Text>
            <Text style={styles.kwhKm}>
              {t.mc_km_estimate.replace('{km}', String(Math.round(kwh * KM_PER_KWH)))}
            </Text>
          </View>

          {/* Price — shown in full before anyone commits to anything. */}
          <Text style={[styles.sectionTitle, { textAlign: align, marginTop: 22 }]}>{t.mc_price_title}</Text>
          <View style={styles.priceCard}>
            <View style={[styles.priceRow, { flexDirection: rowDir }]}>
              <Text style={styles.priceKey}>{t.mc_price_callout}</Text>
              <Text style={styles.priceVal}>{(config?.callout_fee ?? 0).toFixed(3)} OMR</Text>
            </View>
            <View style={[styles.priceRow, { flexDirection: rowDir }]}>
              <Text style={styles.priceKey}>
                {t.mc_price_energy} · {kwh} × {(config?.price_per_kwh ?? 0).toFixed(3)}
              </Text>
              <Text style={styles.priceVal}>{energyCost.toFixed(3)} OMR</Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={[styles.priceRow, { flexDirection: rowDir }]}>
              <Text style={styles.priceTotalKey}>{t.mc_price_total}</Text>
              <Text style={styles.priceTotalVal}>{total.toFixed(3)} OMR</Text>
            </View>
            <View style={[styles.holdNote, { flexDirection: rowDir }]}>
              <WalletIcon size={15} color={COLORS.textSecondary} strokeWidth={2} />
              <Text style={[styles.holdText, { textAlign: align }]}>
                {t.mc_hold_note.replace('{amount}', hold.toFixed(3))}
              </Text>
            </View>
          </View>

          <GradientButton
            label={submitting ? t.mc_requesting : t.mc_confirm}
            onPress={submit}
            loading={submitting}
            disabled={!!blocked || !pin || submitting}
            icon={<ZapIcon size={18} color="#fff" strokeWidth={2.5} />}
            style={{ marginTop: 22 }}
          />
          <View style={{ height: 28 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text },

  banner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.goldBg, padding: 14, margin: 16, marginBottom: 0, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.goldTint,
  },
  bannerTitle: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.goldDark },
  bannerBody: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 18, marginTop: 2 },

  scroll: { padding: 16 },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text, marginBottom: 4 },
  sectionSub: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 12 },

  mapWrap: {
    height: 240, borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundAlt,
  },
  centrePin: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
    // Lift the glyph so its point, not its centre, marks the spot.
    paddingBottom: 34,
  },
  locateBtn: {
    position: 'absolute', bottom: 12, right: 12,
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  input: {
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 12,
    fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },

  kwhCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    padding: 16, alignItems: 'center',
  },
  kwhRow: { alignItems: 'center', alignSelf: 'stretch', gap: 12 },
  stepBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTxt: { fontFamily: FONTS.bold, fontSize: 24, color: COLORS.primary, lineHeight: 28 },
  kwhValue: { fontFamily: FONTS.bold, fontSize: 40, color: COLORS.text, lineHeight: 46 },
  kwhUnit: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textSecondary },
  kwhRange: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textTertiary, marginTop: 10 },
  kwhKm: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.primary, marginTop: 4 },

  priceCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  priceRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  priceKey: { fontFamily: FONTS.regular, fontSize: 13.5, color: COLORS.textSecondary, flexShrink: 1 },
  priceVal: { fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.text },
  priceDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  priceTotalKey: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text },
  priceTotalVal: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.primary },
  holdNote: {
    gap: 8, alignItems: 'flex-start', marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  holdText: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
});
