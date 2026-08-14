import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, ErrorText, Input, Label } from '../../components/ui';

export default function ClientChangePassword() {
  const { auth, refreshMustChangePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (auth && !auth.mustChangePassword) {
    return <Navigate to="/app" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      refreshMustChangePassword(false);
      navigate('/app', { replace: true });
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
            Set Your Password
          </h1>
          <p className="mt-1 text-xs text-slate-400">For security, please set your personalized password before accessing your dashboard</p>
        </div>

        <Card className="p-7 sm:p-8 backdrop-blur-2xl border-white/15 bg-slate-900/70 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Temporary Password</Label>
              <Input
                type="password"
                required
                placeholder="Temporary password from email"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                required
                minLength={8}
                placeholder="Min 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                required
                minLength={8}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full py-2.5 mt-2" disabled={loading}>
              {loading ? 'Saving...' : 'Set Password & Continue'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

