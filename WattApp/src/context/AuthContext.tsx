import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { api, ApiError, setOnSessionLost } from '../lib/api';
import { tokenStore } from '../lib/tokenStore';
import { realtime } from '../lib/realtime';
import { registerForPushNotifications, unregisterPushNotifications } from '../lib/notifications';
import type { Profile } from '../types';

// Minimal session shape the app relies on (screens use session.user.id / !!session).
export type AppSession = { user: { id: string; email: string | null } } | null;

function parseAuthParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const collect = (str: string) => {
    for (const pair of str.split('&')) {
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const k = decodeURIComponent(pair.slice(0, eq));
      const v = decodeURIComponent(pair.slice(eq + 1));
      if (k) params[k] = v;
    }
  };
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  if (q >= 0) collect(url.slice(q + 1, h >= 0 ? h : undefined));
  if (h >= 0) collect(url.slice(h + 1));
  return params;
}

interface AuthContextType {
  session:    AppSession;
  profile:    Profile | null;
  loading:    boolean;
  profileError: boolean;
  recoveryMode: boolean;
  signOut:           () => Promise<void>;
  refreshProfile:    () => Promise<void>;
  updateProfile:     (data: Partial<Profile>) => Promise<void>;
  deactivateAccount: () => Promise<void>;
  deleteAccount:     () => Promise<void>;
  signIn:            (email: string, password: string) => Promise<void>;
  signUp:            (email: string, password: string, fullName: string) => Promise<void>;
  verifySignUp:      (email: string, code: string) => Promise<void>;
  signInWithGoogle:   () => Promise<void>;
  signInWithApple:    () => Promise<void>;
  signInWithPhone:    (phone: string) => Promise<void>;
  verifyPhoneOtp:     (phone: string, token: string) => Promise<void>;
  signInWithEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp:     (email: string, code: string) => Promise<void>;
  sendPasswordReset:  (email: string) => Promise<void>;
  completePasswordRecovery: (newPassword: string) => Promise<void>;
  cancelPasswordRecovery:   () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session,      setSession]      = useState<AppSession>(null);
  const [profile,      setProfile]      = useState<Profile | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const resetToken = useRef<string | null>(null);   // from the reset-password deep link

  // Load the current user's profile from the backend and set session state.
  const loadProfile = useCallback(async (opts: { silent?: boolean } = {}) => {
    try {
      const p: any = await api.profile.me();
      if (!p) { setProfileError(true); return; }
      if (p.is_active === false) {
        Alert.alert('Account Deactivated', 'This account has been deactivated. Contact support if this was a mistake.');
        await doSignOut();
        return;
      }
      setProfile(p as Profile);
      setSession({ user: { id: p.id, email: p.email ?? null } });
      setProfileError(false);
      registerForPushNotifications(p.id).catch(() => {});
    } catch {
      // Couldn't load (no connection / server error) — show the Retry screen
      // instead of hanging on the splash spinner.
      setProfileError(true);
    } finally {
      if (!opts.silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSignOut = useCallback(async () => {
    const rt = tokenStore.getRefresh();
    try { await api.auth.logout(rt ?? undefined); } catch { /* ignore */ }
    if (session?.user.id) unregisterPushNotifications(session.user.id).catch(() => {});
    await tokenStore.clear();
    realtime.disconnect();
    setSession(null);
    setProfile(null);
    setProfileError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  // Startup: restore tokens and load the profile if we have a session.
  useEffect(() => {
    setOnSessionLost(() => { setSession(null); setProfile(null); realtime.disconnect(); });
    (async () => {
      await tokenStore.load();
      if (tokenStore.getAccess() || tokenStore.getRefresh()) {
        await loadProfile();
      } else {
        setLoading(false);
      }
    })();
  }, [loadProfile]);

  // ── Password-reset deep link (watt://reset-password?token=…) ────
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url || !url.includes('reset-password')) return;
      const p = parseAuthParams(url);
      if (p.token) {
        resetToken.current = p.token;
        setRecoveryMode(true);
      } else if (p.error_description) {
        Alert.alert('Reset link problem', p.error_description);
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  // ── Auth actions ────────────────────────────────────────────────
  const afterAuth = async (r: any) => {
    await tokenStore.set(r.access_token, r.refresh_token);
    realtime.reconnectWithToken();
    await loadProfile();
  };

  const signIn = async (email: string, password: string) => {
    const r = await api.auth.login(email.trim().toLowerCase(), password);
    await afterAuth(r);
  };

  // Sign-up is verify-then-create: signUp only sends a code (no account yet);
  // verifySignUp creates the account once that code is confirmed. Catches a
  // mistyped email at sign-up instead of silently creating an account nobody
  // can ever verify or recover.
  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      await api.auth.registerStart(email.trim().toLowerCase(), password, fullName);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'conflict') {
        throw new Error('This email is already registered. Please sign in instead.');
      }
      throw e;
    }
  };
  const verifySignUp = async (email: string, code: string) => {
    const r = await api.auth.registerVerify(email.trim().toLowerCase(), code);
    await afterAuth(r);
  };

  const notAvailable = (what: string) => async () => {
    Alert.alert('Not available yet', `${what} sign-in isn't enabled on this server yet.`);
    throw new Error(`${what} sign-in not available`);
  };
  const signInWithGoogle = notAvailable('Google');
  const signInWithApple  = notAvailable('Apple');

  // Phone / OTP: start sends a code by SMS; verify exchanges the code for a
  // session (creating the account on first login for a new number).
  const signInWithPhone = async (phone: string) => {
    await api.auth.phoneStart(phone);
  };
  const verifyPhoneOtp = async (phone: string, token: string) => {
    const r = await api.auth.phoneVerify(phone, token);
    await afterAuth(r);
  };

  // Email OTP: a second, self-controlled login channel for accounts already
  // registered by email — useful while SMS (Omantel) is still pending. Never
  // creates an account; the server silently no-ops start() for an unknown
  // email so this can't be used to probe which addresses are registered.
  const signInWithEmailOtp = async (email: string) => {
    await api.auth.emailOtpStart(email);
  };
  const verifyEmailOtp = async (email: string, code: string) => {
    const r = await api.auth.emailOtpVerify(email, code);
    await afterAuth(r);
  };

  const sendPasswordReset = async (email: string) => {
    const clean = email.trim().toLowerCase();
    const { exists } = await api.auth.checkEmail(clean);
    if (!exists) {
      const err = new Error('NO_ACCOUNT');
      (err as any).code = 'NO_ACCOUNT';
      throw err;
    }
    await api.auth.forgotPassword(clean);
  };

  const completePasswordRecovery = async (newPassword: string) => {
    if (!resetToken.current) throw new Error('This reset link is no longer valid. Please request a new one.');
    await api.auth.resetPassword(resetToken.current, newPassword);
    resetToken.current = null;
    setRecoveryMode(false);
  };

  const cancelPasswordRecovery = async () => {
    resetToken.current = null;
    setRecoveryMode(false);
  };

  const signOut = async () => { await doSignOut(); };

  const deactivateAccount = async () => {
    await api.profile.update({ is_active: false } as any);
    await doSignOut();
  };

  const deleteAccount = async () => {
    if (session?.user.id) await unregisterPushNotifications(session.user.id).catch(() => {});
    await api.profile.delete();
    await tokenStore.clear();
    realtime.disconnect();
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (session) await loadProfile({ silent: true });
  };

  const updateProfile = async (data: Partial<Profile>) => {
    const updated: any = await api.profile.update(data as Record<string, any>);
    if (updated) setProfile(updated as Profile);
  };

  return (
    <AuthContext.Provider value={{
      session, profile, loading, profileError, recoveryMode,
      signIn, signUp, verifySignUp, signInWithGoogle, signInWithApple, signInWithPhone, verifyPhoneOtp,
      signInWithEmailOtp, verifyEmailOtp,
      sendPasswordReset, completePasswordRecovery, cancelPasswordRecovery,
      signOut, deactivateAccount, deleteAccount, refreshProfile, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
