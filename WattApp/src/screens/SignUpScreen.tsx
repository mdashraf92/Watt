import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GuestStackParamList } from '../types';
import { COLORS } from '../constants/colors';
import { FONTS, FONTS_AR } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { ArrowLeftIcon, CheckIcon, EyeIcon, EyeOffIcon, GlobeIcon, MailIcon } from '../components/icons';
import GradientButton from '../components/GradientButton';

type Nav = NativeStackNavigationProp<GuestStackParamList, 'SignUp'>;
type Step = 0 | 1 | 2;   // email → code → password

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

// Sign-up, one field per step so each screen is a single decision:
//   1. email     → a code is emailed (no account yet)
//   2. code      → auto-submits on the 6th digit
//   3. password  → account created and signed in
// Name, phone and the optional EV details follow in ProfileSetup, which the
// root navigator opens by itself once the new session exists.
export default function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const { t, isRTL, toggleLanguage } = useLang();
  const { startSignUp, verifySignUpCode, completeSignUp } = useAuth();

  const [step, setStep] = useState<Step>(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<TextInput>(null);

  const font = (w: 'regular' | 'medium' | 'bold' | 'extrabold') => ({ fontFamily: isRTL ? FONTS_AR[w] : FONTS[w] });
  const align = { textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left' };
  const row = isRTL ? 'row-reverse' as const : 'row' as const;
  const cleanEmail = email.trim().toLowerCase();

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn(n => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const go = (next: Step) => { setError(null); setNotice(null); setStep(next); };

  const back = () => {
    if (loading) return;
    if (step === 0) navigation.goBack();
    else go((step - 1) as Step);
  };

  // ── Step 1: email ──
  const sendCode = async () => {
    if (!EMAIL_REGEX.test(cleanEmail)) { setError(t.auth_error_email); return; }
    setLoading(true); setError(null); setEmailTaken(false);
    try {
      await startSignUp(cleanEmail);
      setCode(''); setResendIn(RESEND_SECONDS);
      go(1);
    } catch (e: any) {
      if (e instanceof ApiError && e.code === 'conflict') { setEmailTaken(true); setError(t.su_email_taken); }
      else setError(e?.message ?? t.error);
    } finally { setLoading(false); }
  };

  const resend = async () => {
    if (resendIn > 0 || loading) return;
    setLoading(true); setError(null);
    try {
      await startSignUp(cleanEmail);
      setCode(''); setResendIn(RESEND_SECONDS); setNotice(t.su_code_sent);
      codeRef.current?.focus();
    } catch (e: any) { setError(e?.message ?? t.error); }
    finally { setLoading(false); }
  };

  // ── Step 2: code ──
  const verify = async (value = code) => {
    if (value.length !== CODE_LENGTH || loading) return;
    setLoading(true); setError(null); setNotice(null);
    try {
      setSignupToken(await verifySignUpCode(cleanEmail, value));
      setPassword('');
      go(2);
    } catch (e: any) {
      setError(e?.message ?? t.otp_error_invalid);
      setCode('');
      codeRef.current?.focus();
    } finally { setLoading(false); }
  };

  const onCodeChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === CODE_LENGTH) verify(digits);   // no extra tap needed
  };

  // ── Step 3: password ──
  const rules = [
    { ok: password.length >= 8,       label: t.su_pw_rule_len },
    { ok: /[A-Za-z]/.test(password),  label: t.su_pw_rule_letter },
    { ok: /\d/.test(password),        label: t.su_pw_rule_number },
  ];
  const passwordOk = rules.every(r => r.ok);

  const create = async () => {
    if (!passwordOk || loading) return;
    setLoading(true); setError(null);
    try {
      await completeSignUp(cleanEmail, signupToken, password);
      // Session is live — the root navigator swaps to ProfileSetup on its own.
    } catch (e: any) {
      setError(e?.message ?? t.error);
      setLoading(false);
    }
  };

  const steps = [t.su_step_1, t.su_step_2, t.su_step_3];
  const titles = [t.su_email_title, t.su_code_title, t.su_pw_title];

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header: back · progress · language */}
      <View style={[s.header, { flexDirection: row }]}>
        <Pressable onPress={back} hitSlop={10} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={isRTL ? 'رجوع' : 'Back'}>
          <View style={isRTL && s.flipX}><ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.4} /></View>
        </Pressable>
        <View style={[s.progress, { flexDirection: row }]}>
          {[0, 1, 2].map(i => <View key={i} style={[s.progressSeg, i <= step && s.progressOn]} />)}
        </View>
        <Pressable onPress={toggleLanguage} hitSlop={10} style={[s.langBtn, { flexDirection: row }]} accessibilityRole="button">
          <GlobeIcon size={14} color={COLORS.textSecondary} strokeWidth={2} />
          <Text style={[s.langText, font('bold')]}>{t.profile_language_label}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={[s.stepLabel, font('bold'), align]}>{steps[step]}</Text>
          <Text style={[s.title, font('extrabold'), align]}>{titles[step]}</Text>

          {step === 0 && <>
            <Text style={[s.sub, font('regular'), align]}>{t.su_email_sub}</Text>
            <View style={[s.inputBox, { flexDirection: row }, !!error && s.inputError]}>
              <MailIcon size={19} color={COLORS.textTertiary} strokeWidth={2} />
              <TextInput
                style={[s.input, font('medium'), align]}
                value={email}
                onChangeText={v => { setEmail(v); if (error) { setError(null); setEmailTaken(false); } }}
                placeholder={t.auth_email_ph}
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                autoCorrect={false}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={sendCode}
              />
            </View>
            {!!error && <Text style={[s.error, font('medium'), align]}>{error}</Text>}
            {emailTaken && (
              <Pressable onPress={() => navigation.replace('SignIn')} hitSlop={6} accessibilityRole="button">
                <Text style={[s.link, font('bold'), align]}>{t.su_signin_instead}</Text>
              </Pressable>
            )}
            <GradientButton label={t.su_continue} onPress={sendCode} loading={loading} disabled={!cleanEmail} textStyle={font('bold')} />
            <Text style={[s.fine, font('regular'), { textAlign: 'center' }]}>{t.su_terms}</Text>
          </>}

          {step === 1 && <>
            <View style={[s.emailRow, { flexDirection: row }]}>
              <Text style={[s.sub, font('regular'), align, { flexShrink: 1 }]}>
                {t.su_code_sub} <Text style={[font('bold'), { color: COLORS.text }]}>{cleanEmail}</Text>
              </Text>
              <Pressable onPress={() => go(0)} hitSlop={8} accessibilityRole="button">
                <Text style={[s.link, font('bold')]}>{t.su_change_email}</Text>
              </Pressable>
            </View>

            {/* Six boxes drawn over one real input, so paste and SMS/email
                autofill ("oneTimeCode") both work. Digits always read LTR. */}
            <Pressable onPress={() => codeRef.current?.focus()} style={s.codeRow} accessibilityLabel={t.su_code_title}>
              {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                const active = i === Math.min(code.length, CODE_LENGTH - 1) && !loading;
                return (
                  <View key={i} style={[s.codeBox, !!code[i] && s.codeBoxFilled, active && s.codeBoxActive, !!error && s.inputError]}>
                    <Text style={[s.codeDigit, { fontFamily: FONTS.bold }]}>{code[i] ?? ''}</Text>
                  </View>
                );
              })}
              <TextInput
                ref={codeRef}
                value={code}
                onChangeText={onCodeChange}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                autoFocus
                caretHidden
                style={s.codeInput}
              />
            </Pressable>

            {!!error && <Text style={[s.error, font('medium'), { textAlign: 'center' }]}>{error}</Text>}
            {!!notice && <Text style={[s.notice, font('medium'), { textAlign: 'center' }]}>{notice}</Text>}

            <GradientButton label={t.su_continue} onPress={() => verify()} loading={loading} disabled={code.length !== CODE_LENGTH} textStyle={font('bold')} />
            <Pressable onPress={resend} disabled={resendIn > 0 || loading} hitSlop={8} style={{ alignSelf: 'center', padding: 6 }} accessibilityRole="button">
              <Text style={[s.link, font('bold'), resendIn > 0 && { color: COLORS.textTertiary }]}>
                {resendIn > 0 ? `${t.su_resend_in} 0:${String(resendIn).padStart(2, '0')}` : t.su_resend}
              </Text>
            </Pressable>
          </>}

          {step === 2 && <>
            <Text style={[s.sub, font('regular'), align]}>{t.su_pw_sub}</Text>
            <View style={[s.inputBox, { flexDirection: row }, !!error && s.inputError]}>
              <TextInput
                style={[s.input, font('medium'), align]}
                value={password}
                onChangeText={v => { setPassword(v); if (error) setError(null); }}
                placeholder={t.auth_password_ph}
                placeholderTextColor={COLORS.textTertiary}
                secureTextEntry={!showPass}
                autoComplete="new-password"
                textContentType="newPassword"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={create}
              />
              <Pressable onPress={() => setShowPass(p => !p)} hitSlop={10} accessibilityRole="button">
                {showPass
                  ? <EyeOffIcon size={20} color={COLORS.textTertiary} strokeWidth={2} />
                  : <EyeIcon size={20} color={COLORS.textTertiary} strokeWidth={2} />}
              </Pressable>
            </View>

            <View style={s.rules}>
              {rules.map(r => (
                <View key={r.label} style={[s.rule, { flexDirection: row }]}>
                  <View style={[s.ruleDot, r.ok && s.ruleDotOn]}>
                    {r.ok && <CheckIcon size={10} color="#fff" strokeWidth={3.5} />}
                  </View>
                  <Text style={[s.ruleText, font(r.ok ? 'bold' : 'regular'), r.ok && { color: COLORS.primaryDark }]}>{r.label}</Text>
                </View>
              ))}
            </View>

            {!!error && <Text style={[s.error, font('medium'), align]}>{error}</Text>}
            <GradientButton label={t.su_create} onPress={create} loading={loading} disabled={!passwordOk} textStyle={font('bold')} />
          </>}

          <View style={[s.switchRow, { flexDirection: row }]}>
            <Text style={[s.switchText, font('regular')]}>{t.auth_have_account}</Text>
            <Pressable onPress={() => navigation.replace('SignIn')} hitSlop={8} accessibilityRole="button">
              <Text style={[s.link, font('bold')]}>{t.auth_signin_link}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  flipX: { transform: [{ scaleX: -1 }] },
  progress: { flex: 1, gap: 6 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  progressOn: { backgroundColor: COLORS.primary },
  langBtn: { alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 32, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  langText: { fontSize: 12, color: COLORS.textSecondary },

  body: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 32, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  stepLabel: { fontSize: 12, color: COLORS.primary, letterSpacing: 0.3 },
  title: { fontSize: 27, lineHeight: 35, color: COLORS.text, marginTop: -6 },
  sub: { fontSize: 15, lineHeight: 22, color: COLORS.textSecondary, marginBottom: 6 },

  inputBox: { height: 56, alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border },
  input: { flex: 1, height: '100%', fontSize: 16, color: COLORS.text, paddingVertical: 0 },
  inputError: { borderColor: COLORS.error },
  error: { fontSize: 13, lineHeight: 19, color: COLORS.error, marginTop: -4 },
  notice: { fontSize: 13, color: COLORS.primary },
  link: { fontSize: 14, color: COLORS.primary },
  fine: { fontSize: 12, lineHeight: 18, color: COLORS.textTertiary, paddingHorizontal: 12 },

  emailRow: { alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' },
  // Digits stay left-to-right in both languages, like on every keypad.
  codeRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginVertical: 4 },
  codeBox: { flex: 1, maxWidth: 56, aspectRatio: 0.86, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  codeBoxFilled: { borderColor: COLORS.primaryTint, backgroundColor: COLORS.primaryBg },
  codeBoxActive: { borderColor: COLORS.primary, borderWidth: 2 },
  codeDigit: { fontSize: 24, color: COLORS.text },
  codeInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, color: 'transparent', opacity: 0.02, fontSize: 1 },

  rules: { gap: 8, marginTop: -2, marginBottom: 4 },
  rule: { alignItems: 'center', gap: 10 },
  ruleDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: COLORS.borderStrong, alignItems: 'center', justifyContent: 'center' },
  ruleDotOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  ruleText: { fontSize: 13, color: COLORS.textSecondary },

  switchRow: { justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 10 },
  switchText: { fontSize: 14, color: COLORS.textSecondary },
});
