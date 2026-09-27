import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useLang } from '../context/LanguageContext';
import { COLORS } from '../constants/colors';
import { FONTS, FONTS_AR } from '../constants/typography';
import { GlobeIcon, UserIcon } from './icons';

// Guests only have the Map and Shop tabs, so these header buttons are their way
// into signing in and switching language — both lived on the guest Profile tab,
// which now only appears after login (along with Bookings and Wallet).
export default function GuestSignInButton({ height = 44 }: { height?: number }) {
  const navigation = useNavigation<any>();
  const { t, isRTL, toggleLanguage } = useLang();
  const row = isRTL ? 'row-reverse' as const : 'row' as const;
  return (
    <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
      {/* Round globe button, so the header keeps room for the screen title.
          The label (for screen readers) is the language you'd switch TO. */}
      <Pressable
        onPress={toggleLanguage}
        accessibilityRole="button"
        accessibilityLabel={t.profile_language_label}
        hitSlop={4}
        style={({ pressed }) => [s.lang, { width: height, height, borderRadius: height / 2 }, pressed && { opacity: 0.8 }]}
      >
        <GlobeIcon size={20} color={COLORS.primaryDark} strokeWidth={2} />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('SignIn')}
        accessibilityRole="button"
        accessibilityLabel={t.auth_signin_link}
        style={({ pressed }) => [s.btn, { height, borderRadius: height / 2, flexDirection: row }, pressed && { opacity: 0.8 }]}
      >
        <UserIcon size={17} color="#fff" strokeWidth={2.2} />
        <Text style={[s.text, { fontFamily: isRTL ? FONTS_AR.bold : FONTS.bold }]} numberOfLines={1}>{t.auth_signin_link}</Text>
      </Pressable>
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 4 };
const s = StyleSheet.create({
  lang: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, ...shadow },
  btn: { alignItems: 'center', gap: 6, paddingHorizontal: 13, backgroundColor: COLORS.primaryDark, ...shadow },
  text: { fontSize: 14, color: '#fff' },
});
