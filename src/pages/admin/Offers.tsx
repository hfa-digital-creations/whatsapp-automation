import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Select, Spinner, Textarea } from '../../components/ui';

interface Campaign {
  id: string; name: string; status: string; createdAt: string; config: { message?: string } | null;
}

const STATUS_TONE: Record<string, 'gray' | 'green' | 'amber' | 'blue'> = {
  DRAFT: 'gray', SCHEDULED: 'blue', RUNNING: 'amber', COMPLETED: 'green', CANCELLED: 'gray',
};

export default function AdminOffers() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', message: '' });
  const [target, setTarget] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ['admin-offers'],
    queryFn: async () => (await api.get('/admin/offers')).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/offers', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      setForm({ name: '', message: '' });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/offers/${id}/send`, { target: target[id] ?? 'ACTIVE_CLIENTS' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      setResult(`Sent broadcast to ${res.data.data.sent} of ${res.data.data.targeted} client(s).`);
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    createMutation.mutate();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Client Promotional Campaigns
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Deliver broadcast promotional announcements and feature updates to registered tenant clients. Supports <code className="bg-slate-500/10 px-1 py-0.5 rounded text-brand-600 dark:text-brand-400 font-mono">{'{{businessName}}'}</code>.
        </p>
      </div>

      {/* Campaign Form */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-500" />
          Create New Campaign
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Campaign Title</label>
            <Input placeholder="e.g. Festival Season Upgrade Special" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Message Body</label>
            <Textarea placeholder="Hi {{businessName}}, we have an exclusive renewal discount for your workspace..." rows={3} required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Create Campaign'}
            </Button>
          </div>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>
      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {result}
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {campaigns?.map((c) => (
            <Card key={c.id} hoverEffect className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{c.name}</h3>
                  <Badge tone={STATUS_TONE[c.status] ?? 'gray'}>{c.status}</Badge>
                </div>
                <p className="mt-3 rounded-xl bg-white/40 p-3 text-xs text-slate-700 whitespace-pre-wrap border border-slate-200/50 dark:bg-white/[0.02] dark:border-white/5 dark:text-slate-300">
                  {c.config?.message}
                </p>
              </div>

              {c.status !== 'COMPLETED' && (
                <div className="mt-4 flex items-center gap-2.5 border-t border-slate-100 pt-3 dark:border-white/5">
                  <Select
                    value={target[c.id] ?? 'ACTIVE_CLIENTS'}
                    onChange={(e) => setTarget((t) => ({ ...t, [c.id]: e.target.value }))}
                    className="text-xs"
                  >
                    <option value="ACTIVE_CLIENTS">Active clients only</option>
                    <option value="ALL_CLIENTS">All clients</option>
                  </Select>
                  <Button
                    className="px-3 py-1.5 text-xs whitespace-nowrap"
                    onClick={() => sendMutation.mutate(c.id)}
                    disabled={sendMutation.isPending}
                  >
                    {sendMutation.isPending ? 'Sending...' : 'Broadcast Now'}
                  </Button>
                </div>
              )}
            </Card>
          ))}
          {campaigns?.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-slate-400">
              No promotional campaigns created yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

