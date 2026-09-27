import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLang } from '../../context/LanguageContext';
import { COLORS } from '../../constants/colors';
import { FONTS, FONTS_AR } from '../../constants/typography';
import { ArrowLeftIcon } from '../../components/icons';

// Building blocks for the seller portal (and the listing editor). RTL is done
// per view in this app, so every row here flips itself with useLang().isRTL.

type Weight = 'regular' | 'medium' | 'bold' | 'extrabold';
export function useKit() {
  const { isRTL } = useLang();
  return {
    isRTL,
    row: (isRTL ? 'row-reverse' : 'row') as 'row' | 'row-reverse',
    align: (isRTL ? 'right' : 'left') as 'right' | 'left',
    f: (w: Weight) => ({ fontFamily: isRTL ? FONTS_AR[w] : FONTS[w] }),
  };
}

export function Screen({ title, subtitle, onBack, right, children, scroll = true }: {
  title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode; children: React.ReactNode; scroll?: boolean;
}) {
  const k = useKit();
  const body = <View style={k_s.body}>{children}</View>;
  return (
    <SafeAreaView style={k_s.screen} edges={['top']}>
      <View style={[k_s.header, { flexDirection: k.row }]}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={10} style={k_s.iconBtn} accessibilityRole="button" accessibilityLabel={k.isRTL ? 'رجوع' : 'Back'}>
            <View style={k.isRTL && { transform: [{ scaleX: -1 }] }}><ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.4} /></View>
          </Pressable>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[k_s.title, k.f('extrabold'), { textAlign: k.align }]}>{title}</Text>
          {!!subtitle && <Text numberOfLines={1} style={[k_s.subtitle, k.f('regular'), { textAlign: k.align }]}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      {scroll
        ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>{body}</ScrollView>
        : body}
    </SafeAreaView>
  );
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: any; tone?: 'plain' | 'soft' | 'warn' | 'error' | 'good' }) {
  const bg = tone === 'soft' ? COLORS.backgroundAlt : tone === 'warn' ? COLORS.goldBg : tone === 'error' ? COLORS.errorBg : tone === 'good' ? COLORS.primaryBg : COLORS.card;
  const border = tone === 'warn' ? COLORS.goldTint : tone === 'error' ? '#F7C9CA' : tone === 'good' ? COLORS.primaryTint : COLORS.border;
  return <View style={[k_s.card, { backgroundColor: bg, borderColor: border }, style]}>{children}</View>;
}

export function T({ children, size = 14, weight = 'regular', color = COLORS.text, center, lines, style }: {
  children: React.ReactNode; size?: number; weight?: Weight; color?: string; center?: boolean; lines?: number; style?: any;
}) {
  const k = useKit();
  return <Text numberOfLines={lines} style={[{ fontSize: size, lineHeight: Math.round(size * 1.45), color, textAlign: center ? 'center' : k.align }, k.f(weight), style]}>{children}</Text>;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const k = useKit();
  return (
    <View style={{ flexDirection: k.row, alignItems: 'center', gap: 8, marginTop: 6 }}>
      <View style={{ flex: 1 }}><T size={16} weight="extrabold">{children}</T></View>
      {action}
    </View>
  );
}

export function Btn({ label, onPress, variant = 'primary', disabled, loading, small, icon }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean; small?: boolean; icon?: React.ReactNode;
}) {
  const k = useKit();
  const bg = variant === 'primary' ? COLORS.primaryDark : variant === 'danger' ? COLORS.errorBg : variant === 'secondary' ? COLORS.primaryBg : 'transparent';
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? COLORS.error : COLORS.primaryDark;
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!loading }} disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [k_s.btn, small && k_s.btnSmall, { backgroundColor: bg, flexDirection: k.row },
        variant === 'secondary' && { borderWidth: 1, borderColor: COLORS.primaryTint }, { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon}
      <Text numberOfLines={1} style={[{ fontSize: small ? 13 : 15, color: fg }, k.f('bold')]}>{label}</Text>
    </Pressable>
  );
}

