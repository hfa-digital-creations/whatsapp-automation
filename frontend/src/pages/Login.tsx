import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card, ErrorText, Input, Label } from '../components/ui';

export default function Login() {
  const { auth, login, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginOtpId, setLoginOtpId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (auth) {
    if (auth.role === 'CLIENT') {
      return <Navigate to={auth.mustChangePassword ? '/app/change-password' : '/app'} replace />;
    }
    return <Navigate to="/admin" replace />;
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.otpRequired) {
        setLoginOtpId(result.loginOtpId);
      } else {
        // This account has login OTP disabled — the session is already established.
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyOtp(loginOtpId!, code);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100 overflow-hidden">
      {/* Ambient background glow mesh */}
      <div className="glass-bg-mesh">
        <div className="glass-blob-1" />
        <div className="glass-blob-2" />
        <div className="glass-blob-3" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-amber-400 text-white shadow-lg shadow-brand-500/30 ring-4 ring-white/10">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-brand-400 via-orange-300 to-amber-300 bg-clip-text text-transparent">
            WA Automation
          </h1>
          <p className="mt-1 text-xs text-slate-400">Enterprise WhatsApp AI &amp; Customer Automation</p>
        </div>

        <Card className="p-7 sm:p-8 backdrop-blur-2xl border-white/15 bg-slate-900/70 shadow-2xl">
          {loginOtpId ? (
            <div>
              <div className="mb-4 text-center">
                <span className="inline-flex rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold text-brand-400">
                  Two-Factor Authentication
                </span>
                <p className="mt-2 text-xs text-slate-300">
                  We emailed a 6-digit verification code to <span className="font-semibold text-slate-100">{email}</span>.
                </p>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-4">
                <div>
                  <Label>Verification Code</Label>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-xl tracking-[0.4em] font-mono py-2.5"
                    autoFocus
                  />
                </div>
                <ErrorText>{error}</ErrorText>
                <Button type="submit" className="w-full py-2.5" disabled={loading || code.length !== 6}>
                  {loading ? 'Verifying...' : 'Verify & Sign In'}
                </Button>
              </form>
              <button
                type="button"
                onClick={() => { setLoginOtpId(null); setCode(''); setError(''); }}
                className="mt-4 block w-full text-center text-xs text-slate-400 hover:text-brand-400 transition-colors"
              >
                &larr; Use a different account
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <Label>Account Email</Label>
                <Input
                  type="email"
                  required
                  placeholder="name@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Password</Label>
                  <Link to="/forgot-password" tabIndex={-1} className="text-xs text-brand-400 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <ErrorText>{error}</ErrorText>
              <Button type="submit" className="w-full py-2.5 mt-2" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          )}
        </Card>

        <div className="mt-6 text-center text-xs text-slate-500">
          <Link to="/" className="text-slate-400 hover:text-slate-200 transition-colors">
            &larr; Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

