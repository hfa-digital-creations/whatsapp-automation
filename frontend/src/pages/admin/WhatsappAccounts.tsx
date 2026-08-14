import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Badge, Card, Spinner } from '../../components/ui';

interface Account {
  id: string; sessionId: string; phoneNumber: string | null; displayName: string | null; status: string;
  lastConnectedAt: string | null; client: { businessName: string; user: { email: string } };
}

const TONE: Record<string, 'gray' | 'green' | 'red' | 'amber' | 'blue'> = {
  CONNECTED: 'green', AUTHENTICATED: 'blue', QR_REQUIRED: 'amber', CONNECTING: 'amber',
  DISCONNECTED: 'gray', LOGGED_OUT: 'gray', ERROR: 'red', PENDING: 'gray',
};

export default function AdminWhatsappAccounts() {
  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['admin-whatsapp-accounts'],
    queryFn: async () => (await api.get('/admin/whatsapp/accounts')).data.data,
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Client WhatsApp Accounts
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Live overview of all Baileys socket sessions connected across platform tenants
        </p>
      </div>

      <Card className="p-6">
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="py-3 pr-4">Client Business</th>
                  <th className="py-3 pr-4">WhatsApp Phone / Session</th>
                  <th className="py-3 pr-4">Connection State</th>
                  <th className="py-3 text-right">Last Connected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {accounts?.map((a) => (
                  <tr key={a.id}>
                    <td className="py-3.5 pr-4">
                      <p className="font-bold text-slate-800 dark:text-slate-100">{a.client.businessName}</p>
                      <p className="text-xs text-slate-400">{a.client.user.email}</p>
                    </td>
                    <td className="py-3.5 pr-4">
                      <p className="font-semibold text-slate-700 dark:text-slate-200 font-mono">
                        {a.phoneNumber ?? a.displayName ?? 'No phone attached'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">ID: {a.sessionId.slice(0, 14)}...</p>
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge tone={TONE[a.status] ?? 'gray'}>{a.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="py-3.5 text-right text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {a.lastConnectedAt ? new Date(a.lastConnectedAt).toLocaleString() : 'Never connected'}
                    </td>
                  </tr>
                ))}
                {accounts?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-sm text-slate-400">
                      No WhatsApp accounts registered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

