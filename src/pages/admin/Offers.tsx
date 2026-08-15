import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Select, Spinner, Tabs, Textarea } from '../../components/ui';

type OfferMediaType = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

interface Campaign {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  config: { message?: string; mediaUrl?: string; mediaType?: OfferMediaType; mediaFileName?: string } | null;
}

interface CampaignMessage {
  id: string; status: string; clientId: string | null;
}

interface ClientOption {
  id: string;
  businessName: string;
  user: { email: string };
}

const STATUS_TONE: Record<string, 'gray' | 'green' | 'amber' | 'blue'> = {
  DRAFT: 'gray', SCHEDULED: 'blue', RUNNING: 'amber', COMPLETED: 'green', CANCELLED: 'gray',
};

const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/3gpp,application/pdf';

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

function ClientPicker({
  clients,
  selected,
  onToggle,
}: {
  clients: ClientOption[];
  selected: string[];
  onToggle: (clientId: string) => void;
}) {
  return (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200/60 bg-white/40 p-2 dark:border-white/10 dark:bg-white/[0.02]">
      {clients.length === 0 && <p className="p-1 text-xs text-slate-400">No clients found.</p>}
      {clients.map((client) => (
        <label key={client.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-slate-500/5">
          <input type="checkbox" checked={selected.includes(client.id)} onChange={() => onToggle(client.id)} className="accent-brand-500" />
          <span className="text-slate-700 dark:text-slate-200">{client.businessName}</span>
          <span className="truncate text-slate-400">{client.user.email}</span>
        </label>
      ))}
    </div>
  );
}

interface TrashedCampaign extends Campaign {
  deletedAt: string;
}

/** Trashed campaigns stay recoverable until permanently deleted — mirrors the client-side conversation trash pattern. */
function TrashPanel({ onError }: { onError: (msg: string) => void }) {
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: trashed, isLoading } = useQuery<TrashedCampaign[]>({
    queryKey: ['admin-offers-trash'],
    queryFn: async () => (await api.get('/admin/offers/trash')).data.data,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['admin-offers-trash'] });
    queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
  }

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/offers/${id}/restore`),
    onSuccess: () => {
      onError('');
      invalidateAll();
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/offers/${id}/permanent`),
    onSuccess: () => {
      onError('');
      setConfirmDeleteId(null);
      invalidateAll();
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 animate-tab-content">
      {trashed?.map((c) => (
        <Card key={c.id} className="p-6 flex flex-col justify-between opacity-80">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{c.name}</h3>
              <Badge tone="gray">Trashed</Badge>
            </div>
            <p className="mt-3 rounded-xl bg-white/40 p-3 text-xs text-slate-700 whitespace-pre-wrap border border-slate-200/50 dark:bg-white/[0.02] dark:border-white/5 dark:text-slate-300">
              {c.config?.message}
            </p>
            <p className="mt-2 text-[11px] text-slate-400">Deleted {new Date(c.deletedAt).toLocaleString()}</p>
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={restoreMutation.isPending}
              onClick={() => restoreMutation.mutate(c.id)}
            >
              Restore
            </Button>
            {confirmDeleteId === c.id ? (
              <>
                <Button
                  variant="danger"
                  className="px-3 py-1.5 text-xs"
                  disabled={permanentDeleteMutation.isPending}
                  onClick={() => permanentDeleteMutation.mutate(c.id)}
                >
                  {permanentDeleteMutation.isPending ? 'Deleting...' : 'Confirm Permanent Delete'}
                </Button>
                <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => setConfirmDeleteId(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                className="px-2.5 py-1.5 text-xs text-rose-500 hover:text-rose-600"
                onClick={() => setConfirmDeleteId(c.id)}
              >
                Delete Forever
              </Button>
            )}
          </div>
        </Card>
      ))}
      {trashed?.length === 0 && (
        <div className="col-span-full py-12 text-center text-sm text-slate-400">Trash is empty.</div>
      )}
    </div>
  );
}

