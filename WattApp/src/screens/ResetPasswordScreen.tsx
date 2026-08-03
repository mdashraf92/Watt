import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import { GoWattIcon } from '../components/Logo';
import GradientButton from '../components/GradientButton';

// At least 8 chars, with at least one letter and one number (matches sign-up
// and the backend password policy).
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

// Shown at the root (outside the normal navigator) whenever a
// password-recovery deep link has established a recovery session.
export default function ResetPasswordScreen() {
  const { t } = useLang();
  const { completePasswordRecovery, cancelPasswordRecovery } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!PASSWORD_REGEX.test(password)) { setError(t.auth_error_password); return; }
    if (password !== confirm) { setError(t.reset_mismatch); return; }
    setError(null);
    setLoading(true);
    try {
      await completePasswordRecovery(password);
      Alert.alert(t.reset_success_title, t.reset_success_msg);
    } catch (e: any) {
      Alert.alert(t.error, e?.message ?? t.error);
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try { await cancelPasswordRecovery(); } catch {}
  };

  return (
    <View style={s.root}>
      {/* ── Gradient header ── */}
      <LinearGradient colors={GRADIENTS.greenDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
        <View style={s.deco1} /><View style={s.deco2} />
        <View style={s.logoRow}>
          <View style={s.logoBadge}>
            <GoWattIcon size={32} />
          </View>
        </View>
        <Text style={s.title}>{t.reset_title}</Text>
        <Text style={s.subtitle}>{t.reset_subtitle}</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        style={s.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={s.formPanel}>
          {/* New password */}
          <View style={s.field}>
            <Text style={s.label}>{t.reset_new_label}</Text>
            <View style={[s.inputBox, s.inputRow, error ? s.inputBoxError : null]}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder={t.reset_new_ph}
                placeholderTextColor={COLORS.textTertiary}
                secureTextEntry={!showPass}
                value={password}
                onChangeText={v => { setPassword(v); if (error) setError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <TouchableOpacity onPress={() => setShowPass(p => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                {showPass
                  ? <EyeOffIcon size={20} color={COLORS.textTertiary} strokeWidth={2} />
                  : <EyeIcon    size={20} color={COLORS.textTertiary} strokeWidth={2} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm password */}
          <View style={s.field}>
            <Text style={s.label}>{t.reset_confirm_label}</Text>
            <View style={[s.inputBox, error ? s.inputBoxError : null]}>
              <TextInput
                style={s.input}
                placeholder={t.reset_confirm_ph}
                placeholderTextColor={COLORS.textTertiary}
                secureTextEntry={!showPass}
                value={confirm}
                onChangeText={v => { setConfirm(v); if (error) setError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
            {error ? <Text style={s.fieldErr}>{error}</Text> : null}
          </View>

          {/* Submit */}
          <View style={{ marginTop: 4 }}>
            <GradientButton label={t.reset_submit_btn} onPress={handleSubmit} loading={loading} />
          </View>

          {/* Cancel */}
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} disabled={loading} activeOpacity={0.7}>
            <Text style={s.cancelText}>{t.reset_cancel}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.primaryDark },

  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 24,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  deco1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -50 },
  deco2: { position: 'absolute', width: 140, height: 140, borderRadius: 70,  backgroundColor: 'rgba(255,255,255,0.04)', bottom: -40, left: -30 },

  logoRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  logoBadge: {
    width: 50, height: 50, borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontFamily: FONTS.bold, fontSize: 28, color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 19 },

  body: { flex: 1, backgroundColor: COLORS.background },
  formPanel: { paddingHorizontal: 24, paddingTop: 28, gap: 14 },

  field:    { gap: 5 },
  label:    { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  fieldErr: { fontSize: 12, color: COLORS.error, marginTop: 2 },

  inputBox: {
    backgroundColor: COLORS.card,
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 14, paddingHorizontal: 14,
  },
  inputBoxError: { borderColor: COLORS.error },
  inputRow:      { flexDirection: 'row', alignItems: 'center' },
  input:         { paddingVertical: 14, fontSize: 15, color: COLORS.text },

  cancelBtn:  { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontSize: 14, color: COLORS.textTertiary, fontWeight: '600' },
});
