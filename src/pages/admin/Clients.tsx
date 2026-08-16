import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Select, Spinner } from '../../components/ui';

interface Plan {
  id: string;
  title: string;
}

interface ClientRow {
  id: string;
  businessName: string;
  user: { email: string; phone: string | null; status: string };
  plan: { title: string } | null;
  subscriptionStatus: string;
  remainingDays: number | null;
  _count: { whatsappAccounts: number };
}

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'amber' | 'blue'> = {
  PENDING: 'gray',
  ACTIVE: 'green',
  BLOCKED: 'red',
  EXPIRED: 'amber',
  DELETED: 'gray',
};

export default function AdminClients() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<{ items: ClientRow[]; total: number }>({
    queryKey: ['admin-clients', search, status],
    queryFn: async () =>
      (await api.get('/admin/clients', { params: { search: search || undefined, status: status || undefined } })).data.data,
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['admin-plans-active'],
    queryFn: async () => (await api.get('/admin/plans', { params: { status: 'ACTIVE' } })).data.data,
  });

  const exportMutation = useMutation({
    mutationFn: async (format: 'vcf' | 'csv') => {
      const res = await api.get('/admin/clients/export', {
        params: { format, search: search || undefined, status: status || undefined },
        responseType: 'blob',
      });
      return { blob: res.data as Blob, format };
    },
    onSuccess: ({ blob, format }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clients-export.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });

  const [form, setForm] = useState({ businessName: '', email: '', phone: '', planId: '' });
  const [createError, setCreateError] = useState('');
  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/clients', { ...form, planId: form.planId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
      setShowCreate(false);
      setForm({ businessName: '', email: '', phone: '', planId: '' });
    },
    onError: (err) => setCreateError(apiErrorMessage(err)),
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError('');
    createMutation.mutate();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Client Directory
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage client businesses, active subscription plans, and connected sessions
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            className="text-xs"
            onClick={() => exportMutation.mutate('vcf')}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? 'Exporting...' : 'Export .vcf'}
          </Button>
          <Button
            variant="secondary"
            className="text-xs"
            onClick={() => exportMutation.mutate('csv')}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? 'Exporting...' : 'Export .csv'}
          </Button>
          <Button
            onClick={() => setShowCreate((s) => !s)}
            className="flex items-center gap-2"
          >
            {showCreate ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Cancel</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>New Client</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Creation Glass Form */}
      {showCreate && (
        <Card className="p-6 border-brand-500/30">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            Create New Client Account
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Business Name</label>
              <Input placeholder="e.g. Acme Corp" required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Admin Email</label>
              <Input type="email" placeholder="admin@acme.com" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">WhatsApp Phone</label>
              <Input placeholder="+919876543210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Assign Plan</label>
              <Select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
                <option value="">Select plan (optional)</option>
                {plans?.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-full flex items-center gap-3 pt-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating Account...' : 'Confirm & Create Client'}
              </Button>
              <ErrorText>{createError}</ErrorText>
            </div>
          </form>
        </Card>
      )}

      {/* Main Glass Table Card */}
      <Card className="p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <Input
                placeholder="Search business, email, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="BLOCKED">Blocked</option>
              <option value="EXPIRED">Expired</option>
            </Select>
          </div>
          {data && (
            <span className="text-xs font-semibold text-slate-400">
              Showing {data.items.length} of {data.total} clients
            </span>
          )}
        </div>

        {isLoading ? (
          <Spinner />
        ) : (
          <div className="glass-table-container animate-tab-content">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="py-3 pr-4">Business</th>
                  <th className="py-3 pr-4">Contact</th>
                  <th className="py-3 pr-4">Plan</th>
                  <th className="py-3 pr-4">Account Status</th>
                  <th className="py-3 pr-4">Subscription</th>
                  <th className="py-3 pr-4">Days Left</th>
                  <th className="py-3 pr-4">WhatsApp</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data?.items.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3.5 pr-4">
                      <p className="font-bold text-slate-800 dark:text-slate-100">{c.businessName}</p>
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-slate-500 dark:text-slate-400">
                      <p className="font-medium text-slate-700 dark:text-slate-300">{c.user.email}</p>
                      {c.user.phone && <p className="font-mono">{c.user.phone}</p>}
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {c.plan?.title ?? '—'}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge tone={STATUS_TONE[c.user.status]}>{c.user.status}</Badge>
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge tone={c.subscriptionStatus === 'ACTIVE' ? 'green' : c.subscriptionStatus === 'EXPIRED' ? 'red' : 'gray'}>
                        {c.subscriptionStatus}
                      </Badge>
                    </td>
                    <td className="py-3.5 pr-4 font-semibold text-slate-700 dark:text-slate-300">
                      {c.remainingDays !== null ? `${c.remainingDays}d` : '—'}
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {c._count.whatsappAccounts}
                      </span>
                    </td>
                    <td className="py-3.5 text-right">
                      <Link
                        to={`/admin/clients/${c.id}`}
                        className="inline-flex items-center gap-1 rounded-xl border border-brand-500/20 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-500/20 dark:text-brand-400"
                      >
                        <span>Manage</span>
                        <span>&rarr;</span>
                      </Link>
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                      No clients found matching your search.
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