function CampaignMedia({ config }: { config: Campaign['config'] }) {
  if (!config?.mediaUrl) return null;
  if (config.mediaType === 'IMAGE') {
    return <img src={config.mediaUrl} alt={config.mediaFileName ?? 'Attached image'} className="mt-2 h-28 w-full rounded-lg object-cover" />;
  }
  if (config.mediaType === 'VIDEO') {
    return <video src={config.mediaUrl} controls className="mt-2 h-28 w-full rounded-lg bg-black" />;
  }
  return (
    <a
      href={config.mediaUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white/40 px-3 py-2 text-xs font-semibold text-brand-600 hover:underline dark:border-white/10 dark:bg-white/[0.02] dark:text-brand-400"
    >
      📄 {config.mediaFileName ?? 'Attached document'}
    </a>
  );
}

export default function AdminOffers() {
  const queryClient = useQueryClient();
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: '', message: '', mediaUrl: '', mediaType: '' as OfferMediaType | '', mediaFileName: '' });
  const [aiPrompt, setAiPrompt] = useState('');
  const [createTarget, setCreateTarget] = useState('ACTIVE_CLIENTS');
  const [createSelectedClients, setCreateSelectedClients] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<'draft' | 'send'>('draft');
  const [target, setTarget] = useState<Record<string, string>>({});
  const [selectedClients, setSelectedClients] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'TRASH'>('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ['admin-offers'],
    queryFn: async () => (await api.get('/admin/offers')).data.data,
    refetchInterval: (query) => (query.state.data?.some((c) => c.status === 'RUNNING') ? 5000 : false),
  });

  const { data: clientOptions } = useQuery<ClientOption[]>({
    queryKey: ['admin-offer-client-options'],
    queryFn: async () => (await api.get('/admin/clients', { params: { take: 500 } })).data.data.items,
  });

  const { data: trashedCampaigns } = useQuery<TrashedCampaign[]>({
    queryKey: ['admin-offers-trash'],
    queryFn: async () => (await api.get('/admin/offers/trash')).data.data,
  });

  function resetCreateForm() {
    setForm({ name: '', message: '', mediaUrl: '', mediaType: '', mediaFileName: '' });
    setAiPrompt('');
    setCreateTarget('ACTIVE_CLIENTS');
    setCreateSelectedClients([]);
    setShowCreate(false);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/offers', {
        name: form.name,
        message: form.message,
        mediaUrl: form.mediaUrl || undefined,
        mediaType: form.mediaType || undefined,
        mediaFileName: form.mediaFileName || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      resetCreateForm();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  /** Creates the campaign and immediately queues it to the chosen clients in one step. */
  const createAndSendMutation = useMutation({
    mutationFn: async () => {
      const createRes = await api.post('/admin/offers', {
        name: form.name,
        message: form.message,
        mediaUrl: form.mediaUrl || undefined,
        mediaType: form.mediaType || undefined,
        mediaFileName: form.mediaFileName || undefined,
      });
      const newId = createRes.data.data.id;
      await api.post(`/admin/offers/${newId}/send`, {
        target: createTarget,
        clientIds: createTarget === 'SPECIFIC_CLIENTS' ? createSelectedClients : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      resetCreateForm();
      setResult('Broadcast created and queued — sending in small batches with safety pauses in the background. Progress shows on the campaign card below.');
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const uploadMediaMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.post('/admin/offers/media', body);
    },
    onSuccess: (res) => {
      const { mediaUrl, mediaType, mediaFileName } = res.data.data;
      setForm((f) => ({ ...f, mediaUrl, mediaType, mediaFileName }));
      setError('');
    },
    onError: (err) => {
      setError(apiErrorMessage(err));
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    },
  });

  const generateTextMutation = useMutation({
    mutationFn: () => api.post('/admin/offers/generate-message', { prompt: aiPrompt }),
    onSuccess: (res) => {
      setForm((f) => ({ ...f, message: res.data.data.message }));
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => {
      const chosenTarget = target[id] ?? 'ACTIVE_CLIENTS';
      return api.post(`/admin/offers/${id}/send`, {
        target: chosenTarget,
        clientIds: chosenTarget === 'SPECIFIC_CLIENTS' ? selectedClients[id] ?? [] : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      setResult('Broadcast queued — sending in small batches with safety pauses in the background. Progress shows on the campaign card below.');
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/offers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-offers-trash'] });
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function toggleSelectedClient(campaignId: string, clientId: string) {
    setSelectedClients((s) => {
      const current = s[campaignId] ?? [];
      const next = current.includes(clientId) ? current.filter((id) => id !== clientId) : [...current, clientId];
      return { ...s, [campaignId]: next };
    });
  }

  function toggleCreateSelectedClient(clientId: string) {
    setCreateSelectedClients((s) => (s.includes(clientId) ? s.filter((id) => id !== clientId) : [...s, clientId]));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (pendingAction === 'send') {
      createAndSendMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  function handleMediaChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMediaMutation.mutate(file);
  }

  function removeMedia() {
    setForm((f) => ({ ...f, mediaUrl: '', mediaType: '', mediaFileName: '' }));
    if (mediaInputRef.current) mediaInputRef.current.value = '';
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
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Generate with AI (optional)</label>
              <div className="flex items-center gap-2.5">
                <Input
                  placeholder="e.g. Diwali sale, 50% off annual plans, code DIWALI50"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="text-xs"
                />
                <Button
                  type="button"
                  className="px-3 py-1.5 text-xs whitespace-nowrap"
                  disabled={!aiPrompt.trim() || generateTextMutation.isPending}
                  onClick={() => generateTextMutation.mutate()}
                >
                  {generateTextMutation.isPending ? 'Writing...' : '✨ Generate'}
                </Button>
              </div>
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

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Attach Image / Video / PDF (optional)</label>
              {form.mediaUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200/60 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                  {form.mediaType === 'IMAGE' && <img src={form.mediaUrl} alt="" className="h-14 w-14 rounded-md object-cover" />}
                  {form.mediaType === 'VIDEO' && <video src={form.mediaUrl} className="h-14 w-14 rounded-md bg-black object-cover" />}
                  {form.mediaType === 'DOCUMENT' && <span className="text-2xl">📄</span>}
                  <span className="flex-1 truncate text-xs text-slate-600 dark:text-slate-300">{form.mediaFileName}</span>
                  <Button type="button" onClick={removeMedia} className="px-2 py-1 text-xs">
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={uploadMediaMutation.isPending}
                  className="px-3 py-1.5 text-xs"
                >
                  {uploadMediaMutation.isPending ? 'Uploading...' : '+ Attach File'}
                </Button>
              )}
              <input ref={mediaInputRef} type="file" accept={MEDIA_ACCEPT} onChange={handleMediaChange} className="hidden" />
              <p className="mt-1 text-[11px] text-slate-400">Images up to 5MB, video up to 16MB, PDF up to 16MB.</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Send To (used only if you send immediately)</label>
              <Select value={createTarget} onChange={(e) => setCreateTarget(e.target.value)} className="text-xs">
                <option value="ACTIVE_CLIENTS">Active clients only</option>
                <option value="ALL_CLIENTS">All clients</option>
                <option value="SPECIFIC_CLIENTS">Specific client(s)...</option>
              </Select>
              {createTarget === 'SPECIFIC_CLIENTS' && (
                <div className="mt-2">
                  <ClientPicker clients={clientOptions ?? []} selected={createSelectedClients} onToggle={toggleCreateSelectedClient} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                variant="secondary"
                onClick={() => setPendingAction('draft')}
                disabled={createMutation.isPending || createAndSendMutation.isPending}
                className="text-xs"
              >
                {createMutation.isPending ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button
                type="submit"
                onClick={() => setPendingAction('send')}
                disabled={
                  createMutation.isPending ||
                  createAndSendMutation.isPending ||
                  (createTarget === 'SPECIFIC_CLIENTS' && createSelectedClients.length === 0)
                }
                className="text-xs"
              >
                {createAndSendMutation.isPending ? 'Sending...' : 'Create & Send Now'}
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
            { id: 'TRASH', label: 'Trash', count: trashedCampaigns?.length ?? 0 },
          ]}
          activeTab={activeFilter}
          onChange={(f) => setActiveFilter(f as any)}
        />
      </div>

      {activeFilter === 'TRASH' ? (
        <TrashPanel onError={setError} />
      ) : isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 animate-tab-content">
          {filteredCampaigns?.map((c) => (
            <Card key={c.id} hoverEffect className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{c.name}</h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={STATUS_TONE[c.status] ?? 'gray'}>{c.status}</Badge>
                    {c.status !== 'RUNNING' && (
                      <Button
                        variant="danger"
                        className="px-2.5 py-1 text-[11px]"
                        onClick={() => deleteMutation.mutate(c.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-3 rounded-xl bg-white/40 p-3 text-xs text-slate-700 whitespace-pre-wrap border border-slate-200/50 dark:bg-white/[0.02] dark:border-white/5 dark:text-slate-300">
                  {c.config?.message}
                </p>
                <CampaignMedia config={c.config} />
              </div>

              {c.status === 'RUNNING' && (
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5">
                  <CampaignProgress campaignId={c.id} />
                </div>
              )}

              {c.status === 'DRAFT' && (
                <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3 dark:border-white/5">
                  <div className="flex items-center gap-2.5">
                    <Select
                      value={target[c.id] ?? 'ACTIVE_CLIENTS'}
                      onChange={(e) => setTarget((t) => ({ ...t, [c.id]: e.target.value }))}
                      className="text-xs"
                    >
                      <option value="ACTIVE_CLIENTS">Active clients only</option>
                      <option value="ALL_CLIENTS">All clients</option>
                      <option value="SPECIFIC_CLIENTS">Specific client(s)...</option>
                    </Select>
                    <Button
                      className="px-3 py-1.5 text-xs whitespace-nowrap"
                      onClick={() => sendMutation.mutate(c.id)}
                      disabled={
                        sendMutation.isPending ||
                        (target[c.id] === 'SPECIFIC_CLIENTS' && !(selectedClients[c.id]?.length))
                      }
                    >
                      {sendMutation.isPending ? 'Queuing...' : 'Broadcast Now'}
                    </Button>
                  </div>
                  {target[c.id] === 'SPECIFIC_CLIENTS' && (
                    <ClientPicker
                      clients={clientOptions ?? []}
                      selected={selectedClients[c.id] ?? []}
                      onToggle={(clientId) => toggleSelectedClient(c.id, clientId)}
                    />
                  )}
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
