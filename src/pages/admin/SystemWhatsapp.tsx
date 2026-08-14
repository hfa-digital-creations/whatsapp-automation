import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Spinner } from '../../components/ui';

interface QrResponse {
  qr: string | null;
  running: boolean;
  status: string | null;
}

const TONE: Record<string, 'gray' | 'green' | 'red' | 'amber' | 'blue'> = {
  CONNECTED: 'green', AUTHENTICATED: 'blue', QR_REQUIRED: 'amber', CONNECTING: 'amber',
  DISCONNECTED: 'gray', LOGGED_OUT: 'gray', ERROR: 'red',
};

const POLLING_STATUSES = ['CONNECTING', 'QR_REQUIRED', 'AUTHENTICATED'];

function PairingCodePanel() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () =>
      (await api.post('/admin/system/whatsapp/pairing-code', { phoneNumber })).data.data as { code: string },
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
        placeholder="Phone with country code (e.g. 919876543210)"
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

export default function AdminSystemWhatsapp() {
  const queryClient = useQueryClient();
  const [usePairingCode, setUsePairingCode] = useState(false);

  const { data, isLoading } = useQuery<QrResponse>({
    queryKey: ['admin-system-whatsapp-qr'],
    queryFn: async () => (await api.get('/admin/system/whatsapp/qr')).data.data,
    refetchInterval: (query) => (POLLING_STATUSES.includes(query.state.data?.status ?? '') ? 2000 : 4000),
  });

  const initMutation = useMutation({
    mutationFn: () => api.post('/admin/system/whatsapp/init'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-system-whatsapp-qr'] }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/admin/system/whatsapp/logout'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-system-whatsapp-qr'] }),
  });

  const status = data?.status;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          System Broadcast WhatsApp
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This system-level WhatsApp session delivers account activations, invoice receipts, and renewal reminders to all clients
        </p>
      </div>

      <Card className="p-8 max-w-xl mx-auto">
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Live Status:</span>
              <Badge tone={status ? TONE[status] ?? 'gray' : 'gray'}>
                {status ? status.replace('_', ' ') : data?.running ? 'STARTING' : 'NOT STARTED'}
              </Badge>
            </div>

            {!data?.running && (
              <div className="py-4">
                <Button onClick={() => initMutation.mutate()} disabled={initMutation.isPending} className="py-2.5 px-6">
                  {initMutation.isPending ? 'Starting Engine...' : 'Initialize System Session'}
                </Button>
              </div>
            )}

            {status === 'CONNECTED' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Connected &amp; Ready for Automated Dispatch
                </p>
                <p className="text-xs text-slate-400">
                  System triggers will now automatically send WhatsApp notifications using this session.
                </p>
                <Button variant="danger" className="mt-2 px-4 py-1.5 text-xs" onClick={() => logoutMutation.mutate()}>
                  Disconnect Session
                </Button>
              </div>
            )}

            {status === 'AUTHENTICATED' && (
              <div className="py-4 flex flex-col items-center gap-2">
                <Spinner />
                <p className="text-xs text-slate-400">Handshake verified — synchronizing state...</p>
              </div>
            )}

            {data?.running && status !== 'CONNECTED' && status !== 'AUTHENTICATED' && (
              <div className="w-full flex flex-col items-center gap-4">
                {usePairingCode ? (
                  <PairingCodePanel />
                ) : data?.qr ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-white rounded-2xl shadow-xl ring-1 ring-black/5">
                      <img
                        src={data.qr}
                        alt="Scan with WhatsApp"
                        className="h-60 w-60 rounded-xl"
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Open WhatsApp &rarr; Linked Devices &rarr; Link a Device
                    </p>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Auto-refreshes seamlessly in real-time
                    </p>
                  </div>
                ) : (
                  <div className="py-8 flex flex-col items-center gap-2">
                    <Spinner />
                    <p className="text-xs text-slate-400">Generating Baileys session QR...</p>
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
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

