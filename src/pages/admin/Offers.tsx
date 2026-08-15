import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Select, Spinner, Tabs, Textarea } from '../../components/ui';

interface Campaign {
  id: string; name: string; status: string; createdAt: string; config: { message?: string } | null;
}

interface CampaignMessage {
  id: string; status: string; clientId: string | null;
}

const STATUS_TONE: Record<string, 'gray' | 'green' | 'amber' | 'blue'> = {
  DRAFT: 'gray', SCHEDULED: 'blue', RUNNING: 'amber', COMPLETED: 'green', CANCELLED: 'gray',
};

/**
 * Sending now runs as a background job (batches of 5 with multi-minute pauses to stay
 * safe from WhatsApp's automated-behavior detection), so a RUNNING campaign can take
 * several minutes to finish — this polls the recorded messages so the admin sees live
 * progress instead of a single delayed result.
 */
function CampaignProgress({ campaignId }: { campaignId: string }) {
  const { data: messages } = useQuery<CampaignMessage[]>({
    queryKey: ['admin-offer-messages', campaignId],
    queryFn: async () => (await api.get(`/admin/offers/${campaignId}/messages`)).data.data,
    refetchInterval: 5000,
  });
  const sent = messages?.filter((m) => m.status === 'SENT').length ?? 0;
  const failed = messages?.filter((m) => m.status === 'FAILED').length ?? 0;
  return (
    <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
      Sending in background — {sent} sent{failed > 0 ? `, ${failed} failed` : ''} so far...
    </p>
  );
}

export default function AdminOffers() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', message: '' });
  const [target, setTarget] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ['admin-offers'],
    queryFn: async () => (await api.get('/admin/offers')).data.data,
    refetchInterval: (query) => (query.state.data?.some((c) => c.status === 'RUNNING') ? 5000 : false),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/offers', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      setForm({ name: '', message: '' });
      setShowCreate(false);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/offers/${id}/send`, { target: target[id] ?? 'ACTIVE_CLIENTS' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      setResult('Broadcast queued — sending in small batches with safety pauses in the background. Progress shows on the campaign card below.');
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    createMutation.mutate();
  }

  const filteredCampaigns = campaigns?.filter((c) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'COMPLETED') return c.status === 'COMPLETED';
    return c.status !== 'COMPLETED';
  });

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Client Promotional Campaigns
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Deliver broadcast promotional announcements and feature updates to registered tenant clients. Supports <code className="bg-slate-500/10 px-1 py-0.5 rounded text-brand-600 dark:text-brand-400 font-mono">{'{{businessName}}'}</code>.
          </p>
        </div>
        <Button onClick={() => setShowCreate((s) => !s)} className="text-xs">
          {showCreate ? 'Close Campaign Form' : '+ New Campaign'}
        </Button>
      </div>

      {/* Campaign Form */}
      {showCreate && (
        <Card className="p-6 animate-tab-content">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            Create Promotional Broadcast
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Campaign Title</label>
              <Input
                placeholder="e.g. Diwali 50% Off Subscription Upgrade"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Broadcast Message</label>
              <Textarea
                placeholder="Hi {{businessName}}, celebrate Diwali with 50% off all annual plans! Use promo code DIWALI50 on checkout."
                rows={4}
                required
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={createMutation.isPending} className="text-xs">
                {createMutation.isPending ? 'Saving...' : 'Create Campaign'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-tab-content">
          {result}
        </div>
      )}

      {/* Smooth Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          tabs={[
            { id: 'ALL', label: 'All Campaigns', count: campaigns?.length ?? 0 },
            { id: 'ACTIVE', label: 'Ready / Drafts', count: campaigns?.filter((c) => c.status !== 'COMPLETED').length ?? 0 },
            { id: 'COMPLETED', label: 'Completed Broadcasts', count: campaigns?.filter((c) => c.status === 'COMPLETED').length ?? 0 },
          ]}
          activeTab={activeFilter}
          onChange={(f) => setActiveFilter(f as any)}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 animate-tab-content">
          {filteredCampaigns?.map((c) => (
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

              {c.status === 'RUNNING' && (
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5">
                  <CampaignProgress campaignId={c.id} />
                </div>
              )}

              {c.status === 'DRAFT' && (
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
                    {sendMutation.isPending ? 'Queuing...' : 'Broadcast Now'}
                  </Button>
                </div>
              )}
            </Card>
          ))}
          {filteredCampaigns?.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-slate-400">
              No promotional campaigns found matching the selected filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
