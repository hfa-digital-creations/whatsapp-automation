import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Pagination, Select, Spinner, Tabs, Textarea } from '../../components/ui';
import { usePagination } from '../../lib/usePagination';

interface Enquiry {
  id: string; name: string; phone: string; email: string | null; businessName: string | null;
  businessType: string | null; message: string | null; status: string; createdAt: string;
  planId: string | null;
}

interface Plan {
  id: string;
  title: string;
}

interface EnquiryMessage {
  id: string; direction: 'INBOUND' | 'OUTBOUND'; content: string; createdAt: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; automationGenerated: boolean;
}

const STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP', 'CONVERTED', 'NOT_INTERESTED', 'CLOSED'];
const TONE: Record<string, 'gray' | 'green' | 'red' | 'amber' | 'blue'> = {
  NEW: 'blue', CONTACTED: 'amber', INTERESTED: 'amber', FOLLOW_UP: 'amber', CONVERTED: 'green', NOT_INTERESTED: 'red', CLOSED: 'gray',
};

/**
 * The pre-sales conversation now runs automatically (initial outreach on submission, AI
 * auto-replies as the prospect messages back on WhatsApp) — this shows the full thread so
 * an admin can see what's already been said without leaving the panel or opening WhatsApp.
 */
function EnquiryConversation({ enquiryId }: { enquiryId: string }) {
  const queryClient = useQueryClient();
  const [editingDraft, setEditingDraft] = useState<{ id: string; content: string } | null>(null);

  const { data: messages, isLoading } = useQuery<EnquiryMessage[]>({
    queryKey: ['admin-enquiry-messages', enquiryId],
    queryFn: async () => (await api.get(`/admin/enquiries/${enquiryId}/messages`)).data.data,
    refetchInterval: 8000,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-enquiry-messages', enquiryId] });
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, editedContent }: { id: string; editedContent?: string }) =>
      api.post(`/admin/enquiries/messages/${id}/approve`, { editedContent }),
    onSuccess: () => {
      setEditingDraft(null);
      invalidate();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/enquiries/messages/${id}/reject`),
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200/50 bg-white/40 p-3 dark:border-white/5 dark:bg-white/[0.02]">
      {messages?.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No messages yet.</p>}
      {messages?.map((m) => (
        <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
              m.direction === 'OUTBOUND'
                ? m.status === 'QUEUED'
                  ? 'border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                  : 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            <p className="mt-1 text-[10px] opacity-60">{new Date(m.createdAt).toLocaleString()}</p>

            {m.status === 'QUEUED' && (
              <div className="mt-2 space-y-1.5 border-t border-amber-500/20 pt-2">
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Draft Awaiting Approval</p>
                {editingDraft?.id === m.id ? (
                  <div className="space-y-1.5">
                    <Input
                      value={editingDraft.content}
                      onChange={(e) => setEditingDraft({ id: m.id, content: e.target.value })}
                      className="text-xs text-slate-900"
                    />
                    <div className="flex justify-end">
                      <Button
                        className="px-2.5 py-1 text-xs"
                        disabled={approveMutation.isPending}
                        onClick={() => approveMutation.mutate({ id: m.id, editedContent: editingDraft.content })}
                      >
                        Confirm &amp; Send
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button className="px-2.5 py-1 text-xs" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate({ id: m.id })}>
                      Approve &amp; Send
                    </Button>
                    <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setEditingDraft({ id: m.id, content: m.content })}>
                      Edit
                    </Button>
                    <Button variant="danger" className="px-2.5 py-1 text-xs" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate(m.id)}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminEnquiries() {
  const queryClient = useQueryClient();
  const [source, setSource] = useState<'LANDING_PAGE' | 'WHATSAPP'>('LANDING_PAGE');
  const [status, setStatus] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '' });
  const [error, setError] = useState('');

  const { data: enquiries, isLoading } = useQuery<Enquiry[]>({
    queryKey: ['admin-enquiries', source, status],
    queryFn: async () => (await api.get('/admin/enquiries', { params: { source, status: status || undefined } })).data.data,
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['admin-plans-active'],
    queryFn: async () => (await api.get('/admin/plans', { params: { status: 'ACTIVE' } })).data.data,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/admin/enquiries/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-enquiries'] }),
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/enquiries/${id}/generate-message`),
    onSuccess: (res, id) => {
      const { draft, configured } = res.data.data;
      if (!configured) {
        setError('AI message generation requires ANTHROPIC_API_KEY to be configured by an admin.');
      } else if (draft) {
        setDrafts((d) => ({ ...d, [id]: draft }));
      }
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.post(`/admin/enquiries/${id}/send-message`, { content }),
    onSuccess: (_res, { id }) => {
      setDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['admin-enquiries'] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  /**
   * The only two things an admin does to turn a lead into a paying client: pick a plan,
   * click this. Account creation, an AI-drafted starting knowledge base, and login
   * credentials all happen server-side — see EnquiriesService.approveAndActivate().
   */
  const approveMutation = useMutation({
    mutationFn: ({ id, planId }: { id: string; planId: string }) =>
      api.post(`/admin/enquiries/${id}/approve-and-activate`, { planId }),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['admin-enquiries'] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  /**
   * Corrects contact-detail typos — most importantly a phone number submitted without its
   * country code, which otherwise silently "succeeds" against whatever WhatsApp account
   * that bare digit string actually belongs to, not the real prospect.
   */
  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: typeof editForm }) => api.patch(`/admin/enquiries/${id}`, dto),
    onSuccess: () => {
      setError('');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-enquiries'] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function startEdit(e: Enquiry) {
    setEditingId(e.id);
    setEditForm({ name: e.name, phone: e.phone, email: e.email ?? '' });
    setError('');
  }

  const { page, setPage, totalPages, pageItems } = usePagination(enquiries, 10);

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {source === 'LANDING_PAGE' ? 'Prospective Leads & Enquiries' : 'Direct WhatsApp Messages'}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {source === 'LANDING_PAGE'
            ? "Enquiries submitted through the landing page's contact form. Every new one automatically gets an AI-written email + WhatsApp introduction, and the AI keeps replying on WhatsApp as they respond — view the live conversation, or send a manual follow-up any time."
            : "Anyone who messaged the platform's own WhatsApp number directly, without submitting the landing page form — the AI answers as a general HFA Digital Creations sales executive. Kept separate from website enquiries above."}
        </p>
      </div>

      {/* Source Tabs — where the lead came from */}
      <Tabs
        tabs={[
          { id: 'LANDING_PAGE', label: '🌐 Website Enquiries' },
          { id: 'WHATSAPP', label: '💬 WhatsApp Messages' },
        ]}
        activeTab={source}
        onChange={(tab) => { setSource(tab as 'LANDING_PAGE' | 'WHATSAPP'); setStatus(''); setPage(1); }}
      />

      {/* Smooth Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          tabs={[
            { id: '', label: 'All Leads' },
            { id: 'NEW', label: 'New' },
            { id: 'INTERESTED', label: 'Interested' },
            { id: 'FOLLOW_UP', label: 'Follow Up' },
            { id: 'CONVERTED', label: 'Converted' },
            { id: 'CLOSED', label: 'Closed' },
          ]}
          activeTab={status}
          onChange={(tab) => { setStatus(tab); setPage(1); }}
        />
      </div>

      <ErrorText>{error}</ErrorText>

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 animate-tab-content">
          {pageItems.map((e) => (

            <Card key={e.id} hoverEffect className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-bold text-slate-900 dark:text-white">{e.name}</p>
                      <button
                        type="button"
                        title="Edit contact details"
                        onClick={() => (editingId === e.id ? setEditingId(null) : startEdit(e))}
                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                      >
                        ✏️
                      </button>
                    </div>
                    {editingId === e.id ? (
                      <div className="mt-1.5 space-y-1.5">
                        <Input
                          placeholder="Name"
                          value={editForm.name}
                          onChange={(ev) => setEditForm((f) => ({ ...f, name: ev.target.value }))}
                          className="text-xs py-1"
                        />
                        <Input
                          placeholder="Phone with country code, e.g. +919876543210"
                          value={editForm.phone}
                          onChange={(ev) => setEditForm((f) => ({ ...f, phone: ev.target.value }))}
                          className="text-xs py-1"
                        />
                        <Input
                          type="email"
                          placeholder="Email"
                          value={editForm.email}
                          onChange={(ev) => setEditForm((f) => ({ ...f, email: ev.target.value }))}
                          className="text-xs py-1"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            className="text-xs px-2.5 py-1"
                            disabled={updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: e.id, dto: editForm })}
                          >
                            {updateMutation.isPending ? 'Saving...' : 'Save'}
                          </Button>
                          <Button variant="secondary" className="text-xs px-2.5 py-1" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {e.phone}{e.email ? ` · ${e.email}` : ''}
                      </p>
                    )}
                  </div>
                  <Badge tone={TONE[e.status] ?? 'gray'}>{e.status.replace('_', ' ')}</Badge>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {(e.businessName || e.businessType) && (
                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-500/10 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span>{e.businessName}</span>
                      {e.businessType && <span className="text-slate-400 font-normal">({e.businessType})</span>}
                    </div>
                  )}
                  {e.planId && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                      💳 {plans?.find((p) => p.id === e.planId)?.title ?? 'Plan selected'}
                    </span>
                  )}
                </div>

                {e.message && (
                  <p className="mt-3 rounded-xl bg-white/40 p-3 text-xs text-slate-700 italic border border-slate-200/50 dark:bg-white/[0.02] dark:border-white/5 dark:text-slate-300">
                    "{e.message}"
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
                  <p className="text-[11px] text-slate-400 font-medium">{new Date(e.createdAt).toLocaleString()}</p>
                  <Select
                    value={e.status}
                    className="max-w-[150px] text-xs py-1"
                    onChange={(ev) => statusMutation.mutate({ id: e.id, status: ev.target.value })}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </Select>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <a
                    href={`https://wa.me/${e.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <span>Open in WhatsApp</span>
                    <span>&rarr;</span>
                  </a>
                  <Button
                    variant="secondary"
                    className="text-xs px-2.5 py-1"
                    onClick={() => setExpandedId((id) => (id === e.id ? null : e.id))}
                  >
                    {expandedId === e.id ? 'Hide Conversation' : 'View Conversation'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="text-xs px-2.5 py-1"
                    onClick={() => { setError(''); generateMutation.mutate(e.id); }}
                    disabled={generateMutation.isPending}
                  >
                    {generateMutation.isPending ? 'Generating...' : '✨ Generate AI Pitch'}
                  </Button>
                </div>

                {e.status !== 'CONVERTED' && (
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-3">
                    <Select
                      value={selectedPlan[e.id] ?? e.planId ?? ''}
                      className="min-w-[160px] flex-1 text-xs py-1"
                      onChange={(ev) => setSelectedPlan((s) => ({ ...s, [e.id]: ev.target.value }))}
                    >
                      <option value="">Select a plan to activate...</option>
                      {plans?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </Select>
                    <Button
                      className="text-xs px-3 py-1.5"
                      disabled={!(selectedPlan[e.id] ?? e.planId) || approveMutation.isPending}
                      onClick={() => approveMutation.mutate({ id: e.id, planId: selectedPlan[e.id] ?? e.planId ?? '' })}
                    >
                      {approveMutation.isPending ? 'Activating...' : '✅ Approve & Activate'}
                    </Button>
                    <p className="w-full text-[10.5px] text-slate-500 dark:text-slate-400">
                      Creates the client account, drafts a starting knowledge base from their enquiry, and sends login credentials — automatically.
                    </p>
                  </div>
                )}

                {expandedId === e.id && <EnquiryConversation enquiryId={e.id} />}

                {drafts[e.id] !== undefined && (
                  <div className="mt-3.5 space-y-2.5 rounded-xl border border-brand-500/30 bg-brand-500/[0.03] p-3.5">
                    <label className="text-xs font-bold text-brand-600 dark:text-brand-400">AI Generated Draft:</label>
                    <Textarea
                      rows={3}
                      value={drafts[e.id]}
                      onChange={(ev) => setDrafts((d) => ({ ...d, [e.id]: ev.target.value }))}
                      className="text-xs"
                    />
                    <div className="flex justify-end">
                      <Button
                        className="px-3 py-1.5 text-xs"
                        onClick={() => sendMutation.mutate({ id: e.id, content: drafts[e.id] })}
                        disabled={sendMutation.isPending}
                      >
                        {sendMutation.isPending ? 'Sending...' : 'Send WhatsApp Message'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {enquiries?.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-slate-400">
              No customer inquiries found for this status.
            </div>
          )}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

