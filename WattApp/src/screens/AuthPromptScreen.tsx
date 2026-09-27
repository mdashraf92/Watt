import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLang } from '../context/LanguageContext';
import { COLORS } from '../constants/colors';
import { FONTS, FONTS_AR } from '../constants/typography';
import { CalendarIcon, HeartIcon, LockIcon, ShoppingCartIcon, UserIcon, WrenchIcon } from '../components/icons';
import GradientButton from '../components/GradientButton';
import type { AuthReason } from '../lib/useRequireAuth';

// Bottom sheet shown when a guest tries to act (book, order, save…). Opened by
// useRequireAuth(); presented as a transparent modal over whatever they were
// browsing, so "Not now" drops them back exactly where they were.
export default function AuthPromptScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<any>();
  const reason: AuthReason = params?.reason ?? 'generic';
  const { t, isRTL } = useLang();
  const insets = useSafeAreaInsets();

  const content: Record<AuthReason, { title: string; Icon: typeof LockIcon }> = {
    generic:  { title: t.gate_title_generic,  Icon: LockIcon },
    booking:  { title: t.gate_title_booking,  Icon: CalendarIcon },
    order:    { title: t.gate_title_order,    Icon: ShoppingCartIcon },
    service:  { title: t.gate_title_service,  Icon: WrenchIcon },
    favorite: { title: t.gate_title_favorite, Icon: HeartIcon },
    account:  { title: t.gate_title_account,  Icon: UserIcon },
  };
  const { title, Icon } = content[reason] ?? content.generic;
  const font = (w: 'regular' | 'bold' | 'extrabold') => ({ fontFamily: isRTL ? FONTS_AR[w] : FONTS[w] });

  // replace() so closing the sign-in / sign-up screen returns to the content,
  // not to this sheet.
  return (
    <View style={s.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()} accessibilityLabel={t.gate_not_now} />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={s.handle} />
        <View style={s.iconWrap}><Icon size={28} color={COLORS.primary} strokeWidth={2} /></View>
        <Text style={[s.title, font('extrabold')]}>{title}</Text>
        <Text style={[s.body, font('regular')]}>{t.gate_body}</Text>
        <View style={{ height: 8 }} />
        <GradientButton label={t.gate_create} onPress={() => navigation.replace('SignUp')} textStyle={font('bold')} />
        <Pressable accessibilityRole="button" onPress={() => navigation.replace('SignIn')} style={({ pressed }) => [s.secondary, pressed && { opacity: 0.7 }]}>
          <Text style={[s.secondaryText, font('bold')]}>{t.gate_signin}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} hitSlop={8} style={s.dismiss}>
          <Text style={[s.dismissText, font('bold')]}>{t.gate_not_now}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 10, gap: 10, alignItems: 'stretch',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderStrong, marginBottom: 12 },
  iconWrap: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 21, lineHeight: 28, color: COLORS.text, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 8 },
  secondary: { height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, color: COLORS.primaryDark },
  dismiss: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  dismissText: { fontSize: 14, color: COLORS.textSecondary },
});
