import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, Modal,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
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
// At least 8 chars, with at least one letter and one number.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const { t, toggleLanguage, isRTL } = useLang();
  const { signUp, verifySignUp } = useAuth();

  const [fullName,      setFullName]      = useState('');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [confirmPassword,      setConfirmPassword]      = useState('');
  const [showPass,      setShowPass]      = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [emailError,    setEmailError]    = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // Email verification — sign-up sends a code before the account exists;
  // the account is only created once this code is confirmed.
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpCode,    setOtpCode]    = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError,   setOtpError]   = useState<string | null>(null);

  const validateEmail = (value: string) => {
    if (!value.trim() || !EMAIL_REGEX.test(value.trim())) {
      setEmailError(t.auth_error_email);
      return false;
    }
    setEmailError(null);
    return true;
  };

  const validatePassword = (value: string) => {
    if (!PASSWORD_REGEX.test(value)) {
      setPasswordError(t.auth_error_password);
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const validateConfirmPassword = (value: string, against: string = password) => {
    if (value !== against) {
      setConfirmPasswordError(t.auth_error_password_mismatch);
      return false;
    }
    setConfirmPasswordError(null);
    return true;
  };

  const handleSignUp = async () => {
    if (!fullName.trim()) { Alert.alert(t.error, t.auth_error_name); return; }
    if (!validateEmail(email)) return;
    if (!validatePassword(password)) return;
    if (!validateConfirmPassword(confirmPassword)) return;
    try {
      setLoading(true);
      await signUp(email.trim().toLowerCase(), password, fullName.trim());
      setOtpCode(''); setOtpError(null); setOtpVisible(true);
    } catch (e: any) {
      Alert.alert(t.error, e?.message ?? t.auth_error_credentials);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpLoading(true); setOtpError(null);
    try { await signUp(email.trim().toLowerCase(), password, fullName.trim()); }
    catch (e: any) { setOtpError(e?.message ?? t.error); }
    finally { setOtpLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.replace(/\D/g, '').length !== 6) { setOtpError(t.otp_error_invalid); return; }
    setOtpLoading(true); setOtpError(null);
    try {
      await verifySignUp(email.trim().toLowerCase(), otpCode.trim());
      setOtpVisible(false);   // session established — navigator switches automatically
    } catch (e: any) {
      setOtpError(e?.message ?? t.otp_error_invalid);
    } finally {
      setOtpLoading(false);
    }
  };

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
            <View style={s.inputBox}>
              <TextInput
                style={[s.input, isRTL && s.rtlText]}
                placeholder={t.auth_name_ph}
                placeholderTextColor={COLORS.textTertiary}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Email */}
          <View style={s.field}>
            <Text style={[s.label, isRTL && s.rtlText]}>{t.auth_email_label}</Text>
            <View style={[s.inputBox, emailError ? s.inputBoxError : null]}>
              <TextInput
                style={[s.input, isRTL && s.rtlText]}
                placeholder={t.auth_email_ph}
                placeholderTextColor={COLORS.textTertiary}
                value={email}
                onChangeText={v => { setEmail(v); if (emailError) validateEmail(v); }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                autoCorrect={false}
                returnKeyType="next"
                onBlur={() => { if (email) validateEmail(email); }}
              />
            </View>
            {emailError ? <Text style={[s.fieldErr, isRTL && s.rtlText]}>{emailError}</Text> : null}
          </View>

          {/* Password */}
          <View style={s.field}>
            <Text style={[s.label, isRTL && s.rtlText]}>{t.auth_password_label}</Text>
            <View style={[s.inputBox, s.inputRow, isRTL && s.rowReverse, passwordError ? s.inputBoxError : null]}>
              <TextInput
                style={[s.input, { flex: 1 }, isRTL && s.rtlText]}
                placeholder={t.auth_password_ph}
                placeholderTextColor={COLORS.textTertiary}
                secureTextEntry={!showPass}
                value={password}
                onChangeText={v => {
                  setPassword(v);
                  if (passwordError) validatePassword(v);
                  if (confirmPasswordError) validateConfirmPassword(confirmPassword, v);
                }}
                autoComplete="new-password"
                textContentType="newPassword"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                onBlur={() => { if (password) validatePassword(password); }}
              />
              <TouchableOpacity onPress={() => setShowPass(p => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                {showPass
                  ? <EyeOffIcon size={20} color={COLORS.textTertiary} strokeWidth={2} />
                  : <EyeIcon    size={20} color={COLORS.textTertiary} strokeWidth={2} />}
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={[s.fieldErr, isRTL && s.rtlText]}>{passwordError}</Text> : null}
          </View>

          {/* Confirm Password */}
          <View style={s.field}>
            <Text style={[s.label, isRTL && s.rtlText]}>{t.auth_confirm_password_label}</Text>
            <View style={[s.inputBox, s.inputRow, isRTL && s.rowReverse, confirmPasswordError ? s.inputBoxError : null]}>
              <TextInput
                ref={confirmPasswordRef}
                style={[s.input, { flex: 1 }, isRTL && s.rtlText]}
                placeholder={t.auth_confirm_password_ph}
                placeholderTextColor={COLORS.textTertiary}
                secureTextEntry={!showConfirmPass}
                value={confirmPassword}
                onChangeText={v => { setConfirmPassword(v); if (confirmPasswordError) validateConfirmPassword(v); }}
                autoComplete="new-password"
                textContentType="newPassword"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
                onBlur={() => { if (confirmPassword) validateConfirmPassword(confirmPassword); }}
              />
              <TouchableOpacity onPress={() => setShowConfirmPass(p => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                {showConfirmPass
                  ? <EyeOffIcon size={20} color={COLORS.textTertiary} strokeWidth={2} />
                  : <EyeIcon    size={20} color={COLORS.textTertiary} strokeWidth={2} />}
              </TouchableOpacity>
            </View>
            {confirmPasswordError ? <Text style={[s.fieldErr, isRTL && s.rtlText]}>{confirmPasswordError}</Text> : null}
          </View>

          {/* Create Account */}
          <GradientButton
            label={t.auth_signup_btn}
            onPress={handleSignUp}
            loading={loading}
          />

          {/* Switch to Sign In */}
          <View style={[s.switchRow, isRTL && s.rowReverse]}>
            <Text style={s.switchText}>{t.auth_have_account}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
              <Text style={s.switchLink}> {t.auth_signin_link}</Text>
            </TouchableOpacity>
          </View>
        </View>

      </KeyboardAvoidingView>

      {/* ── Email verification modal — account is created only after this ── */}
      <Modal visible={otpVisible} transparent animationType="slide" onRequestClose={() => setOtpVisible(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => !otpLoading && setOtpVisible(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <Text style={[s.sheetTitle, isRTL && s.rtlText]}>{t.signup_otp_title}</Text>
              <Text style={[s.sheetSub, isRTL && s.rtlText]}>{t.signup_otp_subtitle} {email.trim()}</Text>
              <View style={[s.inputBox, otpError ? s.inputBoxError : null]}>
                <TextInput
                  style={[s.input, s.otpInput]}
                  placeholder="••••••"
                  placeholderTextColor={COLORS.textTertiary}
                  value={otpCode}
                  onChangeText={v => { setOtpCode(v.replace(/\D/g, '').slice(0, 6)); if (otpError) setOtpError(null); }}
                  keyboardType="number-pad"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handleVerifyOtp}
                  autoFocus
                />
              </View>
              {otpError ? <Text style={s.fieldErr}>{otpError}</Text> : null}
              <GradientButton label={t.otp_verify_btn} onPress={handleVerifyOtp} loading={otpLoading} />
              <TouchableOpacity onPress={handleResendOtp} disabled={otpLoading} style={{ alignSelf: 'center', padding: 6 }}>
                <Text style={s.switchLink}>{t.otp_resend}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  socialText:  { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.text },

  // ── RTL helpers ──
  rtlText:    { textAlign: 'right' },
  rowReverse: { flexDirection: 'row-reverse' },

  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    gap: 14,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderStrong, alignSelf: 'center', marginBottom: 4 },
  sheetTitle:  { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text },
  sheetSub:    { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  otpInput:    { textAlign: 'center', fontSize: 24, letterSpacing: 12, fontFamily: FONTS.bold },
});
