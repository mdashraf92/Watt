/**
 * AuthHeader — brand gradient hero used by SignIn / SignUp.
 * Green→deep-green gradient, floating decor orbs, real GO WATT mark,
 * language toggle, animated title/subtitle.
 */
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { COLORS, GRADIENTS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { GoWattIcon } from './Logo';
import { GlobeIcon } from './icons';

export default function AuthHeader({
  title,
  subtitle,
  languageLabel,
  onToggleLanguage,
  isRTL,
}: {
  title: string;
  subtitle: string;
  languageLabel: string;
  onToggleLanguage: () => void;
  isRTL: boolean;
}) {
  return (
    <LinearGradient
      colors={GRADIENTS.greenDeep}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <View style={styles.deco1} />
      <View style={styles.deco2} />
      <View style={[styles.boltGlow]} />

      <TouchableOpacity
        style={[styles.langBtn, isRTL ? styles.langBtnRtl : styles.langBtnLtr]}
        onPress={onToggleLanguage}
        activeOpacity={0.8}
      >
        <GlobeIcon size={14} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        <Text style={styles.langBtnText}>{languageLabel}</Text>
      </TouchableOpacity>

      <Animated.View entering={FadeIn.duration(500)} style={[styles.logoRow, isRTL && styles.rowReverse]}>
        <View style={styles.logoBadge}>
          <GoWattIcon size={38} />
        </View>
      </Animated.View>

      <Animated.Text
        entering={FadeInDown.delay(120).duration(500)}
        style={[styles.title, isRTL && styles.rtlText]}
      >
        {title}
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.delay(200).duration(500)}
        style={[styles.subtitle, isRTL && styles.rtlText]}
      >
        {subtitle}
      </Animated.Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'ios' ? 64 : 46,
    paddingBottom: 30,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  deco1: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.06)', top: -70, right: -60 },
  deco2: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -50, left: -40 },
  boltGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(244,165,60,0.16)', top: -40, left: '30%' },

  langBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 64 : 46,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 10,
  },
  langBtnLtr: { right: 20 },
  langBtnRtl: { left: 20 },
  langBtnText: { fontFamily: FONTS.semibold, fontSize: 12, color: 'rgba(255,255,255,0.9)' },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 },
  logoBadge: {
    width: 58, height: 58, borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  title: { fontFamily: FONTS.bold, fontSize: 28, color: '#fff', marginBottom: 5 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },

  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rowReverse: { flexDirection: 'row-reverse' },
});