export function Input({ label, hint, style, ...props }: TextInputProps & { label: string; hint?: string }) {
  const k = useKit();
  return (
    <View style={{ gap: 6 }}>
      <T size={13} weight="bold" color={COLORS.textSecondary}>{label}</T>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={COLORS.textTertiary}
        style={[k_s.input, k.f('medium'), { textAlign: k.align }, props.multiline && { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 }, style]}
      />
      {!!hint && <T size={12} color={COLORS.textTertiary}>{hint}</T>}
    </View>
  );
}

// Horizontal pill tabs / filters. Scrolls when there are more than fit.
export function Pills<K extends string>({ items, value, onChange }: { items: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  const k = useKit();
  const ordered = k.isRTL ? [...items].reverse() : items;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8, flexDirection: 'row', ...(k.isRTL ? { flexGrow: 1, justifyContent: 'flex-end' } : {}) }}>
      {ordered.map(it => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[k_s.pill, on && k_s.pillOn, { flexDirection: k.row }]}>
            <Text style={[{ fontSize: 13, color: on ? '#fff' : COLORS.text }, k.f(on ? 'bold' : 'medium')]}>{it.label}</Text>
            {it.count !== undefined && it.count > 0 && (
              <View style={[k_s.pillCount, on && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                <Text style={{ fontSize: 11, fontFamily: FONTS.bold, color: on ? '#fff' : COLORS.primaryDark }}>{it.count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const BADGE: Record<string, [string, string]> = {
  good: [COLORS.primaryBg, COLORS.primaryDark], warn: [COLORS.goldBg, COLORS.goldDark],
  bad: [COLORS.errorBg, COLORS.error], muted: [COLORS.backgroundAlt, COLORS.textSecondary],
};
export function toneFor(status: string): keyof typeof BADGE {
  if (['approved', 'published', 'completed', 'booked', 'paid', 'refunded'].includes(status)) return 'good';
  if (['pending', 'requested', 'quoted', 'accepted', 'ready', 'shipped', 'in_progress', 'draft'].includes(status)) return 'warn';
  if (['rejected', 'suspended', 'cancelled'].includes(status)) return 'bad';
  return 'muted';
}
export function Badge({ label, tone = 'muted' }: { label: string; tone?: keyof typeof BADGE }) {
  const k = useKit();
  const [bg, fg] = BADGE[tone];
  return <View style={[k_s.badge, { backgroundColor: bg }]}><Text style={[{ fontSize: 11.5, color: fg }, k.f('bold')]}>{label}</Text></View>;
}

export function Stat({ label, value, tone = 'plain' }: { label: string; value: string | number; tone?: 'plain' | 'warn' | 'good' }) {
  const color = tone === 'warn' ? COLORS.goldDark : tone === 'good' ? COLORS.primary : COLORS.text;
  return (
    <Card style={{ flex: 1, minWidth: 140, gap: 4, paddingVertical: 14 }}>
      <T size={24} weight="extrabold" color={color}>{value}</T>
      <T size={12.5} color={COLORS.textSecondary} lines={2}>{label}</T>
    </Card>
  );
}

export function Empty({ title, body, icon, action }: { title: string; body?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
      {icon && <View style={k_s.emptyIcon}>{icon}</View>}
      <T size={16} weight="bold" center>{title}</T>
      {!!body && <T size={13.5} color={COLORS.textSecondary} center>{body}</T>}
      {action}
    </Card>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <Card tone="error"><T size={13.5} color={COLORS.error} weight="medium">{message}</T></Card>;
}

export const k_s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: { alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, width: '100%', maxWidth: 900, alignSelf: 'center' },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, lineHeight: 30, color: COLORS.text },
  subtitle: { fontSize: 13, lineHeight: 18, color: COLORS.textSecondary },
  body: { paddingHorizontal: 20, paddingTop: 4, gap: 14, width: '100%', maxWidth: 900, alignSelf: 'center' },
  card: { borderRadius: 18, padding: 16, gap: 10, borderWidth: 1 },
  btn: { minHeight: 50, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSmall: { minHeight: 40, borderRadius: 12, paddingHorizontal: 14 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingHorizontal: 14, fontSize: 15, color: COLORS.text },
  pill: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center', gap: 6 },
  pillOn: { backgroundColor: COLORS.primaryDark, borderColor: COLORS.primaryDark },
  pillCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
