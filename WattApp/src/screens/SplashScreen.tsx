import React, { useRef, useState } from 'react';
import {
  StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn, FadeInDown,
  useAnimatedStyle, useAnimatedScrollHandler, useSharedValue,
  withRepeat, withSequence, withTiming, interpolate, Extrapolation, Easing,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { GuestStackParamList } from '../types';
import { COLORS } from '../constants/colors';
import { GoWattIcon } from '../components/Logo';
import { useLang } from '../context/LanguageContext';
import {
  ZapIcon, MapPinIcon, WalletIcon, GlobeIcon,
  BatteryChargingIcon, PlugZapIcon, NavigationIcon, LocateIcon,
  CreditCardIcon, CoinsIcon, ChevronRightIcon,
} from '../components/icons';

type Nav = NativeStackNavigationProp<GuestStackParamList, 'Landing'>;

type Slide = {
  id: string;
  Icon: (p: { size?: number; color?: string; strokeWidth?: number }) => React.JSX.Element;
  ChipA: (p: { size?: number; color?: string; strokeWidth?: number }) => React.JSX.Element;
  ChipB: (p: { size?: number; color?: string; strokeWidth?: number }) => React.JSX.Element;
  accent: string;
  glow: string;
  fill: string;
  ring: string;
  title: string;
  subtitle: string;
};

/* ── A single full-screen onboarding page with scroll-driven parallax ── */
function OnboardingPage({
  item, index, scrollX, width, float, hero, isRTL,
}: {
  item: Slide; index: number; scrollX: SharedValue<number>;
  width: number; float: SharedValue<number>; hero: number; isRTL: boolean;
}) {
  const range = [(index - 1) * width, index * width, (index + 1) * width];

  const heroStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollX.value, range, [0.72, 1, 0.72], Extrapolation.CLAMP) },
      { translateY: interpolate(scrollX.value, range, [26, 0, 26], Extrapolation.CLAMP) },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scrollX.value, range, [width * 0.18, 0, -width * 0.18], Extrapolation.CLAMP) },
    ],
  }));

  const chipA = useAnimatedStyle(() => ({ transform: [{ translateY: -10 * float.value }, { translateX: 4 * float.value }] }));
  const chipB = useAnimatedStyle(() => ({ transform: [{ translateY: 12 * float.value }, { translateX: -4 * float.value }] }));

  const { Icon, ChipA, ChipB } = item;

  return (
    <View style={[styles.page, { width }]}>
      {/* Hero visual */}
      <Animated.View style={[styles.heroWrap, { width: hero, height: hero }, heroStyle]}>
        {/* soft outer glow */}
        <View style={[styles.heroGlow, { width: hero, height: hero, borderRadius: hero / 2, backgroundColor: item.glow }]} />
        {/* faint outer ring */}
        <View style={[styles.heroOuterRing, { width: hero * 0.92, height: hero * 0.92, borderRadius: hero * 0.46, borderColor: item.ring }]} />
        {/* main disc */}
        <View style={[styles.heroDisc, { width: hero * 0.66, height: hero * 0.66, borderRadius: hero * 0.33, backgroundColor: item.fill, borderColor: item.ring }]}>
          <Icon size={hero * 0.26} color={item.accent} strokeWidth={1.6} />
        </View>

        {/* floating accent chips */}
        <Animated.View style={[styles.chip, styles.chipTop, { borderColor: item.ring, shadowColor: item.accent }, chipA]}>
          <ChipA size={20} color={item.accent} strokeWidth={2} />
        </Animated.View>
        <Animated.View style={[styles.chip, styles.chipBottom, { borderColor: item.ring, shadowColor: item.accent }, chipB]}>
          <ChipB size={20} color={item.accent} strokeWidth={2} />
        </Animated.View>
      </Animated.View>

      {/* Text */}
      <Animated.View style={[styles.textWrap, textStyle]}>
        <Text style={[styles.slideTitle, isRTL && styles.slideTitleRtl]}>{item.title}</Text>
        <Text style={[styles.slideSubtitle, isRTL && styles.slideSubtitleRtl]}>{item.subtitle}</Text>
      </Animated.View>
    </View>
  );
}

