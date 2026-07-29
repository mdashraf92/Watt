/**
 * ComingSoonCard — a teaser tile for an upcoming feature with a "Notify me"
 * (waitlist) capture. Bilingual/RTL-aware via the `isRTL` flag.
 *
 * Pass `onDismiss` to show an X that lets the user hide the teaser for good.
 * It sits last in `topRow`, so `row-reverse` puts it on the far left in RTL and
 * the far right in LTR — always the corner opposite the emoji.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { CheckIcon, BellIcon, XIcon } from './icons';

export default function ComingSoonCard({
  emoji,
  title,
  subtitle,
  badge,
  notifyLabel,
  notifiedLabel,
  joined,
  onNotify,
  onDismiss,
  dismissLabel,
  isRTL,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  badge: string;
  notifyLabel: string;
  notifiedLabel: string;
  joined: boolean;
  onNotify: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  isRTL: boolean;
}) {
  const align = { textAlign: (isRTL ? 'right' : 'left') as 'left' | 'right', writingDirection: (isRTL ? 'rtl' : 'ltr') as 'rtl' | 'ltr' };
  return (
    <View style={styles.card}>
      <View style={styles.glow} />
      <View style={[styles.topRow, isRTL && styles.rowRev]}>
        <LinearGradient colors={GRADIENTS.greenDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconWrap}>
          <Text style={styles.emoji}>{emoji}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <View style={[styles.badge, isRTL && styles.badgeRtl]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
          <Text style={[styles.title, align]}>{title}</Text>
        </View>
        {onDismiss && (
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.dismissBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
            activeOpacity={0.6}
          >
            <XIcon size={16} color={COLORS.textSecondary} strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.subtitle, align]}>{subtitle}</Text>

      <TouchableOpacity
        style={[styles.notifyBtn, joined && styles.notifyBtnDone]}
        onPress={onNotify}
        disabled={joined}
        activeOpacity={0.85}
      >
        {joined
          ? <CheckIcon size={16} color={COLORS.primary} strokeWidth={2.5} />
          : <BellIcon size={16} color="#fff" strokeWidth={2} />}
        <Text style={[styles.notifyText, joined && styles.notifyTextDone]}>
          {joined ? notifiedLabel : notifyLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    gap: 12,
  },
  glow: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(244,165,60,0.10)', top: -50, right: -30,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowRev: { flexDirection: 'row-reverse' },
  iconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 26 },
  dismissBtn: {
    alignSelf: 'flex-start',
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primaryBg,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.goldTint,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 5,
  },
  badgeRtl: { alignSelf: 'flex-end' },
  badgeText: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.goldDark, letterSpacing: 0.5 },
  title: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text },
  subtitle: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  notifyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  notifyBtnDone: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primaryTint },
  notifyText: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  notifyTextDone: { color: COLORS.primary },
});
