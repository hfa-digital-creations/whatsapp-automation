import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { loadRazorpayScript } from '../../lib/razorpay';
import { Badge, Button, Card, ErrorText, Input, Spinner } from '../../components/ui';

interface Account {
  id: string; sessionId: string; phoneNumber: string | null; displayName: string | null; status: string;
}

const TONE: Record<string, 'gray' | 'green' | 'red' | 'amber' | 'blue'> = {
  CONNECTED: 'green', AUTHENTICATED: 'blue', QR_REQUIRED: 'amber', CONNECTING: 'amber',
  DISCONNECTED: 'gray', LOGGED_OUT: 'gray', ERROR: 'red', PENDING: 'gray',
};

const POLLING_STATUSES = ['PENDING', 'CONNECTING', 'QR_REQUIRED', 'AUTHENTICATED'];

function PairingCodePanel({ accountId }: { accountId: string }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () =>
      (await api.post(`/client/whatsapp/accounts/${accountId}/pairing-code`, { phoneNumber })).data.data as { code: string },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const code: string | undefined = mutation.data?.code;

  if (code) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-2">
        <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 px-6 py-3 shadow-inner">
          <p className="text-3xl font-extrabold tracking-[0.4em] font-mono text-brand-600 dark:text-brand-400">{code}</p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
          Open WhatsApp on <span className="font-semibold text-slate-700 dark:text-slate-200">{phoneNumber}</span> &rarr; Linked Devices &rarr; Link with phone number instead &rarr; enter code
        </p>
        <Button variant="secondary" className="mt-1 px-3 py-1.5 text-xs" onClick={() => { setError(''); mutation.reset(); }}>
          Use a different number
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 max-w-xs w-full py-2">
      <Input
        placeholder="Phone with country code (e.g. 919842744566)"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        className="w-full text-center font-mono"
      />
      <Button
        className="w-full text-xs"
        disabled={mutation.isPending || phoneNumber.replace(/\D/g, '').length < 8}
        onClick={() => { setError(''); mutation.mutate(); }}
      >
        {mutation.isPending ? 'Requesting Code...' : 'Get 8-Digit Pairing Code'}
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function QrPanel({ accountId }: { accountId: string }) {
  const [usePairingCode, setUsePairingCode] = useState(false);

  const { data } = useQuery<{ status: string; qr: string | null }>({
    queryKey: ['client-whatsapp-qr', accountId],
    queryFn: async () => (await api.get(`/client/whatsapp/accounts/${accountId}/qr`)).data.data,
    refetchInterval: (query) => (POLLING_STATUSES.includes(query.state.data?.status ?? '') ? 2000 : false),
  });

  if (!data) return null;
  if (data.status === 'CONNECTED') {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        WhatsApp session active and connected!
      </div>
    );
  }
  if (data.status === 'AUTHENTICATED') {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-500">
        <Spinner />
        <span>Scanned — completing authorization handshake...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {usePairingCode ? (
        <PairingCodePanel accountId={accountId} />
      ) : data.qr ? (
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-white rounded-2xl shadow-xl ring-1 ring-black/5">
            <img src={data.qr} alt="Scan with WhatsApp" className="h-52 w-52 rounded-xl" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Open WhatsApp on your device &rarr; Linked Devices &rarr; Link a Device
          </p>
        </div>
      ) : (
        <div className="py-6 flex flex-col items-center gap-2">
          <Spinner />
          <p className="text-xs text-slate-400">Preparing fresh WhatsApp pairing session...</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setUsePairingCode((v) => !v)}
        className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline transition-colors"
      >
        {usePairingCode ? 'Scan a QR code instead' : 'Link with 8-digit pairing code instead'}
      </button>
    </div>
  );
}

function BuyAdditionalAccountCard() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paying, setPaying] = useState(false);

  const { data: config } = useQuery<{ available: boolean }>({
    queryKey: ['client-payments-config'],
    queryFn: async () => (await api.get('/client/payments/config')).data.data,
  });

  const verifyMutation = useMutation({
    mutationFn: (payload: { paymentId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
      api.post(`/client/payments/${payload.paymentId}/verify`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-whatsapp-limit'] });
      setSuccess('Payment successful — your account limit has been upgraded!');
    },
    onError: (err) => setError(apiErrorMessage(err)),
    onSettled: () => setPaying(false),
  });

  const checkoutMutation = useMutation({
    mutationFn: () => api.post('/client/payments/additional-account/checkout'),
    onSuccess: async (res) => {
      const { paymentId, orderId, amount, currency, keyId } = res.data.data;
      const ready = await loadRazorpayScript();
      if (!ready || !keyId) {
        setError('Could not load the secure payment gateway. Please check your connection and try again.');
        setPaying(false);
        return;
      }

      let settled = false;
      const razorpay = new (window as any).Razorpay({
        key: keyId,
        order_id: orderId,
        amount: Math.round(amount * 100),
        currency,
        name: 'WA Automation',
        description: 'Additional WhatsApp account slot',
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
            if (!settled) setError('Payment was cancelled.');
            setPaying(false);
          },
        },
      });
      razorpay.on('payment.failed', () => {
        settled = true;
        setError('Payment failed. Please try again.');
        setPaying(false);
      });
      razorpay.open();
    },
    onError: (err) => {
      setError(apiErrorMessage(err));
      setPaying(false);
    },
  });

  if (config && !config.available) return null;

  return (
    <Card className="p-6 border-brand-500/30 bg-gradient-to-r from-brand-500/5 to-amber-500/5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            Expand WhatsApp Slots
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Purchase an extra WhatsApp account connection beyond your plan's standard quota.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => { setError(''); setSuccess(''); setPaying(true); checkoutMutation.mutate(); }}
          disabled={paying || checkoutMutation.isPending || verifyMutation.isPending}
          className="text-xs"
        >
          {paying || checkoutMutation.isPending ? 'Opening Gateway...' : verifyMutation.isPending ? 'Confirming...' : '+ Buy Additional Slot'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {success && <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{success}</p>}
    </Card>
  );
}

