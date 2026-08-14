import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, apiErrorMessage, getStoredAuth, setStoredAuth, type StoredAuth } from '../lib/api';

type LoginResult = { otpRequired: true; loginOtpId: string } | { otpRequired: false };

interface AuthContextValue {
  auth: StoredAuth | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyOtp: (loginOtpId: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMustChangePassword: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => getStoredAuth());

  useEffect(() => {
    const onStorage = () => setAuth(getStoredAuth());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Step 1: password only. Normally never signs the user in directly — a real
  // session is only created once verifyOtp confirms the emailed code. The one
  // exception is a client an admin has explicitly opted out of login OTP for
  // (Client.loginOtpEnabled = false), where the backend returns real tokens
  // right here instead of an OTP challenge.
  async function login(email: string, password: string): Promise<LoginResult> {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const result = data.data as LoginResult & Partial<StoredAuth>;
      if (!result.otpRequired) {
        setStoredAuth(result as StoredAuth);
        setAuth(result as StoredAuth);
      }
      return result;
    } catch (err) {
      throw new Error(apiErrorMessage(err));
    }
  }

  // Step 2: the emailed code. Only this call actually establishes a session.
  async function verifyOtp(loginOtpId: string, code: string) {
    try {
      const { data } = await api.post('/auth/verify-login-otp', { loginOtpId, code });
      const next: StoredAuth = data.data;
      setStoredAuth(next);
      setAuth(next);
    } catch (err) {
      throw new Error(apiErrorMessage(err));
    }
  }

  async function logout() {
    if (auth?.refreshToken) {
      await api.post('/auth/logout', { refreshToken: auth.refreshToken }).catch(() => undefined);
    }
    setStoredAuth(null);
    setAuth(null);
  }

  function refreshMustChangePassword(value: boolean) {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, mustChangePassword: value };
      setStoredAuth(next);
      return next;
    });
  }

  return (
    <AuthContext.Provider value={{ auth, login, verifyOtp, logout, refreshMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
