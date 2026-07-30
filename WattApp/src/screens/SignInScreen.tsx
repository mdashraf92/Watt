import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { GuestStackParamList } from '../types';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { EyeIcon, EyeOffIcon, PhoneIcon } from '../components/icons';
import AuthHeader from '../components/AuthHeader';
import GradientButton from '../components/GradientButton';

type Nav = NativeStackNavigationProp<GuestStackParamList, 'SignIn'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const { t, toggleLanguage, isRTL } = useLang();
  const { signIn, sendPasswordReset, signInWithPhone, verifyPhoneOtp } = useAuth();

  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [showPass,      setShowPass]      = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [socialLoading, setSocialLoading] = useState<'phone' | null>(null);
  const [emailError,    setEmailError]    = useState<string | null>(null);

  // Phone (OTP) login
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [phoneStep,    setPhoneStep]    = useState<'phone' | 'otp'>('phone');
  const [phoneNumber,  setPhoneNumber]  = useState('');
  const [otpCode,      setOtpCode]      = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError,   setPhoneError]   = useState<string | null>(null);

  // Forgot password
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError,   setForgotError]   = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const validateEmail = (value: string) => {
    if (!value.trim() || !EMAIL_REGEX.test(value.trim())) {
      setEmailError(t.auth_error_email);
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleSignIn = async () => {
    if (!validateEmail(email)) return;
    if (!password) { Alert.alert(t.error, t.auth_error_password_empty); return; }
    try {
      setLoading(true);
      await signIn(email.trim().toLowerCase(), password);
    } catch {
      Alert.alert(t.error, t.auth_error_credentials);
    } finally {
      setLoading(false);
    }
  };

  // ── Phone OTP flow ──
  const fullPhone = () => `+968${phoneNumber.replace(/\D/g, '')}`;

  const openPhone = () => {
    setPhoneNumber(''); setOtpCode(''); setPhoneError(null); setPhoneStep('phone');
    setPhoneVisible(true);
  };

  const handleSendCode = async () => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length !== 8) { setPhoneError(t.phone_error_invalid); return; }
    setPhoneLoading(true); setPhoneError(null);
    try {
      await signInWithPhone(fullPhone());
      setPhoneStep('otp');
    } catch (e: any) {
      const msg = (e?.message ?? '').toLowerCase();
      setPhoneError(
        msg.includes('provider') || msg.includes('not enabled') || msg.includes('disabled')
          ? t.phone_not_configured
          : e.message ?? t.error,
      );
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.replace(/\D/g, '').length !== 6) { setPhoneError(t.otp_error_invalid); return; }
    setPhoneLoading(true); setPhoneError(null);
    try {
      await verifyPhoneOtp(fullPhone(), otpCode.trim());
      setPhoneVisible(false);   // session established — navigator switches automatically
    } catch {
      setPhoneError(t.otp_error_invalid);
    } finally {
      setPhoneLoading(false);
    }
  };

  const openForgot = () => {
    setForgotEmail(''); setForgotError(null); setForgotSuccess(false);
    setForgotVisible(true);
  };

  const handleForgot = async () => {
    const clean = forgotEmail.trim();
    if (!clean || !EMAIL_REGEX.test(clean)) { setForgotError(t.auth_error_email); return; }
    setForgotLoading(true); setForgotError(null);
    try { await sendPasswordReset(clean); setForgotSuccess(true); }
    catch (e: any) { setForgotError(e?.code === 'NO_ACCOUNT' ? t.forgot_no_account : (e.message ?? t.error)); }
    finally { setForgotLoading(false); }
  };

  const isSocialLoading = socialLoading !== null;

  return (
    <View style={s.root}>
      <AuthHeader
        title={t.auth_signin_title}
        subtitle={t.auth_signin_subtitle}
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
            <View style={[s.inputBox, s.inputRow, isRTL && s.rowReverse]}>
              <TextInput
                style={[s.input, { flex: 1 }, isRTL && s.rtlText]}
                placeholder={t.auth_password_ph}
                placeholderTextColor={COLORS.textTertiary}
                secureTextEntry={!showPass}
                value={password}
                onChangeText={setPassword}
                autoComplete="password"
                textContentType="password"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />
              <TouchableOpacity onPress={() => setShowPass(p => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                {showPass
                  ? <EyeOffIcon size={20} color={COLORS.textTertiary} strokeWidth={2} />
                  : <EyeIcon    size={20} color={COLORS.textTertiary} strokeWidth={2} />}
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[s.forgotLink, isRTL && s.forgotLinkRtl]} onPress={openForgot}>
              <Text style={s.forgotLinkText}>{t.forgot_link}</Text>
            </TouchableOpacity>
          </View>

          {/* Sign In button */}
          <GradientButton
            label={t.auth_signin_btn}
            onPress={handleSignIn}
            loading={loading}
            disabled={isSocialLoading}
          />

          {/* Switch to Sign Up */}
          <View style={[s.switchRow, isRTL && s.rowReverse]}>
            <Text style={s.switchText}>{t.auth_no_account}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
              <Text style={s.switchLink}> {t.auth_signup_link}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Social panel — slides off screen when keyboard opens, that's fine */}
        <View style={s.socialPanel}>
          <View style={s.divider}>
            <View style={s.divLine} />
            <Text style={s.divText}>{t.auth_or_divider}</Text>
            <View style={s.divLine} />
          </View>

          <TouchableOpacity
            style={[s.socialBtn, isSocialLoading && s.btnOff]}
            onPress={openPhone} disabled={isSocialLoading} activeOpacity={0.85}
          >
            <PhoneIcon size={19} color={COLORS.primary} strokeWidth={2} />
            <Text style={s.socialText}>{t.auth_phone}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.guestBtn} onPress={() => navigation.navigate('GuestTabs')} activeOpacity={0.7}>
            <Text style={s.guestText}>{isRTL ? `← ${t.auth_browse_guest}` : `${t.auth_browse_guest} →`}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Phone (OTP) login modal ── */}
      <Modal visible={phoneVisible} transparent animationType="slide" onRequestClose={() => setPhoneVisible(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => !phoneLoading && setPhoneVisible(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              {phoneStep === 'phone' ? (
                <>
                  <Text style={s.sheetTitle}>{t.phone_title}</Text>
                  <Text style={s.sheetSub}>{t.phone_subtitle}</Text>
                  <View style={[s.inputBox, s.inputRow, phoneError ? s.inputBoxError : null]}>
                    <Text style={s.phonePrefix}>+968</Text>
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      placeholder="9XXXXXXX"
                      placeholderTextColor={COLORS.textTertiary}
                      value={phoneNumber}
                      onChangeText={v => { setPhoneNumber(v.replace(/\D/g, '').slice(0, 8)); if (phoneError) setPhoneError(null); }}
                      keyboardType="phone-pad"
                      maxLength={8}
                      returnKeyType="send"
                      onSubmitEditing={handleSendCode}
                      autoFocus
                    />
                  </View>
                  {phoneError ? <Text style={s.fieldErr}>{phoneError}</Text> : null}
                  <GradientButton label={t.phone_send_btn} onPress={handleSendCode} loading={phoneLoading} />
                </>
              ) : (
                <>
                  <Text style={s.sheetTitle}>{t.phone_otp_title}</Text>
                  <Text style={s.sheetSub}>{t.phone_otp_subtitle} +968 {phoneNumber}</Text>
                  <View style={[s.inputBox, phoneError ? s.inputBoxError : null]}>
                    <TextInput
                      style={[s.input, s.otpInput]}
                      placeholder="••••••"
                      placeholderTextColor={COLORS.textTertiary}
                      value={otpCode}
                      onChangeText={v => { setOtpCode(v.replace(/\D/g, '').slice(0, 6)); if (phoneError) setPhoneError(null); }}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                      onSubmitEditing={handleVerifyOtp}
                      autoFocus
                    />
                  </View>
                  {phoneError ? <Text style={s.fieldErr}>{phoneError}</Text> : null}
                  <GradientButton label={t.otp_verify_btn} onPress={handleVerifyOtp} loading={phoneLoading} />
                  <TouchableOpacity onPress={handleSendCode} disabled={phoneLoading} style={{ alignSelf: 'center', padding: 6 }}>
                    <Text style={s.forgotLinkText}>{t.otp_resend}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Forgot password modal ── */}
      <Modal visible={forgotVisible} transparent animationType="slide" onRequestClose={() => setForgotVisible(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setForgotVisible(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              {forgotSuccess ? (
                <View style={s.successWrap}>
                  <View style={s.successIcon}><Text style={{ fontSize: 34 }}>✉️</Text></View>
                  <Text style={s.successTitle}>{t.forgot_success_title}</Text>
                  <Text style={s.successMsg}>{t.forgot_success_msg}</Text>
                  <GradientButton label={t.forgot_done} onPress={() => setForgotVisible(false)} />
                </View>
              ) : (
                <>
                  <Text style={[s.sheetTitle, isRTL && s.rtlText]}>{t.forgot_title}</Text>
                  <Text style={[s.sheetSub, isRTL && s.rtlText]}>{t.forgot_subtitle}</Text>
                  <View style={[s.inputBox, forgotError ? s.inputBoxError : null]}>
                    <TextInput
                      style={[s.input, isRTL && s.rtlText]}
                      placeholder={t.auth_email_ph}
                      placeholderTextColor={COLORS.textTertiary}
                      value={forgotEmail}
                      onChangeText={v => { setForgotEmail(v); if (forgotError) setForgotError(null); }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoCorrect={false}
                      returnKeyType="send"
                      onSubmitEditing={handleForgot}
                    />
                  </View>
                  {forgotError ? <Text style={[s.fieldErr, isRTL && s.rtlText]}>{forgotError}</Text> : null}
                  <GradientButton label={t.forgot_send_btn} onPress={handleForgot} loading={forgotLoading} />
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  // ── Body (KAV — shrinks when keyboard appears) ──
  body: { flex: 1, backgroundColor: COLORS.background },

  // ── Form panel (always visible above keyboard) ──
  formPanel: {
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 16,
    gap: 14,
  },

  field:       { gap: 6 },
  label:       { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textSecondary },
  fieldErr:    { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.error, marginTop: 2 },

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

  phonePrefix: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text, marginRight: 8 },
  otpInput:    { textAlign: 'center', fontSize: 24, letterSpacing: 12, fontFamily: FONTS.bold },

  forgotLink:     { alignSelf: 'flex-end', marginTop: 5 },
  forgotLinkText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.primary },

  btnOff:  { opacity: 0.55 },

  switchRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  switchText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.regular },
  switchLink: { color: COLORS.primary, fontSize: 14, fontFamily: FONTS.bold },

  // ── Social panel (can slide off when keyboard appears) ──
  socialPanel: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    gap: 10,
  },

  divider:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divLine:  { flex: 1, height: 1, backgroundColor: COLORS.border },
  divText:  { fontSize: 12, color: COLORS.textTertiary, fontFamily: FONTS.medium },

  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 16, paddingVertical: 14,
    backgroundColor: COLORS.card,
  },
  socialText:  { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.text },

  guestBtn:  { alignItems: 'center', paddingVertical: 6 },
  guestText: { fontSize: 14, color: COLORS.textTertiary, fontFamily: FONTS.medium },

  // ── Modals ──
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

  successWrap:  { alignItems: 'center', gap: 12, paddingVertical: 8 },
  successIcon:  { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.successBg, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text },
  successMsg:   { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },

  // ── RTL helpers ──
  rtlText:      { textAlign: 'right' },
  rowReverse:   { flexDirection: 'row-reverse' },
  forgotLinkRtl:{ alignSelf: 'flex-start' },
});