export default function ClientWhatsappAccounts() {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['client-whatsapp-accounts'],
    queryFn: async () => (await api.get('/client/whatsapp/accounts')).data.data,
    refetchInterval: 4000,
  });

  const { data: features } = useQuery<Record<string, boolean>>({
    queryKey: ['client-features'],
    queryFn: async () => (await api.get('/client/features')).data.data,
  });
  const canRemove = features?.WHATSAPP_ACCOUNT_REMOVAL ?? false;

  const createMutation = useMutation({
    mutationFn: () => api.post('/client/whatsapp/accounts', { displayName: displayName || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['client-whatsapp-accounts'] });
      setDisplayName('');
      setExpanded(res.data.data.id);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const reconnectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/client/whatsapp/accounts/${id}/reconnect`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-whatsapp-accounts'] }),
  });

  const logoutMutation = useMutation({
    mutationFn: (id: string) => api.post(`/client/whatsapp/accounts/${id}/logout`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-whatsapp-accounts'] }),
  });

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/client/whatsapp/accounts/${id}`),
    onSuccess: () => {
      setConfirmRemoveId(null);
      queryClient.invalidateQueries({ queryKey: ['client-whatsapp-accounts'] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          WhatsApp Lines &amp; Devices
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Connect customer-facing WhatsApp business numbers to enable continuous AI conversation handling
        </p>
      </div>

      {/* Account Creation Card */}
      <Card className="p-6">
        <h2 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Add WhatsApp Connection
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Account Label (e.g. Sales Desk, Support Phone)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={() => { setError(''); createMutation.mutate(); }} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Registering...' : 'Add Connection'}
          </Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </Card>

      <BuyAdditionalAccountCard />

      {/* Accounts List */}
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {accounts?.map((a) => (
            <Card key={a.id} hoverEffect className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-bold text-slate-900 dark:text-white">
                      {a.displayName || a.phoneNumber || 'WhatsApp Account'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      {a.phoneNumber ?? 'Not connected yet'}
                    </p>
                  </div>
                  <Badge tone={TONE[a.status] ?? 'gray'}>{a.status.replace('_', ' ')}</Badge>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    className="px-3 py-1 text-xs"
                    onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  >
                    {expanded === a.id ? 'Hide QR Code' : 'Scan QR / Code'}
                  </Button>
                  <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => reconnectMutation.mutate(a.id)}>
                    Reconnect
                  </Button>
                  <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => logoutMutation.mutate(a.id)}>
                    Logout
                  </Button>
                  {canRemove && (
                    confirmRemoveId === a.id ? (
                      <>
                        <Button
                          variant="danger"
                          className="px-3 py-1 text-xs"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(a.id)}
                        >
                          {removeMutation.isPending ? 'Removing...' : 'Confirm'}
                        </Button>
                        <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setConfirmRemoveId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" className="px-2.5 py-1 text-xs text-rose-500 hover:text-rose-600" onClick={() => setConfirmRemoveId(a.id)}>
                        Remove
                      </Button>
                    )
                  )}
                </div>
              </div>

              {expanded === a.id && (
                <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/5">
                  <QrPanel accountId={a.id} />
                </div>
              )}
            </Card>
          ))}
          {accounts?.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-slate-400">
              No WhatsApp accounts registered yet — add one above to begin.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