/* ── Smooth stretching progress dot ── */
function Dot({ index, scrollX, width }: { index: number; scrollX: SharedValue<number>; width: number }) {
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  const style = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value, range, [7, 26, 7], Extrapolation.CLAMP),
    opacity: interpolate(scrollX.value, range, [0.3, 1, 0.3], Extrapolation.CLAMP),
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

export default function SplashScreen() {
  const navigation = useNavigation<Nav>();
  const { t, toggleLanguage, isRTL } = useLang();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<Animated.ScrollView>(null);

  const scrollX = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler(e => { scrollX.value = e.contentOffset.x; });

  // Gentle background orb drift
  const float = useSharedValue(0);
  React.useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 3800, easing: Easing.inOut(Easing.ease) }),
      ), -1, false,
    );
  }, []);
  const orb1 = useAnimatedStyle(() => ({ transform: [{ translateY: -16 * float.value }, { translateX: 12 * float.value }] }));
  const orb2 = useAnimatedStyle(() => ({ transform: [{ translateY: 18 * float.value }, { translateX: -10 * float.value }] }));

  const slides: Slide[] = [
    {
      id: '1', Icon: ZapIcon, ChipA: BatteryChargingIcon, ChipB: PlugZapIcon,
      accent: COLORS.gold, glow: 'rgba(245,158,11,0.20)', fill: 'rgba(245,158,11,0.14)', ring: 'rgba(245,158,11,0.32)',
      title: t.splash_slide1_title, subtitle: t.splash_slide1_sub,
    },
    {
      id: '2', Icon: MapPinIcon, ChipA: NavigationIcon, ChipB: LocateIcon,
      accent: '#60a5fa', glow: 'rgba(96,165,250,0.20)', fill: 'rgba(96,165,250,0.14)', ring: 'rgba(96,165,250,0.32)',
      title: t.splash_slide2_title, subtitle: t.splash_slide2_sub,
    },
    {
      id: '3', Icon: WalletIcon, ChipA: CreditCardIcon, ChipB: CoinsIcon,
      accent: '#34d399', glow: 'rgba(52,211,153,0.20)', fill: 'rgba(52,211,153,0.14)', ring: 'rgba(52,211,153,0.32)',
      title: t.splash_slide3_title, subtitle: t.splash_slide3_sub,
    },
  ];

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const goToAuth = () => navigation.navigate('SignIn');
  const isLast = activeIndex >= slides.length - 1;

  const handleNext = () => {
    if (!isLast) {
      scrollRef.current?.scrollTo({ x: (activeIndex + 1) * width, animated: true });
    } else {
      goToAuth();
    }
  };

  const hero = Math.min(280, width * 0.72);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Ambient background orbs */}
      <Animated.View style={[styles.orb, { width: 340, height: 340, top: -110, right: -110, backgroundColor: 'rgba(16,185,129,0.14)' }, orb1]} />
      <Animated.View style={[styles.orb, { width: 260, height: 260, bottom: -80, left: -100, backgroundColor: 'rgba(245,158,11,0.10)' }, orb2]} />
      <Animated.View style={[styles.orb, { width: 200, height: 200, top: '38%', right: -80, backgroundColor: 'rgba(96,165,250,0.10)' }, orb1]} />

      {/* ── Fixed header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <GoWattIcon size={26} />
          </View>
          <Text style={styles.logoText}>GO WATT</Text>
        </Animated.View>

        <TouchableOpacity
          style={styles.langBtn}
          onPress={toggleLanguage}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <GlobeIcon size={14} color="rgba(255,255,255,0.8)" strokeWidth={2} />
          <Text style={styles.langBtnText}>{t.profile_language_label}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Swipeable pages ── */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        style={styles.scroll}
      >
        {slides.map((item, i) => (
          <OnboardingPage
            key={item.id}
            item={item}
            index={i}
            scrollX={scrollX}
            width={width}
            float={float}
            hero={hero}
            isRTL={isRTL}
          />
        ))}
      </Animated.ScrollView>

      {/* ── Fixed footer ── */}
      <Animated.View
        entering={FadeInDown.delay(300).duration(600)}
        style={[styles.footer, { paddingBottom: insets.bottom + 22 }]}
      >
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <Dot key={i} index={i} scrollX={scrollX} width={width} />
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={[styles.primaryBtnText, isRTL && styles.primaryBtnTextRtl]}>{isLast ? t.splash_start : t.splash_next}</Text>
          {!isLast && (
            <View style={isRTL && styles.flipX}>
              <ChevronRightIcon size={20} color="#0F172A" strokeWidth={2.5} />
            </View>
          )}
        </TouchableOpacity>

        {isLast ? (
          <TouchableOpacity onPress={() => navigation.navigate('GuestTabs')} style={styles.secondaryBtn} activeOpacity={0.7}>
            <Text style={styles.secondaryText}>{isRTL ? '← ' : ''}{t.auth_browse_guest}{isRTL ? '' : ' →'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={goToAuth} style={styles.secondaryBtn} activeOpacity={0.7}>
            <Text style={styles.secondaryText}>{t.splash_skip}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primaryDark, overflow: 'hidden' },

  orb: { position: 'absolute', borderRadius: 9999 },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingBottom: 6, zIndex: 10,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoBadge: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 19, fontWeight: '800', color: '#fff', letterSpacing: 4 },
  langBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  langBtnText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },

  // ── Pages ──
  scroll: { flex: 1 },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },

  heroWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 44 },
  heroGlow: { position: 'absolute' },
  heroOuterRing: { position: 'absolute', borderWidth: 1 },
  heroDisc: {
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  chip: {
    position: 'absolute',
    width: 46, height: 46, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  chipTop: { top: 6, right: '15%' },
  chipBottom: { bottom: 10, left: '15%' },

  textWrap: { alignItems: 'center', gap: 12 },
  slideTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', lineHeight: 33, letterSpacing: 0.2 },
  // Arabic: drop letterSpacing (breaks connected script) + more line-height so tashkeel/tanwin aren't clipped
  slideTitleRtl: { letterSpacing: 0, lineHeight: 40, writingDirection: 'rtl' },
  slideSubtitle: { fontSize: 15, color: 'rgba(255,255,255,0.66)', textAlign: 'center', lineHeight: 23, maxWidth: 320 },
  slideSubtitleRtl: { lineHeight: 28, writingDirection: 'rtl' },

  // ── Footer ──
  footer: { paddingHorizontal: 24, alignItems: 'center', gap: 18 },
  dotsRow: { flexDirection: 'row', gap: 7, height: 8, alignItems: 'center' },
  dot: { height: 7, borderRadius: 4, backgroundColor: COLORS.gold },

  primaryBtn: {
    width: '100%', flexDirection: 'row', gap: 6,
    backgroundColor: COLORS.gold, borderRadius: 18, paddingVertical: 17,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.goldDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 7,
  },
  primaryBtnText: { fontSize: 17, fontWeight: '700', color: '#0F172A', letterSpacing: 0.3 },
  // Arabic: drop letterSpacing (breaks connected script) + taller line-height & padding so diacritics aren't clipped
  primaryBtnTextRtl: { letterSpacing: 0, lineHeight: 28, paddingVertical: 2, writingDirection: 'rtl' },

  secondaryBtn: { paddingVertical: 4, paddingHorizontal: 20 },
  secondaryText: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '600' },

  flipX: { transform: [{ scaleX: -1 }] },
});
