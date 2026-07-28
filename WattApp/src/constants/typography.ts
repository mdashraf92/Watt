/**
 * GO WATT — Typography system
 * Source: "Gowatt Presentation.pdf" › TYPOGRAPHY
 *   English : Montserrat  (Light titles · Regular subtitles · Medium/Bold body)
 *   Arabic  : Helvetica Neue LT Arabic  → not redistributable, so we ship
 *             Tajawal (a clean, geometric Arabic face) as the brand-approved
 *             fallback with matching weight ramp.
 *   Sizes (digital): Titles 24–36 · Subtitles 18–24 · Body 12–16 · line 1.2×
 *
 * NOTE: with custom fonts, `fontWeight` is unreliable on Android — you must
 * name the exact family per weight. Use FONTS.* below, never fontWeight.
 */
import {
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';
import {
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
  Tajawal_800ExtraBold,
} from '@expo-google-fonts/tajawal';

/** Font-family names (as registered by expo-font). */
export const FONTS = {
  light: 'Montserrat_300Light',
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semibold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
  extrabold: 'Montserrat_800ExtraBold',
} as const;

export const FONTS_AR = {
  regular: 'Tajawal_400Regular',
  medium: 'Tajawal_500Medium',
  bold: 'Tajawal_700Bold',
  extrabold: 'Tajawal_800ExtraBold',
} as const;

/** The map passed to expo-font's useFonts(). */
export const FONT_ASSETS = {
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
  Tajawal_800ExtraBold,
};

/**
 * Ready-made text style presets (line-height ≈ 1.2× per guideline).
 * Spread into a StyleSheet: { ...TYPE.h1, color: COLORS.text }.
 */
export const TYPE = {
  display: { fontFamily: FONTS.light, fontSize: 36, lineHeight: 43 },     // hero titles
  h1:      { fontFamily: FONTS.bold, fontSize: 28, lineHeight: 34 },
  h2:      { fontFamily: FONTS.semibold, fontSize: 24, lineHeight: 29 },  // section titles
  h3:      { fontFamily: FONTS.semibold, fontSize: 20, lineHeight: 25 },
  subtitle:{ fontFamily: FONTS.regular, fontSize: 18, lineHeight: 24 },
  bodyBold:{ fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 22 },
  body:    { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22 },
  bodySm:  { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19 },
  label:   { fontFamily: FONTS.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.3 },
  caption: { fontFamily: FONTS.medium, fontSize: 12, lineHeight: 16 },
  button:  { fontFamily: FONTS.bold, fontSize: 16, lineHeight: 20, letterSpacing: 0.3 },
} as const;
