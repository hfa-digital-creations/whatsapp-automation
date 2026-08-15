import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Select, Spinner } from '../../components/ui';

interface Plan { id: string; title: string; }
interface Feature { id: string; code: string; name: string; }

export default function AdminClientDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { data: client, isLoading } = useQuery({
    queryKey: ['admin-client', id],
    queryFn: async () => (await api.get(`/admin/clients/${id}`)).data.data,
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['admin-plans-active'],
    queryFn: async () => (await api.get('/admin/plans', { params: { status: 'ACTIVE' } })).data.data,
  });

  const { data: features } = useQuery<Feature[]>({
    queryKey: ['admin-features'],
    queryFn: async () => (await api.get('/admin/features')).data.data,
  });

  const { data: effectiveFeatures } = useQuery<Record<string, boolean>>({
    queryKey: ['admin-client-features', id],
    queryFn: async () => (await api.get(`/admin/features/client/${id}/effective`)).data.data,
    enabled: !!id,
  });

  const { data: payments } = useQuery({
    queryKey: ['admin-client-payments', id],
    queryFn: async () => (await api.get(`/admin/clients/${id}/payments`)).data.data,
  });

  const { data: whatsappAccounts } = useQuery({
    queryKey: ['admin-client-whatsapp', id],
    queryFn: async () => (await api.get('/admin/whatsapp/accounts')).data.data,
    select: (all: any[]) => all.filter((a) => a.clientId === id),
  });

  const { data: branding } = useQuery({
    queryKey: ['admin-client-branding', id],
    queryFn: async () => (await api.get(`/admin/clients/${id}/branding`)).data.data,
  });

  const [brandingValues, setBrandingValues] = useState({ logoUrl: '', primaryColor: '#F97316', secondaryColor: '#FFFFFF', accentColor: '#1F2937', theme: 'light' });
  useEffect(() => {
    if (branding) {
      setBrandingValues({
        logoUrl: branding.logoUrl ?? '',
        primaryColor: branding.primaryColor ?? '#F97316',
        secondaryColor: branding.secondaryColor ?? '#FFFFFF',
        accentColor: branding.accentColor ?? '#1F2937',
        theme: branding.theme ?? 'light',
      });
    }
  }, [branding]);

  const brandingMutation = useMutation({
    mutationFn: () => api.patch(`/admin/clients/${id}/branding`, brandingValues),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-client-branding', id] }),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const [activatePlanId, setActivatePlanId] = useState('');
  const activateMutation = useMutation({
    mutationFn: () => api.post(`/admin/clients/${id}/activate`, { planId: activatePlanId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client', id] });
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: (action: 'block' | 'unblock' | 'delete') => api.patch(`/admin/clients/${id}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-client', id] }),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const [resetSent, setResetSent] = useState(false);
  const resetPasswordMutation = useMutation({
    mutationFn: () => api.post(`/admin/clients/${id}/reset-password`),
    onSuccess: () => {
      setResetSent(true);
      setError('');
      setTimeout(() => setResetSent(false), 4000);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const [paymentForm, setPaymentForm] = useState({ type: 'SUBSCRIPTION', planId: '', voucherCode: '' });
  const paymentMutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/clients/${id}/payments`, {
        type: paymentForm.type,
        planId: paymentForm.planId || undefined,
        voucherCode: paymentForm.voucherCode || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-payments', id] });
      setPaymentForm({ type: 'SUBSCRIPTION', planId: '', voucherCode: '' });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const overrideMutation = useMutation({
    mutationFn: ({ code, enabled }: { code: string; enabled: boolean | null }) =>
      api.patch(`/admin/features/client/${id}/${code}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-client-features', id] }),
  });

  const loginOtpMutation = useMutation({
    mutationFn: (enabled: boolean) => api.patch(`/admin/clients/${id}/login-otp`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-client', id] }),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  if (isLoading || !client) return <Spinner />;

  return (
    <div className="space-y-6 animate-glass-entrance">
      {/* Header Breadcrumb & Profile */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/clients"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/60 text-slate-600 backdrop-blur-md transition-colors hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {client.businessName}
              </h1>
              <Badge tone={client.user.status === 'ACTIVE' ? 'green' : client.user.status === 'BLOCKED' ? 'red' : 'gray'}>
                {client.user.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {client.user.email} &middot; {client.user.phone ?? 'No phone registered'}
            </p>
          </div>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Account & Subscription Card */}
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            Account &amp; Subscription
          </h2>
          <dl className="divide-y divide-slate-100 dark:divide-white/5 text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Account status</dt>
              <dd><Badge tone={client.user.status === 'ACTIVE' ? 'green' : 'red'}>{client.user.status}</Badge></dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Current Plan</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">{client.plan?.title ?? '—'}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Subscription status</dt>
              <dd><Badge tone={client.subscriptionStatus === 'ACTIVE' ? 'green' : 'amber'}>{client.subscriptionStatus}</Badge></dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Remaining days</dt>
              <dd className="font-bold text-slate-800 dark:text-slate-200">{client.remainingDays ?? '—'}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">WhatsApp accounts limit</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">{client._count.whatsappAccounts}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Login OTP (2FA)</dt>
              <dd><Badge tone={client.loginOtpEnabled ? 'green' : 'amber'}>{client.loginOtpEnabled ? 'Required' : 'Disabled'}</Badge></dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
            <Select value={activatePlanId} onChange={(e) => setActivatePlanId(e.target.value)} className="w-full sm:w-auto max-w-[200px]">
              <option value="">{client.plan ? `Keep: ${client.plan.title}` : 'Select plan'}</option>
              {plans?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
            <Button onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending} className="text-xs">
              {client.user.status === 'ACTIVE' ? 'Extend Plan' : 'Activate Client'}
            </Button>
            {client.user.status === 'BLOCKED' ? (
              <Button variant="secondary" className="text-xs" onClick={() => statusMutation.mutate('unblock')}>Unblock</Button>
            ) : (
              <Button variant="secondary" className="text-xs" onClick={() => statusMutation.mutate('block')}>Block</Button>
            )}
            <Button variant="danger" className="text-xs" onClick={() => statusMutation.mutate('delete')}>Delete</Button>
            <Button variant="secondary" className="text-xs" onClick={() => resetPasswordMutation.mutate()} disabled={resetPasswordMutation.isPending}>
              {resetSent ? 'Link Sent!' : 'Reset Password'}
            </Button>
            <Button
              variant="secondary"
              className="text-xs"
              disabled={loginOtpMutation.isPending}
              onClick={() => loginOtpMutation.mutate(!client.loginOtpEnabled)}
            >
              {client.loginOtpEnabled ? 'Disable OTP' : 'Enable OTP'}
            </Button>
          </div>
        </Card>

        {/* Record Payment Card */}
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Record Payment
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            <Select value={paymentForm.type} onChange={(e) => setPaymentForm({ ...paymentForm, type: e.target.value })}>
              <option value="SUBSCRIPTION">Subscription</option>
              <option value="RENEWAL">Renewal</option>
              <option value="ADDITIONAL_ACCOUNT">Additional Account</option>
            </Select>
            <Select value={paymentForm.planId} onChange={(e) => setPaymentForm({ ...paymentForm, planId: e.target.value })}>
              <option value="">{paymentForm.type === 'ADDITIONAL_ACCOUNT' ? 'Current Plan' : 'Select plan'}</option>
              {plans?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
            <Input placeholder="Voucher code (optional)" value={paymentForm.voucherCode} onChange={(e) => setPaymentForm({ ...paymentForm, voucherCode: e.target.value })} />
            <Button onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending} className="text-xs">Record Payment</Button>
          </div>
          <div className="mt-4 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
            {payments?.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{p.type}</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                <Badge tone={p.status === 'SUCCESS' ? 'green' : 'amber'}>{p.status}</Badge>
              </div>
            ))}
            {(!payments || payments.length === 0) && <p className="py-4 text-center text-xs text-slate-400">No payments recorded.</p>}
          </div>
        </Card>

        {/* Feature Overrides Card */}
        <Card className="p-6">
          <h2 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            Feature Overrides
          </h2>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Overrides take priority over the plan's default capabilities.</p>
          <ul className="divide-y divide-slate-100 dark:divide-white/5 space-y-1">
            {features?.map((f) => {
              const enabled = effectiveFeatures?.[f.code] ?? false;
              return (
                <li key={f.id} className="flex items-center justify-between py-2 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{f.name}</span>
                  <div className="flex gap-1">
                    <Button variant={enabled ? 'primary' : 'secondary'} className="px-2.5 py-1 text-[11px]" onClick={() => overrideMutation.mutate({ code: f.code, enabled: true })}>On</Button>
                    <Button variant={!enabled ? 'danger' : 'secondary'} className="px-2.5 py-1 text-[11px]" onClick={() => overrideMutation.mutate({ code: f.code, enabled: false })}>Off</Button>
                    <Button variant="ghost" className="px-2 py-1 text-[11px]" onClick={() => overrideMutation.mutate({ code: f.code, enabled: null })}>Reset</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Connected WhatsApp Sessions */}
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-500" />
            WhatsApp Accounts
          </h2>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {whatsappAccounts?.map((a: any) => (
              <li key={a.id} className="flex items-center justify-between py-2.5 text-xs">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{a.displayName ?? a.phoneNumber ?? a.sessionId}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{a.phoneNumber ?? 'Session ID: ' + a.sessionId.slice(0, 10)}</p>
                </div>
                <Badge tone={a.status === 'CONNECTED' ? 'green' : 'gray'}>{a.status}</Badge>
              </li>
            ))}
            {(!whatsappAccounts || whatsappAccounts.length === 0) && (
              <li className="py-6 text-center text-xs text-slate-400">No WhatsApp accounts connected yet.</li>
            )}
          </ul>
        </Card>

        {/* Custom Branding Card */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pink-500" />
            Client White-Label Branding
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Logo Image URL</label>
              <Input placeholder="https://domain.com/logo.png" value={brandingValues.logoUrl} onChange={(e) => setBrandingValues({ ...brandingValues, logoUrl: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Primary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" className="h-9 w-9 rounded-xl border border-slate-200 cursor-pointer" value={brandingValues.primaryColor} onChange={(e) => setBrandingValues({ ...brandingValues, primaryColor: e.target.value })} />
                <Input value={brandingValues.primaryColor} onChange={(e) => setBrandingValues({ ...brandingValues, primaryColor: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Default Theme</label>
              <Select value={brandingValues.theme} onChange={(e) => setBrandingValues({ ...brandingValues, theme: e.target.value })}>
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => brandingMutation.mutate()} disabled={brandingMutation.isPending}>
              {brandingMutation.isPending ? 'Saving...' : 'Save Branding Preferences'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

