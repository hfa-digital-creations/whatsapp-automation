import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { loadRazorpayScript } from '../../lib/razorpay';
import { Badge, Button, Card, ErrorText, Input, Label, Select, TabPanel, Tabs, Textarea } from '../../components/ui';

type PhoneChangeStage = 'VERIFY_OLD' | 'VERIFY_NEW';

function PhoneChangeCard({ currentPhone }: { currentPhone: string }) {
  const queryClient = useQueryClient();
  const [newPhone, setNewPhone] = useState('');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [stage, setStage] = useState<PhoneChangeStage | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function reset() {
    setRequestId(null);
    setStage(null);
    setCode('');
    setNewPhone('');
  }

  const requestMutation = useMutation({
    mutationFn: async () =>
      (await api.post('/client/profile/phone/request-otp', { newPhone })).data.data as { requestId: string; stage: PhoneChangeStage },
    onSuccess: (data) => {
      setError('');
      setRequestId(data.requestId);
      setStage(data.stage);
      setCode('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const confirmOldMutation = useMutation({
    mutationFn: async () =>
      (await api.post('/client/profile/phone/confirm-old-otp', { requestId, code })).data.data as { requestId: string; stage: PhoneChangeStage },
    onSuccess: (data) => {
      setError('');
      setStage(data.stage);
      setCode('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const confirmNewMutation = useMutation({
    mutationFn: () => api.post('/client/profile/phone/confirm-new-otp', { requestId, code }),
    onSuccess: () => {
      setSuccess('Phone number successfully updated and verified.');
      reset();
      queryClient.invalidateQueries({ queryKey: ['client-profile'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <Card className="p-6">
      <h2 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand-500" />
        Verified Account Phone Number
      </h2>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Active Phone: <span className="font-semibold font-mono text-slate-700 dark:text-slate-300">{currentPhone || 'Not configured'}</span>. Official receipts, billing alerts, and direct escalation calls are routed here.
      </p>

      {!stage ? (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="New WhatsApp Number (e.g. +919876543210)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="max-w-sm text-xs font-mono"
          />
          <Button
            variant="secondary"
            onClick={() => { setError(''); requestMutation.mutate(); }}
            disabled={requestMutation.isPending || newPhone.replace(/\D/g, '').length < 8}
            className="text-xs"
          >
            {requestMutation.isPending ? 'Sending OTP...' : 'Send Verification OTP'}
          </Button>
        </div>
      ) : stage === 'VERIFY_OLD' ? (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Step 1 of 2:</strong> A 6-digit OTP was sent to your current number (<span className="font-mono">{currentPhone}</span>) to verify authorization.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="max-w-[150px] text-center tracking-[0.3em] font-mono text-base font-bold"
            />
            <Button onClick={() => { setError(''); confirmOldMutation.mutate(); }} disabled={confirmOldMutation.isPending || code.length !== 6} className="text-xs">
              {confirmOldMutation.isPending ? 'Verifying...' : 'Verify Step 1'}
            </Button>
            <Button variant="ghost" onClick={() => { reset(); setError(''); }} className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs text-emerald-800 dark:text-emerald-200">
            <strong>Step 2 of 2:</strong> A 6-digit OTP was sent to your new number (<span className="font-mono">{newPhone}</span>). Enter it to complete verification.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="max-w-[150px] text-center tracking-[0.3em] font-mono text-base font-bold"
            />
            <Button onClick={() => { setError(''); confirmNewMutation.mutate(); }} disabled={confirmNewMutation.isPending || code.length !== 6} className="text-xs">
              {confirmNewMutation.isPending ? 'Finalizing...' : 'Confirm & Bind Phone'}
            </Button>
            <Button variant="ghost" onClick={() => { reset(); setError(''); }} className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {success && <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{success}</p>}
    </Card>
  );
}

export default function ClientSettings() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'subscription' | 'phone' | 'automation' | 'password'>('subscription');
  const [voucherCode, setVoucherCode] = useState('');
  const [renewError, setRenewError] = useState('');
  const [renewSuccess, setRenewSuccess] = useState('');
  const [payingNow, setPayingNow] = useState(false);

  const { data: profile } = useQuery<{
    businessName: string;
    subscriptionStatus: string;
    remainingDays: number | null;
    plan: { title: string } | null;
    user: { email: string; phone: string | null };
  }>({
    queryKey: ['client-profile'],
    queryFn: async () => (await api.get('/client/profile')).data.data,
  });

  const { data: settings } = useQuery<{
    businessName: string;
    automationMode: string;
    fallbackMessage: string;
    conversationFlow: string;
    paymentLink: string;
  }>({
    queryKey: ['client-settings'],
    queryFn: async () => (await api.get('/client/settings')).data.data,
  });

  const [businessName, setBusinessName] = useState('');
  const [automationMode, setAutomationMode] = useState('DRAFT_APPROVE');
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [conversationFlow, setConversationFlow] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  useEffect(() => {
    if (settings) {
      setBusinessName(settings.businessName ?? '');
      setAutomationMode(settings.automationMode ?? 'DRAFT_APPROVE');
      setFallbackMessage(settings.fallbackMessage ?? '');
      setConversationFlow(settings.conversationFlow ?? '');
      setPaymentLink(settings.paymentLink ?? '');
    }
  }, [settings]);

  const settingsMutation = useMutation({
    mutationFn: () =>
      api.put('/client/settings', {
        businessName,
        automationMode,
        fallbackMessage,
        conversationFlow,
        paymentLink,
      }),
    onSuccess: () => {
      setSettingsSaved(true);
      setSettingsError('');
      queryClient.invalidateQueries({ queryKey: ['client-settings'] });
      queryClient.invalidateQueries({ queryKey: ['client-profile'] });
      setTimeout(() => setSettingsSaved(false), 3000);
    },
    onError: (err) => setSettingsError(apiErrorMessage(err)),
  });

  function handleSettingsSubmit(e: FormEvent) {
    e.preventDefault();
    setSettingsError('');
    settingsMutation.mutate();
  }

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  const passwordMutation = useMutation({
    mutationFn: () => api.post('/client/profile/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      setPasswordSaved(true);
      setPasswordError('');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordSaved(false), 3000);
    },
    onError: (err) => setPasswordError(apiErrorMessage(err)),
  });

  function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError('');
    passwordMutation.mutate();
  }

  const checkoutMutation = useMutation({
    mutationFn: () => api.post('/client/payments/renew/checkout', { voucherCode: voucherCode.trim() || undefined }),
    onError: (err) => setRenewError(apiErrorMessage(err)),
  });

  const verifyMutation = useMutation({
    mutationFn: (payload: { paymentId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
      api.post(`/client/payments/${payload.paymentId}/verify`, payload),
    onSuccess: () => {
      setRenewSuccess('Renewal payment verified — subscription successfully extended!');
      setVoucherCode('');
      queryClient.invalidateQueries({ queryKey: ['client-profile'] });
      setTimeout(() => setRenewSuccess(''), 5000);
    },
    onError: (err) => setRenewError(apiErrorMessage(err)),
    onSettled: () => setPayingNow(false),
  });

  async function handleRenew() {
    setRenewError('');
    setRenewSuccess('');
    setPayingNow(true);
    try {
      const res = await checkoutMutation.mutateAsync();
      const { paymentId, orderId, amount, currency, keyId } = res.data.data;
      const ready = await loadRazorpayScript();
      if (!ready || !keyId) {
        setRenewError('Failed to initialize Razorpay checkout script.');
        setPayingNow(false);
        return;
      }
      const options = {
        key: keyId,
        amount,
        currency,
        name: 'WhatsApp Automation Platform',
        description: 'Client Workspace Subscription Renewal',
        order_id: orderId,
        handler: function (resp: any) {
          verifyMutation.mutate({
            paymentId,
            razorpayOrderId: resp.razorpay_order_id,
            razorpayPaymentId: resp.razorpay_payment_id,
            razorpaySignature: resp.razorpay_signature,
          });
        },
        prefill: {
          email: profile?.user?.email,
          contact: profile?.user?.phone || undefined,
        },
        theme: {
          color: '#F97316',
        },
        modal: {
          ondismiss: () => setPayingNow(false),
        },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch {
      setPayingNow(false);
    }
  }

  return (
    <div className="space-y-8 animate-glass-entrance">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Workspace Settings &amp; Preferences
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage your subscription plan, AI assistant personality, automation mode, and security credentials
        </p>
      </div>

      <Tabs
        tabs={[
          {
            id: 'subscription',
            label: 'Subscription & Licensing',
            icon: (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            ),
          },
          {
            id: 'automation',
            label: 'AI Automation Rules',
            icon: (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ),
          },
          {
            id: 'phone',
            label: 'Phone Security',
            icon: (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            ),
          },
          {
            id: 'password',
            label: 'Staff Password',
            icon: (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            ),
          },
        ]}
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab)}
      />

      <TabPanel id="subscription" activeTab={activeTab}>
        <Card className="p-6 border-brand-500/30 bg-gradient-to-br from-brand-500/5 via-transparent to-amber-500/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-500" />
                Subscription &amp; Licensing Plan
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {profile?.plan?.title ?? 'Custom Enterprise'}
                </span>
                <Badge tone={profile?.subscriptionStatus === 'ACTIVE' ? 'green' : 'amber'}>
                  {profile?.subscriptionStatus?.replace('_', ' ')}
                </Badge>
                <span className="text-slate-400">&bull;</span>
                <span className="text-slate-500 dark:text-slate-400 font-semibold">
                  {profile?.remainingDays !== null ? `${profile?.remainingDays} days remaining` : 'Lifetime'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Promo Voucher Code"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                className="max-w-[160px] text-xs font-mono"
              />
              <Button
                onClick={handleRenew}
                disabled={payingNow || checkoutMutation.isPending || verifyMutation.isPending}
                className="text-xs"
              >
                {payingNow || checkoutMutation.isPending ? 'Opening Gateway...' : verifyMutation.isPending ? 'Confirming...' : '⚡ Renew / Upgrade'}
              </Button>
            </div>
          </div>
          <ErrorText>{renewError}</ErrorText>
          {renewSuccess && <p className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{renewSuccess}</p>}
        </Card>
      </TabPanel>

      <TabPanel id="automation" activeTab={activeTab}>
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            AI Personality &amp; WhatsApp Automation Rules
          </h2>
          <form onSubmit={handleSettingsSubmit} className="space-y-4">
            <div>
              <Label>Business Brand Name</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={150} />
              <p className="mt-1 text-[11px] text-slate-400">
                The AI introduces itself and refers to your company by this brand name.
              </p>
            </div>
            <div>
              <Label>Autonomous Mode</Label>
              <Select value={automationMode} onChange={(e) => setAutomationMode(e.target.value)}>
                <option value="DRAFT_APPROVE">Draft &amp; Approve (Staff manually reviews AI drafted messages)</option>
                <option value="FULL_AUTONOMOUS">Full Autonomous (AI auto-sends responses instantly)</option>
              </Select>
            </div>
            <div>
              <Label>Unknown Question Fallback Message</Label>
              <Textarea rows={2} value={fallbackMessage} onChange={(e) => setFallbackMessage(e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-400">
                Sent when a user asks a question not covered by your training data.
              </p>
            </div>
            <div>
              <Label>Guided Conversation Flow Script (Optional)</Label>
              <Textarea
                rows={6}
                value={conversationFlow}
                onChange={(e) => setConversationFlow(e.target.value)}
                placeholder={'Step 1 - Greeting & Qualifying Needs: ...\nStep 2 - Collecting Name and Requirement: ...\nStep 3 - Offering Rate Card or Booking: ...'}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Prescribe an exact step-by-step lead qualification journey. If left blank, the assistant uses open semantic search on your knowledge base.
              </p>
            </div>
            <div>
              <Label>Default Payment / Checkout URL</Label>
              <Input type="url" placeholder="https://buy.stripe.com/... or https://rzp.io/..." value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)} />
            </div>
            <ErrorText>{settingsError}</ErrorText>
            <Button type="submit" disabled={settingsMutation.isPending} className="text-xs">
              {settingsMutation.isPending ? 'Saving Settings...' : settingsSaved ? 'Saved Successfully!' : 'Save Automation Rules'}
            </Button>
          </form>
        </Card>
      </TabPanel>

      <TabPanel id="phone" activeTab={activeTab}>
        <PhoneChangeCard currentPhone={profile?.user?.phone ?? ''} />
      </TabPanel>

      <TabPanel id="password" activeTab={activeTab}>
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            Update Staff Password
          </h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
            <div>
              <Label>Current Password</Label>
              <Input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div>
              <Label>New Password</Label>
              <Input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <ErrorText>{passwordError}</ErrorText>
            <Button type="submit" disabled={passwordMutation.isPending} className="text-xs">
              {passwordMutation.isPending ? 'Updating...' : passwordSaved ? 'Password Updated!' : 'Update Password'}
            </Button>
          </form>
        </Card>
      </TabPanel>
    </div>
  );
}
