import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/colors';
import { useLang } from '../context/LanguageContext';

export function PackageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t, isRTL } = useLang();
  return <View style={[packageStyles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
    <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t.a11y_back} style={packageStyles.back}>
      <Text style={packageStyles.cardTitle}>{isRTL ? '→' : '←'}</Text>
    </Pressable>
    <Text style={packageStyles.cardTitle}>{title}</Text>
  </View>;
}

export function PackageSkeleton() {
  return <View style={packageStyles.card}>
    {[75, 100, 50].map(width => <View key={width} style={{ height: 22, width: `${width}%`, borderRadius: 8, backgroundColor: COLORS.backgroundAlt }} />)}
  </View>;
}

export const packageStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: { alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  back: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 20, paddingBottom: 40, gap: 16 },
  intro: { gap: 10, paddingBottom: 8 },
  eyebrow: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800' },
  card: { backgroundColor: COLORS.card, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  cardTitle: { color: COLORS.text, fontSize: 19, fontWeight: '700' },
  benefit: { color: COLORS.primary, fontSize: 16, fontWeight: '600' },
  body: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 23 },
  small: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  allowance: { backgroundColor: COLORS.background, borderRadius: 14, padding: 14, gap: 6 },
  price: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  notice: { color: COLORS.textSecondary, backgroundColor: COLORS.backgroundAlt, borderRadius: 12, padding: 12, lineHeight: 21 },
  error: { color: COLORS.error, lineHeight: 22 },
  link: { minHeight: 48, justifyContent: 'center' },
  linkText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  code: { color: COLORS.text, fontSize: 13, textAlign: 'center', writingDirection: 'ltr', letterSpacing: 1 },
});
