import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Pagination, Select, Spinner, Tabs, Textarea } from '../../components/ui';
import { usePagination } from '../../lib/usePagination';

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

interface PhoneRecipient {
  phone: string;
  name?: string;
}

interface OfferGroup {
  id: string;
  name: string;
  _count: { members: number };
}

interface OfferGroupMember {
  id: string;
  clientId: string | null;
  phone: string | null;
  name: string | null;
  client: { id: string; businessName: string; user: { email: string; phone: string | null } } | null;
}

interface OfferGroupDetail extends OfferGroup {
  members: OfferGroupMember[];
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

function PhoneNumberEntry({
  recipients,
  onAdd,
  onRemove,
}: {
  recipients: PhoneRecipient[];
  onAdd: (r: PhoneRecipient) => void;
  onRemove: (index: number) => void;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

  function handleAdd() {
    const trimmed = phone.trim();
    if (!trimmed) return;
    onAdd({ phone: trimmed, name: name.trim() || undefined });
    setPhone('');
    setName('');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Phone number (e.g. 919876543210)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="flex-1 min-w-[160px] text-xs"
        />
        <Input
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[120px] text-xs"
        />
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={!phone.trim()} className="px-3 py-1.5 text-xs whitespace-nowrap">
          + Add
        </Button>
      </div>
      {recipients.length > 0 && (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200/60 bg-white/40 p-2 dark:border-white/10 dark:bg-white/[0.02]">
          {recipients.map((r, i) => (
            <div key={`${r.phone}-${i}`} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs">
              <span className="text-slate-700 dark:text-slate-200">
                {r.name ? `${r.name} — ` : ''}
                <span className="font-mono text-slate-500 dark:text-slate-400">{r.phone}</span>
              </span>
              <button type="button" onClick={() => onRemove(i)} className="text-slate-400 hover:text-red-500" aria-label="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline AI-draft + send-now compose for a single contact — no campaign, no history, just an immediate one-off message. */
function FollowupComposer({ phone, name, onDone }: { phone: string; name?: string; onDone: () => void }) {
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const generateMutation = useMutation({
    mutationFn: () => api.post('/admin/offers/generate-message', { prompt: prompt || `A short, friendly follow-up message${name ? ` to ${name}` : ''}.` }),
    onSuccess: (res) => setMessage(res.data.data.message),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post('/admin/offers/followup', { phone, name, message }),
    onSuccess: () => setSent(true),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  if (sent) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <span>Follow-up sent to {name ? `${name} ` : ''}{phone}.</span>
        <button type="button" onClick={onDone} className="text-emerald-600 hover:underline dark:text-emerald-400">Close</button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200/60 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center gap-2">
        <Input placeholder="What's this follow-up about? (optional)" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="flex-1 text-xs" />
        <Button type="button" variant="secondary" className="px-2.5 py-1.5 text-xs whitespace-nowrap" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
          {generateMutation.isPending ? 'Writing...' : '✨ Draft'}
        </Button>
      </div>
      <Textarea rows={3} placeholder="Write the follow-up message..." value={message} onChange={(e) => setMessage(e.target.value)} className="text-xs" />
      <div className="flex items-center gap-2">
        <Button type="button" className="px-3 py-1.5 text-xs" disabled={!message.trim() || sendMutation.isPending} onClick={() => sendMutation.mutate()}>
          {sendMutation.isPending ? 'Sending...' : `Send to ${phone}`}
        </Button>
        <Button type="button" variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={onDone}>Cancel</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** Add-only variant of the client picker — checking a client adds them to the group immediately (via onAdd), already-added clients show checked and locked (remove via the members list instead). */
function GroupMembersPanel({ groupId, onError }: { groupId: string; onError: (msg: string) => void }) {
  const queryClient = useQueryClient();
  const vcfInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState('');
  const [followupFor, setFollowupFor] = useState<string | null>(null);

  const { data: group, isLoading } = useQuery<OfferGroupDetail>({
    queryKey: ['admin-offer-group', groupId],
    queryFn: async () => (await api.get(`/admin/offer-groups/${groupId}`)).data.data,
  });

  const { data: clientOptions } = useQuery<ClientOption[]>({
    queryKey: ['admin-offer-client-options'],
    queryFn: async () => (await api.get('/admin/clients', { params: { take: 500 } })).data.data.items,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-offer-group', groupId] });
    queryClient.invalidateQueries({ queryKey: ['admin-offer-groups'] });
  }

  const addClientMutation = useMutation({
    mutationFn: (clientId: string) => api.post(`/admin/offer-groups/${groupId}/members`, { clientId }),
    onSuccess: () => {
      onError('');
      invalidate();
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const addPhoneMutation = useMutation({
    mutationFn: (r: PhoneRecipient) => api.post(`/admin/offer-groups/${groupId}/members`, { phone: r.phone, name: r.name }),
    onSuccess: () => {
      onError('');
      invalidate();
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/admin/offer-groups/${groupId}/members/${memberId}`),
    onSuccess: () => {
      onError('');
      invalidate();
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const importVcfMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.post(`/admin/offer-groups/${groupId}/members/import-vcf`, body);
    },
    onSuccess: (res) => {
      const { imported, skipped, missingCountryCode } = res.data.data;
      setImportResult(
        `Imported ${imported} contact(s)` +
          (skipped > 0 ? `, skipped ${skipped} already in the group` : '') +
          (missingCountryCode > 0
            ? `. Skipped ${missingCountryCode} without a country code — save them as e.g. +91XXXXXXXXXX in your contacts and re-import.`
            : '.'),
      );
      onError('');
      invalidate();
      if (vcfInputRef.current) vcfInputRef.current.value = '';
    },
    onError: (err) => {
      onError(apiErrorMessage(err));
      if (vcfInputRef.current) vcfInputRef.current.value = '';
    },
  });

  function handleVcfChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setImportResult('');
      importVcfMutation.mutate(file);
    }
  }

  if (isLoading) return <Spinner />;
  const memberClientIds = new Set((group?.members ?? []).filter((m) => m.clientId).map((m) => m.clientId));

  return (
    <div className="space-y-3">
      {/* Import is the first thing here — no need to dig for it. */}
      <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-2.5">
        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">📇 Import Contacts (.vcf)</label>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            onClick={() => vcfInputRef.current?.click()}
            disabled={importVcfMutation.isPending}
            className="px-3 py-1.5 text-xs whitespace-nowrap"
          >
            {importVcfMutation.isPending ? 'Importing...' : 'Upload .vcf File'}
          </Button>
          {importResult && <p className="text-[11px] text-slate-500 dark:text-slate-400">{importResult}</p>}
        </div>
        <input ref={vcfInputRef} type="file" accept=".vcf,text/vcard" onChange={handleVcfChange} className="hidden" />
        <p className="mt-1 text-[11px] text-slate-400">
          Exported from your phone or Google/Apple/Outlook contacts. Contacts already in this group are skipped, and
          any saved without a country code (e.g. +91) are skipped too since WhatsApp can't be messaged without one.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Numbers in this group ({group?.members.length ?? 0})
        </label>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200/60 bg-white/40 p-2 dark:border-white/10 dark:bg-white/[0.02]">
          {(group?.members.length ?? 0) === 0 && <p className="p-1 text-xs text-slate-400">No members yet.</p>}
          {group?.members.map((m) => {
            const phone = m.client ? m.client.user.phone : m.phone;
            const name = m.client ? m.client.businessName : m.name ?? undefined;
            return (
              <div key={m.id} className="rounded-md px-1.5 py-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-200">
                    {m.client ? (
                      <>
                        {m.client.businessName} <span className="text-slate-400">— {m.client.user.email}</span>
                      </>
                    ) : (
                      <>
                        {m.name ? `${m.name} — ` : ''}
                        <span className="font-mono text-slate-400">{m.phone}</span>
                      </>
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {phone && (
                      <button
                        type="button"
                        onClick={() => setFollowupFor((id) => (id === m.id ? null : m.id))}
                        className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                      >
                        Follow-up
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMemberMutation.mutate(m.id)}
                      className="text-slate-400 hover:text-red-500"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {followupFor === m.id && phone && (
                  <div className="mt-1.5">
                    <FollowupComposer phone={phone} name={name} onDone={() => setFollowupFor(null)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Add Phone Number</label>
        <PhoneNumberEntry recipients={[]} onAdd={(r) => addPhoneMutation.mutate(r)} onRemove={() => {}} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Add Clients</label>
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200/60 bg-white/40 p-2 dark:border-white/10 dark:bg-white/[0.02]">
          {(clientOptions?.length ?? 0) === 0 && <p className="p-1 text-xs text-slate-400">No clients found.</p>}
          {clientOptions?.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-slate-500/5">
              <input
                type="checkbox"
                checked={memberClientIds.has(c.id)}
                disabled={memberClientIds.has(c.id) || addClientMutation.isPending}
                onChange={() => addClientMutation.mutate(c.id)}
                className="accent-brand-500"
              />
              <span className="text-slate-700 dark:text-slate-200">{c.businessName}</span>
              <span className="truncate text-slate-400">{c.user.email}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Named, reusable contact lists mixing registered clients and manual phone numbers, targetable from any campaign. */
function GroupsPanel({ onError }: { onError: (msg: string) => void }) {
  const queryClient = useQueryClient();
  const [newGroupName, setNewGroupName] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const { data: groups, isLoading } = useQuery<OfferGroup[]>({
    queryKey: ['admin-offer-groups'],
    queryFn: async () => (await api.get('/admin/offer-groups')).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/offer-groups', { name: newGroupName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offer-groups'] });
      setNewGroupName('');
      onError('');
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/offer-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offer-groups'] });
      onError('');
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const exportMutation = useMutation({
    mutationFn: async ({ id, format }: { id: string; format: 'vcf' | 'csv' }) => {
      const res = await api.get(`/admin/offer-groups/${id}/export`, { params: { format }, responseType: 'blob' });
      return { blob: res.data as Blob, format };
    },
    onSuccess: ({ blob, format }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `group-contacts-export.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  return (
    <Card className="p-6 animate-tab-content space-y-4">
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand-500" />
        Contact Groups
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Build a named list once, mixing registered clients and manual phone numbers, then target it from any campaign.
      </p>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Group name, e.g. VIP Clients"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          className="text-xs"
        />
        <Button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={!newGroupName.trim() || createMutation.isPending}
          className="px-3 py-1.5 text-xs whitespace-nowrap"
        >
          {createMutation.isPending ? 'Creating...' : '+ Create Group'}
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {groups?.map((g) => (
            <div key={g.id} className="rounded-xl border border-slate-200/60 p-3 dark:border-white/10">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{g.name}</p>
                  <p className="text-[11px] text-slate-400">{g._count.members} member(s)</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="px-2.5 py-1 text-xs"
                    onClick={() => setExpandedGroupId(g.id)}
                  >
                    📇 Import .vcf
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-2.5 py-1 text-xs"
                    onClick={() => setExpandedGroupId((id) => (id === g.id ? null : g.id))}
                  >
                    {expandedGroupId === g.id ? 'Hide Contacts' : 'View Contacts'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-2.5 py-1 text-xs"
                    disabled={exportMutation.isPending}
                    onClick={() => exportMutation.mutate({ id: g.id, format: 'vcf' })}
                  >
                    Export .vcf
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-2.5 py-1 text-xs"
                    disabled={exportMutation.isPending}
                    onClick={() => exportMutation.mutate({ id: g.id, format: 'csv' })}
                  >
                    Export .csv
                  </Button>
                  <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => deleteMutation.mutate(g.id)}>
                    Delete
                  </Button>
                </div>
              </div>
              {expandedGroupId === g.id && (
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/5">
                  <GroupMembersPanel groupId={g.id} onError={onError} />
                </div>
              )}
            </div>
          ))}
          {groups?.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No groups yet — create one above.</p>}
        </div>
      )}
    </Card>
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

  const { page, setPage, totalPages, pageItems } = usePagination(trashed, 10);

  if (isLoading) return <Spinner />;

  return (
    <div className="animate-tab-content space-y-5">
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {pageItems.map((c) => (
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
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

/** Top-level "Import .vcf" entry point next to "+ New Campaign" — pick or create a group right
 * here instead of first navigating into Contacts, then drilling into that specific group's card. */
function QuickVcfImportPanel({ groups, onImported, onError, onClose }: { groups: OfferGroup[]; onImported: () => void; onError: (msg: string) => void; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [groupChoice, setGroupChoice] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [result, setResult] = useState('');

  const createGroupMutation = useMutation({
    mutationFn: () => api.post('/admin/offer-groups', { name: newGroupName }),
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      let groupId = groupChoice;
      if (!groupId) {
        const created = await createGroupMutation.mutateAsync();
        groupId = created.data.data.id;
      }
      const body = new FormData();
      body.append('file', file);
      const res = await api.post(`/admin/offer-groups/${groupId}/members/import-vcf`, body);
      return res.data.data;
    },
    onSuccess: ({ imported, skipped, missingCountryCode }) => {
      setResult(
        `Imported ${imported} contact(s)` +
          (skipped > 0 ? `, skipped ${skipped} already in the group` : '') +
          (missingCountryCode > 0
            ? `. Skipped ${missingCountryCode} without a country code — save them as e.g. +91XXXXXXXXXX in your contacts and re-import.`
            : '.'),
      );
      onError('');
      queryClient.invalidateQueries({ queryKey: ['admin-offer-groups'] });
      onImported();
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err) => {
      onError(apiErrorMessage(err));
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setResult('');
      importMutation.mutate(file);
    }
  }

  const canImport = groupChoice || newGroupName.trim();

  return (
    <Card className="p-5 animate-tab-content space-y-3">
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand-500" />
        Import Contacts (.vcf)
      </h2>
      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          value={groupChoice}
          onChange={(e) => { setGroupChoice(e.target.value); setNewGroupName(''); }}
          className="text-xs"
        >
          <option value="">+ Create a new group...</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name} ({g._count.members})</option>
          ))}
        </Select>
        {!groupChoice && (
          <Input
            placeholder="New group name, e.g. VIP Clients"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="flex-1 min-w-[160px] text-xs"
          />
        )}
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canImport || importMutation.isPending}
          className="px-3 py-1.5 text-xs whitespace-nowrap"
        >
          {importMutation.isPending ? 'Importing...' : '📇 Choose .vcf File'}
        </Button>
        <Button type="button" variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={onClose}>Close</Button>
      </div>
      <input ref={fileInputRef} type="file" accept=".vcf,text/vcard" onChange={handleFileChange} className="hidden" />
      {result && <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{result} See the Contacts tab below.</p>}
      <p className="text-[11px] text-slate-400">
        Exported from your phone or Google/Apple/Outlook contacts. Numbers saved without a country code (e.g. +91) will be skipped.
      </p>
    </Card>
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
  const [createPhoneRecipients, setCreatePhoneRecipients] = useState<PhoneRecipient[]>([]);
  const [pendingAction, setPendingAction] = useState<'draft' | 'send'>('draft');
  const [target, setTarget] = useState<Record<string, string>>({});
  const [selectedClients, setSelectedClients] = useState<Record<string, string[]>>({});
  const [phoneRecipients, setPhoneRecipients] = useState<Record<string, PhoneRecipient[]>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CONTACTS' | 'TRASH'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [showQuickImport, setShowQuickImport] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createGroupId, setCreateGroupId] = useState('');
  const [groupId, setGroupId] = useState<Record<string, string>>({});

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

  const { data: offerGroups } = useQuery<OfferGroup[]>({
    queryKey: ['admin-offer-groups'],
    queryFn: async () => (await api.get('/admin/offer-groups')).data.data,
  });

  function resetCreateForm() {
    setForm({ name: '', message: '', mediaUrl: '', mediaType: '', mediaFileName: '' });
    setAiPrompt('');
    setCreateTarget('ACTIVE_CLIENTS');
    setCreateSelectedClients([]);
    setCreatePhoneRecipients([]);
    setCreateGroupId('');
    setEditingId(null);
    setShowCreate(false);
  }

  function startEdit(campaign: Campaign) {
    setEditingId(campaign.id);
    setForm({
      name: campaign.name,
      message: campaign.config?.message ?? '',
      mediaUrl: campaign.config?.mediaUrl ?? '',
      mediaType: campaign.config?.mediaType ?? '',
      mediaFileName: campaign.config?.mediaFileName ?? '',
    });
    setAiPrompt('');
    setShowCreate(true);
    setError('');
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

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/admin/offers/${editingId}`, {
        name: form.name,
        message: form.message,
        mediaUrl: form.mediaUrl || null,
        mediaType: form.mediaType || null,
        mediaFileName: form.mediaFileName || null,
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
        phoneNumbers: createTarget === 'PHONE_NUMBERS' ? createPhoneRecipients : undefined,
        groupId: createTarget === 'GROUP' ? createGroupId : undefined,
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
        phoneNumbers: chosenTarget === 'PHONE_NUMBERS' ? phoneRecipients[id] ?? [] : undefined,
        groupId: chosenTarget === 'GROUP' ? groupId[id] : undefined,
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

  function addPhoneRecipient(campaignId: string, recipient: PhoneRecipient) {
    setPhoneRecipients((p) => ({ ...p, [campaignId]: [...(p[campaignId] ?? []), recipient] }));
  }

  function removePhoneRecipient(campaignId: string, index: number) {
    setPhoneRecipients((p) => ({ ...p, [campaignId]: (p[campaignId] ?? []).filter((_, i) => i !== index) }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (editingId) {
      updateMutation.mutate();
    } else if (pendingAction === 'send') {
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

  const campaignsPagination = usePagination(filteredCampaigns, 10);

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
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" onClick={() => setShowQuickImport((s) => !s)} className="text-xs">
            {showQuickImport ? 'Close Import' : '📇 Import .vcf'}
          </Button>
          <Button onClick={() => (showCreate ? resetCreateForm() : setShowCreate(true))} className="text-xs">
            {showCreate ? 'Close Campaign Form' : '+ New Campaign'}
          </Button>
        </div>
      </div>

      {showQuickImport && (
        <QuickVcfImportPanel
          groups={offerGroups ?? []}
          onError={setError}
          onImported={() => setActiveFilter('CONTACTS')}
          onClose={() => setShowQuickImport(false)}
        />
      )}

      {/* Campaign Form */}
      {showCreate && (
        <Card className="p-6 animate-tab-content">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            {editingId ? 'Edit Broadcast' : 'Create Promotional Broadcast'}
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

            {!editingId && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Send To (used only if you send immediately)</label>
                <Select value={createTarget} onChange={(e) => setCreateTarget(e.target.value)} className="text-xs">
                  <option value="ACTIVE_CLIENTS">Active clients only</option>
                  <option value="ALL_CLIENTS">All clients</option>
                  <option value="SPECIFIC_CLIENTS">Specific client(s)...</option>
                  <option value="PHONE_NUMBERS">Phone number(s)...</option>
                  <option value="GROUP">Contact group...</option>
                </Select>
                {createTarget === 'SPECIFIC_CLIENTS' && (
                  <div className="mt-2">
                    <ClientPicker clients={clientOptions ?? []} selected={createSelectedClients} onToggle={toggleCreateSelectedClient} />
                  </div>
                )}
                {createTarget === 'PHONE_NUMBERS' && (
                  <div className="mt-2">
                    <PhoneNumberEntry
                      recipients={createPhoneRecipients}
                      onAdd={(r) => setCreatePhoneRecipients((s) => [...s, r])}
                      onRemove={(i) => setCreatePhoneRecipients((s) => s.filter((_, idx) => idx !== i))}
                    />
                  </div>
                )}
                {createTarget === 'GROUP' && (
                  <Select value={createGroupId} onChange={(e) => setCreateGroupId(e.target.value)} className="mt-2 text-xs">
                    <option value="">Select a group...</option>
                    {offerGroups?.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g._count.members})
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {editingId ? (
                <>
                  <Button type="submit" disabled={updateMutation.isPending} className="text-xs">
                    {updateMutation.isPending ? 'Saving Changes...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={resetCreateForm} className="text-xs">
                    Cancel
                  </Button>
                </>
              ) : (
                <>
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
                      (createTarget === 'SPECIFIC_CLIENTS' && createSelectedClients.length === 0) ||
                      (createTarget === 'PHONE_NUMBERS' && createPhoneRecipients.length === 0) ||
                      (createTarget === 'GROUP' && !createGroupId)
                    }
                    className="text-xs"
                  >
                    {createAndSendMutation.isPending ? 'Sending...' : 'Create & Send Now'}
                  </Button>
                </>
              )}
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
            { id: 'CONTACTS', label: 'Contacts', count: offerGroups?.reduce((sum, g) => sum + g._count.members, 0) ?? 0 },
            { id: 'TRASH', label: 'Trash', count: trashedCampaigns?.length ?? 0 },
          ]}
          activeTab={activeFilter}
          onChange={(f) => { setActiveFilter(f as any); campaignsPagination.setPage(1); }}
        />
      </div>

      {activeFilter === 'CONTACTS' ? (
        <GroupsPanel onError={setError} />
      ) : activeFilter === 'TRASH' ? (
        <TrashPanel onError={setError} />
      ) : isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 animate-tab-content">
          {campaignsPagination.pageItems.map((c) => (
            <Card key={c.id} hoverEffect className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{c.name}</h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={STATUS_TONE[c.status] ?? 'gray'}>{c.status}</Badge>
                    {c.status === 'DRAFT' && (
                      <Button variant="secondary" className="px-2.5 py-1 text-[11px]" onClick={() => startEdit(c)}>
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      className="px-2.5 py-1 text-[11px]"
                      onClick={() => deleteMutation.mutate(c.id)}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
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
                      <option value="PHONE_NUMBERS">Phone number(s)...</option>
                      <option value="GROUP">Contact group...</option>
                    </Select>
                    <Button
                      className="px-3 py-1.5 text-xs whitespace-nowrap"
                      onClick={() => sendMutation.mutate(c.id)}
                      disabled={
                        sendMutation.isPending ||
                        (target[c.id] === 'SPECIFIC_CLIENTS' && !(selectedClients[c.id]?.length)) ||
                        (target[c.id] === 'PHONE_NUMBERS' && !(phoneRecipients[c.id]?.length)) ||
                        (target[c.id] === 'GROUP' && !groupId[c.id])
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
                  {target[c.id] === 'PHONE_NUMBERS' && (
                    <PhoneNumberEntry
                      recipients={phoneRecipients[c.id] ?? []}
                      onAdd={(r) => addPhoneRecipient(c.id, r)}
                      onRemove={(i) => removePhoneRecipient(c.id, i)}
                    />
                  )}
                  {target[c.id] === 'GROUP' && (
                    <Select
                      value={groupId[c.id] ?? ''}
                      onChange={(e) => setGroupId((g) => ({ ...g, [c.id]: e.target.value }))}
                      className="text-xs"
                    >
                      <option value="">Select a group...</option>
                      {offerGroups?.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({g._count.members})
                        </option>
                      ))}
                    </Select>
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

      {activeFilter !== 'CONTACTS' && activeFilter !== 'TRASH' && (
        <Pagination page={campaignsPagination.page} totalPages={campaignsPagination.totalPages} onPageChange={campaignsPagination.setPage} />
      )}
    </div>
  );
}
