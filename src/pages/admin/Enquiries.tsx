import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Select, Spinner, Tabs, Textarea } from '../../components/ui';

interface Enquiry {
  id: string; name: string; phone: string; email: string | null; businessName: string | null;
  businessType: string | null; message: string | null; status: string; createdAt: string;
}

interface EnquiryMessage {
  id: string; direction: 'INBOUND' | 'OUTBOUND'; content: string; createdAt: string;
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
  const { data: messages, isLoading } = useQuery<EnquiryMessage[]>({
    queryKey: ['admin-enquiry-messages', enquiryId],
    queryFn: async () => (await api.get(`/admin/enquiries/${enquiryId}/messages`)).data.data,
    refetchInterval: 8000,
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
                ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            <p className="mt-1 text-[10px] opacity-60">{new Date(m.createdAt).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminEnquiries() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data: enquiries, isLoading } = useQuery<Enquiry[]>({
    queryKey: ['admin-enquiries', status],
    queryFn: async () => (await api.get('/admin/enquiries', { params: { status: status || undefined } })).data.data,
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

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Prospective Leads &amp; Enquiries
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Every new enquiry automatically gets an AI-written email + WhatsApp introduction, and the AI keeps
          replying on WhatsApp as they respond — view the live conversation, or send a manual follow-up any time.
        </p>
      </div>

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
          onChange={(tab) => setStatus(tab)}
        />
      </div>

      <ErrorText>{error}</ErrorText>

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 animate-tab-content">
          {enquiries?.map((e) => (

            <Card key={e.id} hoverEffect className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-bold text-slate-900 dark:text-white">{e.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {e.phone}{e.email ? ` · ${e.email}` : ''}
                    </p>
                  </div>
                  <Badge tone={TONE[e.status] ?? 'gray'}>{e.status.replace('_', ' ')}</Badge>
                </div>

                {(e.businessName || e.businessType) && (
                  <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-500/10 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>{e.businessName}</span>
                    {e.businessType && <span className="text-slate-400 font-normal">({e.businessType})</span>}
                  </div>
                )}

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
    </div>
  );
}

