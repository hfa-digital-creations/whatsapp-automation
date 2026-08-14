import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import { Button, Card, ErrorText, Input, Label } from '../components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(apiErrorMessage(err));
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
            Reset Password
          </h1>
          <p className="mt-1 text-xs text-slate-400">We'll send recovery instructions to your email and WhatsApp</p>
        </div>

        <Card className="p-7 sm:p-8 backdrop-blur-2xl border-white/15 bg-slate-900/70 shadow-2xl">
          {submitted ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-100">Recovery Link Sent</p>
              <p className="mt-2 text-xs text-slate-400">
                If an account exists for <span className="text-slate-200 font-medium">{email}</span>, we have sent a password reset link. Please check your inbox and WhatsApp.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
              <ErrorText>{error}</ErrorText>
              <Button type="submit" className="w-full py-2.5 mt-2" disabled={loading}>
                {loading ? 'Sending link...' : 'Send Reset Link'}
              </Button>
            </form>
          )}
        </Card>

        <div className="mt-6 text-center text-xs">
          <Link to="/login" className="text-slate-400 hover:text-brand-400 transition-colors">
            &larr; Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

