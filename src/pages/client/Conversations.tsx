import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { useMultiSelect } from '../../lib/useMultiSelect';
import { Badge, Button, Card, ErrorText, Input, Spinner } from '../../components/ui';

interface Conversation {
  id: string; customerName: string | null; customerPhone: string; leadStatus: string; lastMessageAt: string | null;
  whatsappAccount: { displayName: string | null; phoneNumber: string | null };
}
interface Message {
  id: string; direction: 'INBOUND' | 'OUTBOUND'; content: string; status: string; automationGenerated: boolean; createdAt: string;
}
interface Lead {
  status: string; collectedInfo: Record<string, string> | null;
}

function formatCustomerId(phone: string): string {
  if (phone.endsWith('@lid')) return `WhatsApp User (${phone.replace('@lid', '').slice(-6)})`;
  if (phone.endsWith('@newsletter')) return 'WhatsApp Channel';
  return phone;
}

export default function ClientConversations() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [reply, setReply] = useState('');
  const [editingDraft, setEditingDraft] = useState<{ id: string; content: string } | null>(null);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const { selected, toggle, toggleAll, clear } = useMultiSelect();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ['client-conversations'],
    queryFn: async () => (await api.get('/client/conversations')).data.data,
    refetchInterval: 5000,
  });

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setSelectedId(id);
  }, [searchParams]);

  const activeConversation = conversations?.find((c) => c.id === selectedId);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['client-conversations'] });
    queryClient.invalidateQueries({ queryKey: ['client-contacts'] });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/client/conversations/${id}`),
    onSuccess: (_res, id) => {
      setConfirmDeleteId(null);
      if (selectedId === id) setSelectedId(null);
      invalidateAll();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => api.post('/client/conversations/bulk-delete', { ids: Array.from(selected) }),
    onSuccess: () => {
      setConfirmBulkDelete(false);
      if (selectedId && selected.has(selectedId)) setSelectedId(null);
      clear();
      invalidateAll();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const { data: messages } = useQuery<Message[]>({
    queryKey: ['client-conversation-messages', selectedId],
    queryFn: async () => (await api.get(`/client/conversations/${selectedId}/messages`)).data.data,
    enabled: !!selectedId,
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages?.length]);

  const { data: lead } = useQuery<Lead | null>({
    queryKey: ['client-conversation-lead', selectedId],
    queryFn: async () => (await api.get(`/client/conversations/${selectedId}/lead`)).data.data,
    enabled: !!selectedId,
    refetchInterval: 8000,
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/client/conversations/${selectedId}/messages`, { content: reply }),
    onSuccess: () => {
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['client-conversation-messages', selectedId] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, editedContent }: { id: string; editedContent?: string }) =>
      api.post(`/client/conversations/messages/${id}/approve`, { editedContent }),
    onSuccess: () => {
      setEditingDraft(null);
      queryClient.invalidateQueries({ queryKey: ['client-conversation-messages', selectedId] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/client/conversations/messages/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-conversation-messages', selectedId] }),
  });

  function handleSend(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (reply.trim()) sendMutation.mutate();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            WhatsApp Live Chats
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time customer conversation streams, automated AI replies, and lead qualifications
          </p>
        </div>
        <Link
          to="/app/trash"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/60 px-3.5 py-1.5 text-xs font-semibold text-slate-600 backdrop-blur-md transition-all hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>View Trash</span>
        </Link>
      </div>

      {/* Bulk Action Banner */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-xs backdrop-blur-xl animate-glass-entrance">
          <span className="font-semibold text-brand-600 dark:text-brand-400">{selected.size} conversations selected</span>
          <div className="flex items-center gap-2">
            {confirmBulkDelete ? (
              <>
                <Button
                  variant="danger"
                  className="px-3 py-1 text-xs"
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => { setError(''); bulkDeleteMutation.mutate(); }}
                >
                  {bulkDeleteMutation.isPending ? 'Deleting...' : 'Confirm Bulk Delete'}
                </Button>
                <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setConfirmBulkDelete(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => setConfirmBulkDelete(true)}>
                  Delete Selected
                </Button>
                <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={clear}>
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Split Chat Master-Detail Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 min-h-[580px]">
        {/* Left Column: Conversations Thread List (Hidden on mobile if a conversation is open) */}
        <Card className={`p-4 flex flex-col justify-between ${selectedId ? 'hidden lg:flex lg:col-span-1' : 'flex col-span-1'}`}>
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-500" />
                Customer Threads ({conversations?.length ?? 0})
              </h2>
              {!!conversations?.length && (
                <label className="flex items-center gap-1.5 text-xs text-slate-400 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    checked={selected.size === conversations.length}
                    onChange={() => toggleAll(conversations.map((c) => c.id))}
                  />
                  Select all
                </label>
              )}
            </div>

            {isLoading ? (
              <Spinner />
            ) : (
              <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {conversations?.map((c) => (
                  <li
                    key={c.id}
                    className={`flex items-start gap-2.5 rounded-xl p-3 transition-all duration-300 cursor-pointer ${
                      selectedId === c.id
                        ? 'border border-brand-500/40 bg-brand-500/10 shadow-md shadow-brand-500/10'
                        : 'border border-transparent hover:bg-white/50 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    <div className="min-w-0 flex-1" onClick={() => setSelectedId(c.id)}>
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                          {c.customerName ?? formatCustomerId(c.customerPhone)}
                        </p>
                        <Badge tone={c.leadStatus === 'QUALIFIED' ? 'green' : 'blue'}>
                          {c.leadStatus}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                        {formatCustomerId(c.customerPhone)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  </li>
                ))}
                {conversations?.length === 0 && (
                  <li className="py-12 text-center text-xs text-slate-400">No customer chats found yet.</li>
                )}
              </ul>
            )}
          </div>
        </Card>

        {/* Right Column: Active Chat View (Full width on mobile when selected) */}
        <Card className={`p-4 sm:p-6 flex flex-col justify-between ${!selectedId ? 'hidden lg:flex lg:col-span-2' : 'flex col-span-1 lg:col-span-2'}`}>
          {!selectedId ? (
            <div className="flex h-full flex-col items-center justify-center py-24 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400 mb-3">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No Conversation Selected</p>
              <p className="text-xs text-slate-400 mt-1">Select a customer thread on the left to view message history and reply.</p>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-between">
              {/* Active Conversation Top Bar with Mobile Back Button */}
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setSelectedId(null)}
                    className="flex h-8 items-center gap-1 rounded-xl border border-slate-200/80 bg-white/60 px-2.5 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 lg:hidden"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    <span>Chats</span>
                  </button>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {activeConversation?.customerName ?? formatCustomerId(activeConversation?.customerPhone ?? '')}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {formatCustomerId(activeConversation?.customerPhone ?? '')}
                    </p>
                  </div>
                </div>
                {activeConversation && (
                  <Badge tone={activeConversation.leadStatus === 'QUALIFIED' ? 'green' : 'blue'}>
                    {activeConversation.leadStatus}
                  </Badge>
                )}
              </div>

              {/* Captured Lead Metadata Banner */}
              {lead?.collectedInfo && Object.keys(lead.collectedInfo).length > 0 && (
                <div className="mb-4 rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 text-xs dark:bg-white/[0.02] animate-glass-entrance">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-bold text-brand-700 dark:text-brand-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-brand-500" />
                      Captured Customer Attributes
                    </p>
                    <Badge tone={lead.status === 'QUALIFIED' ? 'green' : 'blue'}>{lead.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
                    {Object.entries(lead.collectedInfo).map(([key, value]) => (
                      <span key={key} className="inline-flex items-center gap-1">
                        <strong className="capitalize text-slate-700 dark:text-slate-200">{key}:</strong> {value}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Message Bubble Stream */}
              <div className="flex-1 space-y-3.5 overflow-y-auto max-h-[380px] sm:max-h-[440px] pr-2">
                {messages?.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'} animate-glass-entrance`}>
                    <div
                      className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-xs shadow-sm ${
                        m.direction === 'OUTBOUND'
                          ? m.status === 'QUEUED'
                            ? 'border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                            : 'bg-gradient-to-r from-brand-600 to-amber-500 text-white font-medium shadow-brand-500/20'
                          : 'bg-white/80 border border-slate-200/80 text-slate-800 backdrop-blur-md dark:bg-white/10 dark:border-white/10 dark:text-slate-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] opacity-75 font-mono">
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{m.automationGenerated ? '✨ AI Auto-Reply' : 'Staff Reply'}</span>
                      </div>

                      {/* Queued Draft Controls */}
                      {m.status === 'QUEUED' && (
                        <div className="mt-3 space-y-2 border-t border-amber-500/20 pt-2">
                          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Draft Awaiting Approval</p>
                          {editingDraft?.id === m.id ? (
                            <div className="space-y-2">
                              <Input
                                value={editingDraft.content}
                                onChange={(e) => setEditingDraft({ id: m.id, content: e.target.value })}
                                className="text-xs text-slate-900"
                              />
                              <div className="flex justify-end gap-2">
                                <Button className="px-3 py-1 text-xs" onClick={() => approveMutation.mutate({ id: m.id, editedContent: editingDraft.content })}>
                                  Confirm &amp; Send
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button className="px-2.5 py-1 text-xs" onClick={() => approveMutation.mutate({ id: m.id })}>
                                Approve &amp; Send
                              </Button>
                              <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setEditingDraft({ id: m.id, content: m.content })}>
                                Edit
                              </Button>
                              <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => rejectMutation.mutate(m.id)}>
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {(!messages || messages.length === 0) && (
                  <p className="py-12 text-center text-xs text-slate-400">No chat messages recorded in this thread.</p>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose Bar */}
              <form onSubmit={handleSend} className="mt-4 flex gap-2.5 border-t border-slate-100 pt-4 dark:border-white/5">
                <Input
                  placeholder="Type a message to reply..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className="flex-1 text-xs"
                />
                <Button type="submit" disabled={sendMutation.isPending} className="px-5 text-xs">
                  {sendMutation.isPending ? 'Sending...' : 'Send'}
                </Button>
              </form>
              <ErrorText>{error}</ErrorText>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}


