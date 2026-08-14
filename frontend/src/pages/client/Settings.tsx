import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { loadRazorpayScript } from '../../lib/razorpay';
import { Badge, Button, Card, ErrorText, Input, Label, Select, Textarea } from '../../components/ui';

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
              {confirmOldMutation.isPending ? 'Verifying...' : 'Confirm Current Number'}
            </Button>
            <Button variant="ghost" onClick={() => { reset(); setError(''); }} className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs text-emerald-800 dark:text-emerald-200">
            <strong>Step 2 of 2:</strong> Current number verified! Enter the OTP sent to your new number (<span className="font-mono">{newPhone}</span>).
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
              {confirmNewMutation.isPending ? 'Confirming...' : 'Complete Phone Transfer'}
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

  const { data: profile } = useQuery({
    queryKey: ['client-profile'],
    queryFn: async () => (await api.get('/client/profile')).data.data,
  });

  const [businessName, setBusinessName] = useState('');
  const [automationMode, setAutomationMode] = useState('DRAFT_APPROVE');
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [conversationFlow, setConversationFlow] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setBusinessName(profile.businessName ?? '');
      setAutomationMode(profile.automationMode);
      setFallbackMessage(profile.fallbackMessage ?? '');
      setPaymentLink(profile.defaultPaymentLink ?? '');
      setConversationFlow(profile.conversationFlow ?? '');
    }
  }, [profile]);

  const settingsMutation = useMutation({
    mutationFn: () =>
      api.patch('/client/profile', {
        businessName,
        automationMode,
        fallbackMessage,
        defaultPaymentLink: paymentLink || undefined,
        conversationFlow: conversationFlow || undefined,
      }),
    onSuccess: () => {
      setSettingsSaved(true);
      queryClient.invalidateQueries({ queryKey: ['client-profile'] });
      setTimeout(() => setSettingsSaved(false), 2000);
    },
    onError: (err) => setSettingsError(apiErrorMessage(err)),
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  const passwordMutation = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      setPasswordSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordSaved(false), 2000);
    },
    onError: (err) => setPasswordError(apiErrorMessage(err)),
  });

  const [voucherCode, setVoucherCode] = useState('');
  const [renewError, setRenewError] = useState('');
  const [renewSuccess, setRenewSuccess] = useState('');
  const [payingNow, setPayingNow] = useState(false);

  const verifyMutation = useMutation({
    mutationFn: (payload: {
      paymentId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }) => api.post('/client/subscription/verify', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-profile'] });
      setVoucherCode('');
      setRenewSuccess('Payment successful — your subscription has been renewed. A receipt has been sent to your email and WhatsApp.');
    },
    onError: (err) => setRenewError(apiErrorMessage(err)),
    onSettled: () => setPayingNow(false),
  });

  const failMutation = useMutation({
    mutationFn: (paymentId: string) => api.post('/client/subscription/checkout-failed', { paymentId }),
  });

  const checkoutMutation = useMutation({
    mutationFn: () => api.post('/client/subscription/checkout', { voucherCode: voucherCode || undefined }),
    onSuccess: async (res) => {
      const { paymentId, orderId, amount, currency, keyId } = res.data.data;
      const ready = await loadRazorpayScript();
      if (!ready || !keyId) {
        setRenewError('Could not load the payment form. Please check your connection and try again.');
        setPayingNow(false);
        return;
      }

      let settled = false;
      const razorpay = new (window as any).Razorpay({
        key: keyId,
        order_id: orderId,
        amount: Math.round(amount * 100),
        currency,
        name: 'WA Automation',
        description: 'Subscription renewal',
        handler: (response: any) => {
          settled = true;
          verifyMutation.mutate({
            paymentId,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
        },
        modal: {
          ondismiss: () => {
            if (!settled) {
              failMutation.mutate(paymentId);
              setRenewError('Payment was cancelled.');
            }
            setPayingNow(false);
          },
        },
      });
      razorpay.on('payment.failed', () => {
        settled = true;
        failMutation.mutate(paymentId);
        setRenewError('Payment failed. Please try again.');
        setPayingNow(false);
      });
      razorpay.open();
    },
    onError: (err) => {
      setRenewError(apiErrorMessage(err));
      setPayingNow(false);
    },
  });

  function handleRenew() {
    setRenewError('');
    setRenewSuccess('');
    setPayingNow(true);
    checkoutMutation.mutate();
  }

  function handleSettingsSubmit(e: FormEvent) {
    e.preventDefault();
    setSettingsError('');
    settingsMutation.mutate();
  }

  function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError('');
    passwordMutation.mutate();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Workspace Settings &amp; Preferences
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage your subscription plan, AI assistant personality, automation mode, and security credentials
        </p>
      </div>

      {/* Subscription Glass Card */}
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

      {/* 2-Step Phone Verification */}
      <PhoneChangeCard currentPhone={profile?.user?.phone ?? ''} />

      {/* AI Automation Preferences Form */}
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

      {/* Change Password Card */}
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
    </div>
  );
}

