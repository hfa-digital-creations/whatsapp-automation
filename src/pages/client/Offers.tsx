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
  id: string;
  status: string;
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
  phone: string | null;
  name: string | null;
}

interface OfferGroupDetail extends OfferGroup {
  members: OfferGroupMember[];
}

interface WhatsappAccount {
  id: string;
  sessionId: string;
  displayName: string | null;
  phoneNumber: string | null;
  status: string;
}

const STATUS_TONE: Record<string, 'gray' | 'green' | 'amber' | 'blue'> = {
  DRAFT: 'gray', SCHEDULED: 'blue', RUNNING: 'amber', COMPLETED: 'green', CANCELLED: 'gray',
};

const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/3gpp,application/pdf';

function CampaignProgress({ campaignId }: { campaignId: string }) {
  const { data: messages } = useQuery<CampaignMessage[]>({
    queryKey: ['client-offer-messages', campaignId],
    queryFn: async () => (await api.get(`/client/offers/${campaignId}/messages`)).data.data,
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
          placeholder="Customer phone (e.g. 919876543210)"
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

/** Which of the client's own connected WhatsApp accounts to send from — required for every send/follow-up. */
function SessionPicker({ accounts, value, onChange }: { accounts: WhatsappAccount[]; value: string; onChange: (v: string) => void }) {
  const connected = accounts.filter((a) => a.status === 'CONNECTED');
  if (!connected.length) {
    return <p className="text-[11px] text-rose-500">Connect a WhatsApp account first — see the WhatsApp Accounts page.</p>;
  }
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="text-xs">
      <option value="">Send from...</option>
      {connected.map((a) => (
        <option key={a.sessionId} value={a.sessionId}>
          {a.displayName || a.phoneNumber || a.sessionId}
        </option>
      ))}
    </Select>
  );
}

function FollowupComposer({ phone, name, sessionId, onDone }: { phone: string; name?: string; sessionId: string; onDone: () => void }) {
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const generateMutation = useMutation({
    mutationFn: () => api.post('/client/offers/generate-message', { prompt: prompt || `A short, friendly follow-up message${name ? ` to ${name}` : ''}.` }),
    onSuccess: (res) => setMessage(res.data.data.message),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post('/client/offers/followup', { phone, name, message, sessionId }),
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

function GroupMembersPanel({ groupId, accounts, onError }: { groupId: string; accounts: WhatsappAccount[]; onError: (msg: string) => void }) {
  const queryClient = useQueryClient();
  const vcfInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState('');
  const [followupFor, setFollowupFor] = useState<string | null>(null);
  const [followupSession, setFollowupSession] = useState('');

  const { data: group, isLoading } = useQuery<OfferGroupDetail>({
    queryKey: ['client-offer-group', groupId],
    queryFn: async () => (await api.get(`/client/offer-groups/${groupId}`)).data.data,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['client-offer-group', groupId] });
    queryClient.invalidateQueries({ queryKey: ['client-offer-groups'] });
  }

  const addPhoneMutation = useMutation({
    mutationFn: (r: PhoneRecipient) => api.post(`/client/offer-groups/${groupId}/members`, { phone: r.phone, name: r.name }),
    onSuccess: () => { onError(''); invalidate(); },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/client/offer-groups/${groupId}/members/${memberId}`),
    onSuccess: () => { onError(''); invalidate(); },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const importVcfMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.post(`/client/offer-groups/${groupId}/members/import-vcf`, body);
    },
    onSuccess: (res) => {
      const { imported, skipped } = res.data.data;
      setImportResult(`Imported ${imported} contact(s)${skipped > 0 ? `, skipped ${skipped} already in the group` : ''}.`);
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

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-2.5">
        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">📇 Import Customers (.vcf)</label>
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
          Exported from your phone or Google/Apple/Outlook contacts. Contacts already in this group are skipped.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Numbers in this group ({group?.members.length ?? 0})
        </label>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200/60 bg-white/40 p-2 dark:border-white/10 dark:bg-white/[0.02]">
          {(group?.members.length ?? 0) === 0 && <p className="p-1 text-xs text-slate-400">No members yet.</p>}
          {group?.members.map((m) => (
            <div key={m.id} className="rounded-md px-1.5 py-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-700 dark:text-slate-200">
                  {m.name ? `${m.name} — ` : ''}
                  <span className="font-mono text-slate-400">{m.phone}</span>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {m.phone && (
                    <button
                      type="button"
                      onClick={() => { setFollowupFor((id) => (id === m.id ? null : m.id)); setFollowupSession(''); }}
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
              {followupFor === m.id && m.phone && (
                <div className="mt-1.5 space-y-1.5">
                  <SessionPicker accounts={accounts} value={followupSession} onChange={setFollowupSession} />
                  {followupSession && (
                    <FollowupComposer
                      phone={m.phone}
                      name={m.name ?? undefined}
                      sessionId={followupSession}
                      onDone={() => setFollowupFor(null)}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Add Customer Phone Number</label>
        <PhoneNumberEntry recipients={[]} onAdd={(r) => addPhoneMutation.mutate(r)} onRemove={() => {}} />
      </div>
    </div>
  );
}

function GroupsPanel({ accounts, onError }: { accounts: WhatsappAccount[]; onError: (msg: string) => void }) {
  const queryClient = useQueryClient();
  const [newGroupName, setNewGroupName] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const { data: groups, isLoading } = useQuery<OfferGroup[]>({
    queryKey: ['client-offer-groups'],
    queryFn: async () => (await api.get('/client/offer-groups')).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/client/offer-groups', { name: newGroupName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offer-groups'] });
      setNewGroupName('');
      onError('');
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/client/offer-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offer-groups'] });
      onError('');
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const exportMutation = useMutation({
    mutationFn: async ({ id, format }: { id: string; format: 'vcf' | 'csv' }) => {
      const res = await api.get(`/client/offer-groups/${id}/export`, { params: { format }, responseType: 'blob' });
      return { blob: res.data as Blob, format };
    },
    onSuccess: ({ blob, format }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customer-contacts-export.${format}`;
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
        Customer Contact Groups
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Build a named list of your own customers once, then target it from any campaign.
      </p>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Group name, e.g. Loyal Customers"
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
                  <Button className="px-2.5 py-1 text-xs" onClick={() => setExpandedGroupId(g.id)}>
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
                  <GroupMembersPanel groupId={g.id} accounts={accounts} onError={onError} />
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

function TrashPanel({ onError }: { onError: (msg: string) => void }) {
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: trashed, isLoading } = useQuery<TrashedCampaign[]>({
    queryKey: ['client-offers-trash'],
    queryFn: async () => (await api.get('/client/offers/trash')).data.data,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['client-offers-trash'] });
    queryClient.invalidateQueries({ queryKey: ['client-offers'] });
  }

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/client/offers/${id}/restore`),
    onSuccess: () => { onError(''); invalidateAll(); },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/client/offers/${id}/permanent`),
    onSuccess: () => { onError(''); setConfirmDeleteId(null); invalidateAll(); },
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
            <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={restoreMutation.isPending} onClick={() => restoreMutation.mutate(c.id)}>
              Restore
            </Button>
            {confirmDeleteId === c.id ? (
              <>
                <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={permanentDeleteMutation.isPending} onClick={() => permanentDeleteMutation.mutate(c.id)}>
                  {permanentDeleteMutation.isPending ? 'Deleting...' : 'Confirm Permanent Delete'}
                </Button>
                <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => setConfirmDeleteId(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" className="px-2.5 py-1.5 text-xs text-rose-500 hover:text-rose-600" onClick={() => setConfirmDeleteId(c.id)}>
                Delete Forever
              </Button>
            )}
          </div>
        </Card>
      ))}
      {trashed?.length === 0 && <div className="col-span-full py-12 text-center text-sm text-slate-400">Trash is empty.</div>}
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
    mutationFn: () => api.post('/client/offer-groups', { name: newGroupName }),
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
      const res = await api.post(`/client/offer-groups/${groupId}/members/import-vcf`, body);
      return res.data.data;
    },
    onSuccess: ({ imported, skipped }) => {
      setResult(`Imported ${imported} contact(s)${skipped > 0 ? `, skipped ${skipped} already in the group` : ''}.`);
      onError('');
      queryClient.invalidateQueries({ queryKey: ['client-offer-groups'] });
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
        Import Customers (.vcf)
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
            placeholder="New group name, e.g. Loyal Customers"
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
      <p className="text-[11px] text-slate-400">Exported from your phone or Google/Apple/Outlook contacts.</p>
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

export default function ClientOffers() {
  const queryClient = useQueryClient();
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: '', message: '', mediaUrl: '', mediaType: '' as OfferMediaType | '', mediaFileName: '' });
  const [aiPrompt, setAiPrompt] = useState('');
  const [createTarget, setCreateTarget] = useState<'PHONE_NUMBERS' | 'GROUP'>('PHONE_NUMBERS');
  const [createPhoneRecipients, setCreatePhoneRecipients] = useState<PhoneRecipient[]>([]);
  const [createGroupId, setCreateGroupId] = useState('');
  const [createSessionId, setCreateSessionId] = useState('');
  const [pendingAction, setPendingAction] = useState<'draft' | 'send'>('draft');
  const [target, setTarget] = useState<Record<string, 'PHONE_NUMBERS' | 'GROUP'>>({});
  const [phoneRecipients, setPhoneRecipients] = useState<Record<string, PhoneRecipient[]>>({});
  const [groupId, setGroupId] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CONTACTS' | 'TRASH'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [showQuickImport, setShowQuickImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: features } = useQuery<Record<string, boolean>>({
    queryKey: ['client-features'],
    queryFn: async () => (await api.get('/client/features')).data.data,
  });

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ['client-offers'],
    queryFn: async () => (await api.get('/client/offers')).data.data,
    refetchInterval: (query) => (query.state.data?.some((c) => c.status === 'RUNNING') ? 5000 : false),
    enabled: features?.OFFER_MESSAGES === true,
  });

  const { data: accounts } = useQuery<WhatsappAccount[]>({
    queryKey: ['client-whatsapp-accounts'],
    queryFn: async () => (await api.get('/client/whatsapp/accounts')).data.data,
    enabled: features?.OFFER_MESSAGES === true,
  });

  const { data: trashedCampaigns } = useQuery<TrashedCampaign[]>({
    queryKey: ['client-offers-trash'],
    queryFn: async () => (await api.get('/client/offers/trash')).data.data,
    enabled: features?.OFFER_MESSAGES === true,
  });

  const { data: offerGroups } = useQuery<OfferGroup[]>({
    queryKey: ['client-offer-groups'],
    queryFn: async () => (await api.get('/client/offer-groups')).data.data,
    enabled: features?.OFFER_MESSAGES === true,
  });

  function resetCreateForm() {
    setForm({ name: '', message: '', mediaUrl: '', mediaType: '', mediaFileName: '' });
    setAiPrompt('');
    setCreateTarget('PHONE_NUMBERS');
    setCreatePhoneRecipients([]);
    setCreateGroupId('');
    setCreateSessionId('');
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
      api.post('/client/offers', {
        name: form.name,
        message: form.message,
        mediaUrl: form.mediaUrl || undefined,
        mediaType: form.mediaType || undefined,
        mediaFileName: form.mediaFileName || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offers'] });
      resetCreateForm();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/client/offers/${editingId}`, {
        name: form.name,
        message: form.message,
        mediaUrl: form.mediaUrl || null,
        mediaType: form.mediaType || null,
        mediaFileName: form.mediaFileName || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offers'] });
      resetCreateForm();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const createAndSendMutation = useMutation({
    mutationFn: async () => {
      const createRes = await api.post('/client/offers', {
        name: form.name,
        message: form.message,
        mediaUrl: form.mediaUrl || undefined,
        mediaType: form.mediaType || undefined,
        mediaFileName: form.mediaFileName || undefined,
      });
      const newId = createRes.data.data.id;
      await api.post(`/client/offers/${newId}/send`, {
        target: createTarget,
        phoneNumbers: createTarget === 'PHONE_NUMBERS' ? createPhoneRecipients : undefined,
        groupId: createTarget === 'GROUP' ? createGroupId : undefined,
        sessionId: createSessionId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offers'] });
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
      return api.post('/client/offers/media', body);
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
    mutationFn: () => api.post('/client/offers/generate-message', { prompt: aiPrompt }),
    onSuccess: (res) => {
      setForm((f) => ({ ...f, message: res.data.data.message }));
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => {
      const chosenTarget = target[id] ?? 'PHONE_NUMBERS';
      return api.post(`/client/offers/${id}/send`, {
        target: chosenTarget,
        phoneNumbers: chosenTarget === 'PHONE_NUMBERS' ? phoneRecipients[id] ?? [] : undefined,
        groupId: chosenTarget === 'GROUP' ? groupId[id] : undefined,
        sessionId: sessionId[id],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offers'] });
      setResult('Broadcast queued — sending in small batches with safety pauses in the background. Progress shows on the campaign card below.');
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/client/offers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offers'] });
      queryClient.invalidateQueries({ queryKey: ['client-offers-trash'] });
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

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

  if (features && features.OFFER_MESSAGES !== true) {
    return (
      <div className="space-y-6 animate-glass-entrance">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Promotional Campaigns</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Send broadcasts and offers to your own customers over WhatsApp.</p>
        </div>
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">This feature isn't enabled on your plan yet.</p>
          <p className="mt-1 text-xs text-slate-400">Contact the platform admin to turn on Offer Messages for your account.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-glass-entrance">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Promotional Campaigns</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Send broadcasts, offers, and announcements to your own customers over your connected WhatsApp. Supports{' '}
            <code className="bg-slate-500/10 px-1 py-0.5 rounded text-brand-600 dark:text-brand-400 font-mono">{'{{businessName}}'}</code>.
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

      {showCreate && (
        <Card className="p-6 animate-tab-content">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            {editingId ? 'Edit Broadcast' : 'Create Promotional Broadcast'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Campaign Title</label>
              <Input placeholder="e.g. Weekend Special 20% Off" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Generate with AI (optional)</label>
              <div className="flex items-center gap-2.5">
                <Input
                  placeholder="e.g. Weekend sale, 20% off, code WEEKEND20"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="text-xs"
                />
                <Button type="button" className="px-3 py-1.5 text-xs whitespace-nowrap" disabled={!aiPrompt.trim() || generateTextMutation.isPending} onClick={() => generateTextMutation.mutate()}>
                  {generateTextMutation.isPending ? 'Writing...' : '✨ Generate'}
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Broadcast Message</label>
              <Textarea
                placeholder="Hi {{businessName}}, this weekend only — 20% off! Use code WEEKEND20 at checkout."
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
                  <Button type="button" onClick={removeMedia} className="px-2 py-1 text-xs">Remove</Button>
                </div>
              ) : (
                <Button type="button" onClick={() => mediaInputRef.current?.click()} disabled={uploadMediaMutation.isPending} className="px-3 py-1.5 text-xs">
                  {uploadMediaMutation.isPending ? 'Uploading...' : '+ Attach File'}
                </Button>
              )}
              <input ref={mediaInputRef} type="file" accept={MEDIA_ACCEPT} onChange={handleMediaChange} className="hidden" />
              <p className="mt-1 text-[11px] text-slate-400">Images up to 5MB, video up to 16MB, PDF up to 16MB.</p>
            </div>

            {!editingId && (
              <div className="space-y-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Send To (used only if you send immediately)</label>
                <Select value={createTarget} onChange={(e) => setCreateTarget(e.target.value as 'PHONE_NUMBERS' | 'GROUP')} className="text-xs">
                  <option value="PHONE_NUMBERS">Phone number(s)...</option>
                  <option value="GROUP">Contact group...</option>
                </Select>
                {createTarget === 'PHONE_NUMBERS' && (
                  <PhoneNumberEntry
                    recipients={createPhoneRecipients}
                    onAdd={(r) => setCreatePhoneRecipients((s) => [...s, r])}
                    onRemove={(i) => setCreatePhoneRecipients((s) => s.filter((_, idx) => idx !== i))}
                  />
                )}
                {createTarget === 'GROUP' && (
                  <Select value={createGroupId} onChange={(e) => setCreateGroupId(e.target.value)} className="text-xs">
                    <option value="">Select a group...</option>
                    {offerGroups?.map((g) => (
                      <option key={g.id} value={g.id}>{g.name} ({g._count.members})</option>
                    ))}
                  </Select>
                )}
                <SessionPicker accounts={accounts ?? []} value={createSessionId} onChange={setCreateSessionId} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {editingId ? (
                <>
                  <Button type="submit" disabled={updateMutation.isPending} className="text-xs">
                    {updateMutation.isPending ? 'Saving Changes...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={resetCreateForm} className="text-xs">Cancel</Button>
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
                      !createSessionId ||
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
          onChange={(f) => setActiveFilter(f as any)}
        />
      </div>

      {activeFilter === 'CONTACTS' ? (
        <GroupsPanel accounts={accounts ?? []} onError={setError} />
      ) : activeFilter === 'TRASH' ? (
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
                    {c.status === 'DRAFT' && (
                      <Button variant="secondary" className="px-2.5 py-1 text-[11px]" onClick={() => startEdit(c)}>Edit</Button>
                    )}
                    {c.status !== 'RUNNING' && (
                      <Button variant="danger" className="px-2.5 py-1 text-[11px]" onClick={() => deleteMutation.mutate(c.id)} disabled={deleteMutation.isPending}>
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
                  <Select value={target[c.id] ?? 'PHONE_NUMBERS'} onChange={(e) => setTarget((t) => ({ ...t, [c.id]: e.target.value as 'PHONE_NUMBERS' | 'GROUP' }))} className="text-xs">
                    <option value="PHONE_NUMBERS">Phone number(s)...</option>
                    <option value="GROUP">Contact group...</option>
                  </Select>
                  {(target[c.id] ?? 'PHONE_NUMBERS') === 'PHONE_NUMBERS' && (
                    <PhoneNumberEntry
                      recipients={phoneRecipients[c.id] ?? []}
                      onAdd={(r) => addPhoneRecipient(c.id, r)}
                      onRemove={(i) => removePhoneRecipient(c.id, i)}
                    />
                  )}
                  {target[c.id] === 'GROUP' && (
                    <Select value={groupId[c.id] ?? ''} onChange={(e) => setGroupId((g) => ({ ...g, [c.id]: e.target.value }))} className="text-xs">
                      <option value="">Select a group...</option>
                      {offerGroups?.map((g) => (
                        <option key={g.id} value={g.id}>{g.name} ({g._count.members})</option>
                      ))}
                    </Select>
                  )}
                  <SessionPicker accounts={accounts ?? []} value={sessionId[c.id] ?? ''} onChange={(v) => setSessionId((s) => ({ ...s, [c.id]: v }))} />
                  <Button
                    className="w-full px-3 py-1.5 text-xs whitespace-nowrap"
                    onClick={() => sendMutation.mutate(c.id)}
                    disabled={
                      sendMutation.isPending ||
                      !sessionId[c.id] ||
                      ((target[c.id] ?? 'PHONE_NUMBERS') === 'PHONE_NUMBERS' && !(phoneRecipients[c.id]?.length)) ||
                      (target[c.id] === 'GROUP' && !groupId[c.id])
                    }
                  >
                    {sendMutation.isPending ? 'Queuing...' : 'Broadcast Now'}
                  </Button>
                </div>
              )}
            </Card>
          ))}
          {filteredCampaigns?.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-slate-400">No promotional campaigns found matching the selected filter.</div>
          )}
        </div>
      )}
    </div>
  );
}
