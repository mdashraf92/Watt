/**
 * GO WATT — Brand color system
 * Source of truth: "Gowatt Presentation.pdf" › COLOR DIRECTION
 *   Primary Green  #378B5A   rgb(55,139,90)
 *   Accent Orange  #F4A53C   rgb(244,165,60)
 *   Dark Green     #214A38   rgb(33,74,56)
 *   Light Gray     #DEDEDE   rgb(222,222,222)
 *
 * Existing token KEYS are preserved so every screen (34 importers) rebrands
 * automatically. Values are retuned to the official palette + a coherent scale
 * derived from it.
 */
export const COLORS = {
  // ─── Brand · Green ────────────────────────────────────────
  primary: '#378B5A',       // brand primary green
  primaryLight: '#4FA974',  // lighter tint for hovers / active fills
  primaryMid: '#2E7A4E',    // pressed / mid
  primaryDark: '#214A38',   // brand dark green — headers / hero bg
  primaryDeep: '#173528',   // deepest green for gradients
  primaryBg: '#EAF4EE',     // 5% green wash — surfaces
  primaryTint: '#D2E7DB',   // 15% green — chips / tints

  // ─── Brand · Orange (accent) ──────────────────────────────
  gold: '#F4A53C',           // brand accent orange (the lightning bolt)
  goldLight: '#F8BC66',      // lighter accent
  goldDark: '#DB8A20',       // pressed accent
  goldBg: '#FEF6EA',         // orange wash
  goldTint: '#FBE6C7',       // soft orange tint

  // ─── Text ─────────────────────────────────────────────────
  text: '#16241D',           // near-black, green-tinted (brand ink)
  textSecondary: '#5A6B62',  // muted green-gray
  textTertiary: '#95A29B',   // faint
  textOnPrimary: '#FFFFFF',
  textOnGold: '#3A2A08',     // legible ink on orange

  // ─── Surface ──────────────────────────────────────────────
  background: '#F6F8F7',     // app background — soft green-gray
  backgroundAlt: '#EEF2F0',  // alt sections
  card: '#FFFFFF',
  overlay: 'rgba(15, 33, 25, 0.60)',   // dark-green scrim over media
  glass: 'rgba(255,255,255,0.10)',      // glass cards over photos

  // ─── Border ───────────────────────────────────────────────
  border: '#E4E9E6',         // hairline
  borderStrong: '#DEDEDE',   // brand light gray
  borderOnDark: 'rgba(255,255,255,0.16)',

  // ─── Status Semantic ──────────────────────────────────────
  success: '#378B5A',
  successBg: '#EAF4EE',
  successDark: '#2E7A4E',
  error: '#E5484D',
  errorBg: '#FDECEC',
  warning: '#F4A53C',
  warningBg: '#FEF6EA',
  info: '#3B82F6',
  infoBg: '#EFF6FF',

  // ─── EV Charger Status ────────────────────────────────────
  available: '#378B5A',
  busy: '#F4A53C',
  fault: '#E5484D',
  offline: '#95A29B',
};

/**
 * Brand gradients (use with expo-linear-gradient).
 * `brand` is the signature green→orange sweep from the deck's key art.
 */
export const GRADIENTS = {
  green: ['#378B5A', '#214A38'] as const,          // primary → dark
  greenDeep: ['#2E7A4E', '#173528'] as const,      // hero backgrounds
  brand: ['#378B5A', '#F4A53C'] as const,          // signature green → orange
  gold: ['#F8BC66', '#F4A53C'] as const,           // accent buttons
  glass: ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.04)'] as const,
};

/** Raw brand values, for places that need the exact hex (icons, native config). */
export const BRAND = {
  green: '#378B5A',
  orange: '#F4A53C',
  darkGreen: '#214A38',
  gray: '#DEDEDE',
} as const;
