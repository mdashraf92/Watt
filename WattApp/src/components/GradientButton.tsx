/**
 * GradientButton — the app's primary CTA.
 * Brand green→dark (or gold) gradient, spring press-scale, loading + disabled.
 * Reusable across every screen so CTAs stay consistent.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, GRADIENTS } from '../constants/colors';
import { FONTS } from '../constants/typography';

type Variant = 'primary' | 'gold';

export default function GradientButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
  style,
  textStyle,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const scale = useSharedValue(1);
  const off = disabled || loading;
  const colors = variant === 'gold' ? GRADIENTS.gold : GRADIENTS.green;
  const inkColor = variant === 'gold' ? COLORS.textOnGold : '#FFFFFF';
  const shadowColor = variant === 'gold' ? COLORS.goldDark : COLORS.primaryMid;

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[{ width: '100%' }, animStyle]}>
      <Pressable
        onPress={onPress}
        disabled={off}
        onPressIn={() => { scale.value = withTiming(0.97, { duration: 90 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
        style={[styles.wrap, { shadowColor }, off && styles.off, style]}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.grad}
        >
          {loading ? (
            <ActivityIndicator color={inkColor} size="small" />
          ) : (
            <View style={styles.row}>
              {icon}
              <Text style={[styles.label, { color: inkColor }, textStyle]}>{label}</Text>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  off: { opacity: 0.5 },
  grad: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: FONTS.bold, fontSize: 16, letterSpacing: 0.3 },
});
