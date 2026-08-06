/**
 * MobileChargeSummaryScreen — receipt and driver rating after a callout.
 *
 * Mirrors SessionSummaryScreen so a mobile charge and a station charge end the
 * same way, but the receipt splits out the callout fee: the customer paid for a
 * van to drive to them, and hiding that inside a per-kWh figure would make the
 * energy look wildly overpriced.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Share, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import GradientButton from '../components/GradientButton';
import { api } from '../lib/api';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import type { CustomerStackParamList, MobileChargeRequest } from '../types';
import { CheckIcon, ZapIcon, LeafIcon, StarIcon, ShareIcon } from '../components/icons';

type Nav   = NativeStackNavigationProp<CustomerStackParamList, 'MobileChargeSummary'>;
type Route = RouteProp<CustomerStackParamList, 'MobileChargeSummary'>;

export default function MobileChargeSummaryScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { requestId, kwh, cost } = route.params;
  const { t, isRTL } = useLang();

  const [req, setReq]       = useState<MobileChargeRequest | null>(null);
  const [stars, setStars]   = useState(0);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(false);
  const [rated, setRated]   = useState(false);

  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 55, friction: 7 }).start();
    api.mobile.get(requestId).then(setReq).catch(() => {});
  }, [requestId, scale]);

  const align  = isRTL ? 'right' as const : 'left' as const;
  const rowDir = isRTL ? 'row-reverse' as const : 'row' as const;
  const locale = isRTL ? 'ar-OM' : 'en-OM';

  // Fall back to the navigation params until the fetch lands, so the receipt is
  // never blank — the figures were already known when we got here.
  const kwhFinal    = Number(req?.kwh_delivered ?? kwh);
  const costFinal   = Number(req?.cost ?? cost);
  const calloutFee  = Number(req?.callout_fee ?? 0);
  const energyCost  = Math.max(costFinal - calloutFee, 0);
  const co2Saved    = kwhFinal * 0.5;

  const when = req?.ended_at ? new Date(req.ended_at) : new Date();
  const dateStr = when.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const submitRating = async () => {
    if (stars < 1) return;
    setRating(true);
    try {
      await api.mobile.rate(requestId, stars, comment.trim() || undefined);
      setRated(true);
    } catch { /* leave un-rated; not worth blocking the receipt over */ }
    finally { setRating(false); }
  };

  const shareReceipt = async () => {
    const lines = [
      `GO WATT — ${t.mc_receipt_header}`,
      '',
      `${t.session_receipt_date}: ${dateStr} · ${timeStr}`,
      `${t.mc_receipt_delivered}: ${kwhFinal.toFixed(2)} kWh`,
      `${t.mc_receipt_callout}: ${calloutFee.toFixed(3)} OMR`,
      `${t.mc_receipt_energy}: ${energyCost.toFixed(3)} OMR`,
      `${t.mc_receipt_total}: ${costFinal.toFixed(3)} OMR`,
      `${t.session_receipt_co2}: ${co2Saved.toFixed(1)} kg`,
    ];
    try { await Share.share({ message: lines.join('\n') }); }
    catch { /* user dismissed the share sheet */ }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.headerSection}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <View style={styles.checkOuter}>
              <CheckIcon size={44} color="#fff" strokeWidth={3} />
            </View>
          </Animated.View>
          <Text style={styles.title}>{t.mc_summary_title}</Text>
          <Text style={styles.subtitle}>{t.mc_summary_sub}</Text>
        </View>

        {/* Receipt */}
        <View style={styles.receipt}>
          <View style={[styles.receiptHeader, { flexDirection: rowDir }]}>
            <View style={[styles.brand, { flexDirection: rowDir }]}>
              <ZapIcon size={14} color={COLORS.primary} strokeWidth={2.5} />
              <Text style={styles.brandTxt}>Go Watt</Text>
            </View>
            <Text style={styles.receiptLabel}>{t.mc_receipt_header}</Text>
          </View>

          <Row dir={rowDir} align={align} k={t.session_receipt_date} v={`${dateStr} · ${timeStr}`} />
          {!!req?.address_text && <Row dir={rowDir} align={align} k={t.mc_address_label} v={req.address_text} />}

          <View style={styles.dashed} />

          <Row dir={rowDir} align={align} k={t.mc_receipt_delivered} v={`${kwhFinal.toFixed(2)} kWh`} />
          <Row dir={rowDir} align={align} k={t.mc_receipt_callout}   v={`${calloutFee.toFixed(3)} OMR`} />
          <Row dir={rowDir} align={align} k={t.mc_receipt_energy}    v={`${energyCost.toFixed(3)} OMR`} />

          <View style={styles.dashed} />

          <View style={[styles.totalRow, { flexDirection: rowDir }]}>
            <Text style={styles.totalKey}>{t.mc_receipt_total}</Text>
            <Text style={styles.totalVal}>{costFinal.toFixed(3)} OMR</Text>
          </View>

          <View style={[styles.co2, { flexDirection: rowDir }]}>
            <LeafIcon size={15} color={COLORS.primary} strokeWidth={2} />
            <Text style={styles.co2Txt}>{t.session_receipt_co2}: {co2Saved.toFixed(1)} kg</Text>
          </View>
        </View>

        {/* Rate the driver */}
        <View style={styles.rateCard}>
          <Text style={[styles.rateTitle, { textAlign: align }]}>{t.mc_rate_title}</Text>
          <View style={[styles.stars, { flexDirection: rowDir }]}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => !rated && setStars(n)} disabled={rated} hitSlop={6}>
                <StarIcon
                  size={32}
                  color={n <= stars ? COLORS.gold : COLORS.borderStrong}
                  filled={n <= stars}
                />
              </TouchableOpacity>
            ))}
          </View>
          {!rated && stars > 0 && (
            <>
              <TextInput
                style={[styles.comment, { textAlign: align }]}
                placeholder={t.rate_comment_ph}
                placeholderTextColor={COLORS.textTertiary}
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={500}
              />
              <TouchableOpacity style={styles.rateBtn} onPress={submitRating} disabled={rating}>
                {rating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.rateBtnTxt}>{t.rate_submit}</Text>}
              </TouchableOpacity>
            </>
          )}
          {rated && (
            <View style={[styles.thanks, { flexDirection: rowDir }]}>
              <CheckIcon size={16} color={COLORS.primary} strokeWidth={3} />
              <Text style={styles.thanksTxt}>{t.rate_thanks}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={[styles.shareBtn, { flexDirection: rowDir }]} onPress={shareReceipt}>
          <ShareIcon size={17} color={COLORS.primary} strokeWidth={2} />
          <Text style={styles.shareTxt}>{t.session_share}</Text>
        </TouchableOpacity>

        <GradientButton label={t.session_summary_done} onPress={() => navigation.popToTop()} style={{ marginTop: 12 }} />
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ k, v, dir, align }: {
  k: string; v: string; dir: 'row' | 'row-reverse'; align: 'left' | 'right';
}) {
  return (
    <View style={[styles.row, { flexDirection: dir }]}>
      <Text style={[styles.rowKey, { textAlign: align }]}>{k}</Text>
      <Text style={[styles.rowVal, { textAlign: align === 'left' ? 'right' : 'left' }]} numberOfLines={2}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20 },

  headerSection: { alignItems: 'center', marginBottom: 22, marginTop: 8 },
  checkOuter: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text },
  subtitle: { fontFamily: FONTS.regular, fontSize: 13.5, color: COLORS.textSecondary, marginTop: 4 },

  receipt: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 18,
  },
  receiptHeader: {
    justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 10,
  },
  brand: { alignItems: 'center', gap: 6 },
  brandTxt: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.primary },
  receiptLabel: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary },

  row: { justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5, gap: 12 },
  rowKey: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, flexShrink: 0 },
  rowVal: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text, flex: 1 },
  dashed: { height: 1, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: COLORS.borderStrong, marginVertical: 10 },

  totalRow: { justifyContent: 'space-between', alignItems: 'center' },
  totalKey: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text },
  totalVal: { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.primary },
  co2: {
    alignItems: 'center', gap: 7, marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  co2Txt: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.primary },

  rateCard: {
    backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    padding: 18, marginTop: 14,
  },
  rateTitle: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text, marginBottom: 12 },
  stars: { justifyContent: 'center', gap: 10 },
  comment: {
    backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 12, marginTop: 14, minHeight: 64, textAlignVertical: 'top',
    fontFamily: FONTS.regular, fontSize: 13.5, color: COLORS.text,
  },
  rateBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginTop: 12,
  },
  rateBtnTxt: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  thanks: { alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 },
  thanksTxt: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.primary },

  shareBtn: {
    alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16,
    paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.primaryTint,
    backgroundColor: COLORS.card,
  },
  shareTxt: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary },
});
