import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { GuestStackParamList } from '../types';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import AuthHeader from '../components/AuthHeader';
import GradientButton from '../components/GradientButton';

type Nav = NativeStackNavigationProp<GuestStackParamList, 'SignUp'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <Path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/>
      <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </Svg>
  );
}

function AppleLogo({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/>
    </Svg>
  );
}

export default function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const { t, toggleLanguage, isRTL } = useLang();
  const { signUp, signInWithGoogle, signInWithApple } = useAuth();

  const [fullName,      setFullName]      = useState('');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [showPass,      setShowPass]      = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [emailError,    setEmailError]    = useState<string | null>(null);
  const [focus,         setFocus]         = useState<string | null>(null);

  const validateEmail = (value: string) => {
    if (!value.trim() || !EMAIL_REGEX.test(value.trim())) {
      setEmailError(t.auth_error_email);
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleSignUp = async () => {
    if (!fullName.trim()) { Alert.alert(t.error, t.auth_error_name); return; }
    if (!validateEmail(email)) return;
    if (password.length < 6) { Alert.alert(t.error, t.auth_error_password); return; }
    try {
      setLoading(true);
      await signUp(email.trim().toLowerCase(), password, fullName.trim());
    } catch (e: any) {
      Alert.alert(t.error, e?.message ?? t.auth_error_credentials);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try { setSocialLoading('google'); await signInWithGoogle(); }
    catch (e: any) { Alert.alert(t.error, e.message ?? t.auth_error_credentials); }
    finally { setSocialLoading(null); }
  };

  const handleApple = async () => {
    try { setSocialLoading('apple'); await signInWithApple(); }
    catch (e: any) { Alert.alert(t.error, e.message ?? t.auth_error_credentials); }
    finally { setSocialLoading(null); }
  };

  const isSocialLoading = socialLoading !== null;

  return (
    <View style={s.root}>
      <AuthHeader
        title={t.auth_signup_title}
        subtitle={t.auth_signup_subtitle}
        languageLabel={t.profile_language_label}
        onToggleLanguage={toggleLanguage}
        isRTL={isRTL}
      />

      {/* ── KAV: shrinks on keyboard, no ScrollView ── */}
      <KeyboardAvoidingView
        style={s.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Form panel — always fully visible.
            NOTE: must NOT be an Animated.View with an `entering` layout
            animation — reanimated re-parents the view on mount, which blurs
            the TextInputs inside and prevents typing. Keep it a plain View. */}
        <View style={s.formPanel}>
          {/* Full Name */}
          <View style={s.field}>
            <Text style={[s.label, isRTL && s.rtlText]}>{t.auth_name_label}</Text>
            <View style={[s.inputBox, focus === 'name' && s.inputBoxFocus]}>
              <TextInput
                style={[s.input, isRTL && s.rtlText]}
                placeholder={t.auth_name_ph}
                placeholderTextColor={COLORS.textTertiary}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onFocus={() => setFocus('name')}
                onBlur={() => setFocus(null)}
              />
            </View>
          </View>

          {/* Email */}
          <View style={s.field}>
            <Text style={[s.label, isRTL && s.rtlText]}>{t.auth_email_label}</Text>
            <View style={[s.inputBox, focus === 'email' && s.inputBoxFocus, emailError ? s.inputBoxError : null]}>
              <TextInput
                style={[s.input, isRTL && s.rtlText]}
                placeholder={t.auth_email_ph}
                placeholderTextColor={COLORS.textTertiary}
                value={email}
                onChangeText={v => { setEmail(v); if (emailError) validateEmail(v); }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                returnKeyType="next"
                onFocus={() => setFocus('email')}
                onBlur={() => { setFocus(null); if (email) validateEmail(email); }}
              />
            </View>
            {emailError ? <Text style={[s.fieldErr, isRTL && s.rtlText]}>{emailError}</Text> : null}
          </View>

          {/* Password */}
          <View style={s.field}>
            <Text style={[s.label, isRTL && s.rtlText]}>{t.auth_password_label}</Text>
            <View style={[s.inputBox, s.inputRow, focus === 'password' && s.inputBoxFocus, isRTL && s.rowReverse]}>
              <TextInput
                style={[s.input, { flex: 1 }, isRTL && s.rtlText]}
                placeholder={t.auth_password_ph}
                placeholderTextColor={COLORS.textTertiary}
                secureTextEntry={!showPass}
                value={password}
                onChangeText={setPassword}
                autoCorrect={false}
                returnKeyType="done"
                onFocus={() => setFocus('password')}
                onBlur={() => setFocus(null)}
                onSubmitEditing={handleSignUp}
              />
              <TouchableOpacity onPress={() => setShowPass(p => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                {showPass
                  ? <EyeOffIcon size={20} color={COLORS.textTertiary} strokeWidth={2} />
                  : <EyeIcon    size={20} color={COLORS.textTertiary} strokeWidth={2} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Create Account */}
          <GradientButton
            label={t.auth_signup_btn}
            onPress={handleSignUp}
            loading={loading}
            disabled={isSocialLoading}
          />

          {/* Switch to Sign In */}
          <View style={[s.switchRow, isRTL && s.rowReverse]}>
            <Text style={s.switchText}>{t.auth_have_account}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
              <Text style={s.switchLink}> {t.auth_signin_link}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Social panel — slides off when keyboard opens */}
        <View style={s.socialPanel}>
          <View style={s.divider}>
            <View style={s.divLine} />
            <Text style={s.divText}>{t.auth_or_divider}</Text>
            <View style={s.divLine} />
          </View>

          <TouchableOpacity
            style={[s.socialBtn, isSocialLoading && s.btnOff]}
            onPress={handleGoogle} disabled={isSocialLoading} activeOpacity={0.85}
          >
            {socialLoading === 'google'
              ? <ActivityIndicator color={COLORS.text} size="small" />
              : <><GoogleLogo size={20} /><Text style={s.socialText}>{t.auth_google}</Text></>}
          </TouchableOpacity>

          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[s.socialBtn, s.socialApple, isSocialLoading && s.btnOff]}
              onPress={handleApple} disabled={isSocialLoading} activeOpacity={0.85}
            >
              {socialLoading === 'apple'
                ? <ActivityIndicator color="#fff" size="small" />
                : <><AppleLogo size={20} color="#fff" /><Text style={[s.socialText, { color: '#fff' }]}>{t.auth_apple}</Text></>}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  // ── Body ──
  body: { flex: 1, backgroundColor: COLORS.background },

  formPanel: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    gap: 13,
  },

  field:         { gap: 6 },
  label:         { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textSecondary },
  fieldErr:      { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.error, marginTop: 2 },

  inputBox: {
    backgroundColor: COLORS.card,
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 14, paddingHorizontal: 14,
  },
  inputBoxFocus: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 2,
  },
  inputBoxError: { borderColor: COLORS.error },
  inputRow:      { flexDirection: 'row', alignItems: 'center' },
  input:         { paddingVertical: 14, fontSize: 15, color: COLORS.text, fontFamily: FONTS.medium },

  btnOff:  { opacity: 0.55 },

  switchRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  switchText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.regular },
  switchLink: { color: COLORS.primary, fontSize: 14, fontFamily: FONTS.bold },

  socialPanel: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    gap: 10,
  },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  divText: { fontSize: 12, color: COLORS.textTertiary, fontFamily: FONTS.medium },

  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 16, paddingVertical: 14,
    backgroundColor: COLORS.card,
  },
  socialApple: { backgroundColor: '#000', borderColor: '#000' },
  socialText:  { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.text },

  // ── RTL helpers ──
  rtlText:    { textAlign: 'right' },
  rowReverse: { flexDirection: 'row-reverse' },
});
