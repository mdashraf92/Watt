/**
 * BrandSplash — the launch animation that plays once on cold start (after the
 * QR scan / app open), then reveals the app.
 *
 * Beats:
 *   1. POP     the GO WATT icon springs in on white.
 *   2. CHARGE  the orange lightning bolt pulses with an electric glow + flicker.
 *   3. DIVE    the camera zooms INTO the right "O" (the charging loop) — the
 *              green ring blows past the edges, the bolt flares, then it fades
 *              through to the app underneath.
 *
 * Built on Reanimated so it runs on the UI thread (stays smooth during JS load).
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { GoWattIcon, ICON_O_FOCUS } from './Logo';
import { BRAND, COLORS } from '../constants/colors';

const SCALE_MAX = 22;

export default function BrandSplash({ onFinish }: { onFinish: () => void }) {
  const { width } = useWindowDimensions();
  const iconW = Math.min(width * 0.52, 230);
  // Horizontal offset of the "O" from the icon's own center, in device px.
  const DX = (ICON_O_FOCUS.x - 0.5) * iconW;

  const scale = useSharedValue(0.66);
  const appear = useSharedValue(0);   // icon fade-in
  const fade = useSharedValue(1);     // icon fade-out during the dive
  const glow = useSharedValue(0);     // bolt charge glow
  const flare = useSharedValue(0);    // bolt flash on the dive
  const veil = useSharedValue(0);     // white veil that smooths into the app

  useEffect(() => {
    // 1 · POP
    appear.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
    scale.value = withSequence(
      withTiming(1.05, { duration: 480, easing: Easing.out(Easing.back(1.7)) }),
      withTiming(1.0, { duration: 200, easing: Easing.inOut(Easing.quad) }),
      // 3 · DIVE — accelerate into the O
      withDelay(360, withTiming(SCALE_MAX, { duration: 820, easing: Easing.in(Easing.cubic) })),
    );

    // 2 · CHARGE — pulsing electric glow + a quick flicker
    glow.value = withDelay(
      300,
      withSequence(
        withRepeat(
          withSequence(
            withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
            withTiming(0.4, { duration: 240, easing: Easing.in(Easing.quad) }),
          ),
          2,
          false,
        ),
        withTiming(0.9, { duration: 120 }),
      ),
    );

    // 3 · flare + fade-through + veil
    flare.value = withDelay(1060, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }));
    fade.value = withDelay(1360, withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }));
    veil.value = withDelay(1360, withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) }));

    const t = setTimeout(() => runOnJS(onFinish)(), 1780);
    return () => clearTimeout(t);
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: appear.value * fade.value,
    transform: [
      // keep the "O" converging on screen-center as we zoom in
      { translateX: -DX * (scale.value - 1) },
      { scale: scale.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: Math.max(glow.value * 0.9, flare.value),
    // sit over the "O" (biased right of center), then swell on the flare
    transform: [{ translateX: DX }, { scale: 0.6 + glow.value * 0.5 + flare.value * 2.4 }],
  }));

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));

  return (
    <View style={styles.container} pointerEvents="none">
      {/* bolt charge glow — sits over the O */}
      <Animated.View style={[styles.glowWrap, glowStyle]}>
        <View style={styles.glow} />
      </Animated.View>

      <Animated.View style={iconStyle}>
        <GoWattIcon size={iconW} markColor={BRAND.green} boltColor={BRAND.orange} />
      </Animated.View>

      {/* white veil to melt into the app underneath */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.veil, veilStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  glowWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOpacity: 0.9,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
  },
  veil: { backgroundColor: COLORS.background },
});
