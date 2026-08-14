import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { useMultiSelect } from '../../lib/useMultiSelect';
import { Badge, Button, Card, ErrorText, Spinner } from '../../components/ui';

interface Contact {
  conversationId: string;
  customerPhone: string;
  customerName: string | null;
  leadStatus: string;
  lastMessageAt: string | null;
  collectedInfo: Record<string, string> | null;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  company: 'Company',
  email: 'Email',
  participationType: 'Participation',
  category: 'Category',
  stallSize: 'Stall Size',
  previousParticipant: 'Exhibited Before',
  serviceRequired: 'Interested In',
  location: 'Location',
  budget: 'Budget',
  preferredDate: 'Preferred Date',
  quantity: 'Quantity',
  notes: 'Notes',
};

function formatCustomerId(phone: string): string {
  if (phone.endsWith('@lid')) return `WhatsApp Contact (${phone.replace('@lid', '').slice(-6)})`;
  if (phone.endsWith('@newsletter')) return 'WhatsApp Channel';
  return phone;
}

export default function ClientContacts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const { selected, toggle, toggleAll, clear } = useMultiSelect();

  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['client-contacts'],
    queryFn: async () => (await api.get('/client/contacts')).data.data,
    refetchInterval: 6000,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['client-contacts'] });
    queryClient.invalidateQueries({ queryKey: ['client-conversations'] });
  }

  const deleteMutation = useMutation({
    mutationFn: (conversationId: string) => api.delete(`/client/conversations/${conversationId}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      invalidateAll();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => api.post('/client/conversations/bulk-delete', { ids: Array.from(selected) }),
    onSuccess: () => {
      setConfirmBulkDelete(false);
      clear();
      invalidateAll();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Captured Customer Contacts
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Searchable CRM directory of every customer who messaged your WhatsApp numbers, including AI extracted data
          </p>
        </div>
        <Link
          to="/app/trash"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/60 px-3.5 py-1.5 text-xs font-semibold text-slate-600 backdrop-blur-md transition-colors hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>Trash</span>
        </Link>
      </div>

      <ErrorText>{error}</ErrorText>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-xs backdrop-blur-xl">
          <span className="font-semibold text-brand-600 dark:text-brand-400">{selected.size} contacts selected</span>
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

      {/* Table Card */}
      <Card className="p-6">
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="py-3 pr-2 w-8">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={!!contacts?.length && selected.size === contacts.length}
                      onChange={() => toggleAll(contacts?.map((c) => c.conversationId) ?? [])}
                    />
                  </th>
                  <th className="py-3 pr-4">Contact</th>
                  <th className="py-3 pr-4">Lead Status</th>
                  <th className="py-3 pr-4">Captured Details</th>
                  <th className="py-3 pr-4">Last Message</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {contacts?.map((c) => (
                  <tr key={c.conversationId} className="align-top">
                    <td className="py-3.5 pr-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 mt-1"
                        checked={selected.has(c.conversationId)}
                        onChange={() => toggle(c.conversationId)}
                      />
                    </td>
                    <td className="py-3.5 pr-4">
                      <p className="font-bold text-slate-800 dark:text-slate-100">{c.customerName ?? formatCustomerId(c.customerPhone)}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{formatCustomerId(c.customerPhone)}</p>
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge tone={c.leadStatus === 'QUALIFIED' ? 'green' : 'blue'}>{c.leadStatus}</Badge>
                    </td>
                    <td className="py-3.5 pr-4 max-w-md">
                      {c.collectedInfo && Object.keys(c.collectedInfo).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(c.collectedInfo).map(([key, value]) => (
                            <span key={key} className="rounded-lg bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                              <strong className="text-slate-900 dark:text-white">{FIELD_LABELS[key] ?? key}:</strong> {value}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No details captured yet</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-slate-400 font-medium">
                      {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          className="px-2.5 py-1 text-xs"
                          onClick={() => navigate(`/app/conversations?id=${c.conversationId}`)}
                        >
                          Open Chat &rarr;
                        </Button>
                        {confirmDeleteId === c.conversationId ? (
                          <>
                            <Button
                              variant="danger"
                              className="px-2.5 py-1 text-xs"
                              disabled={deleteMutation.isPending}
                              onClick={() => { setError(''); deleteMutation.mutate(c.conversationId); }}
                            >
                              {deleteMutation.isPending ? 'Deleting...' : 'Confirm'}
                            </Button>
                            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setConfirmDeleteId(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" className="px-2 py-1 text-xs text-rose-500 hover:text-rose-600" onClick={() => setConfirmDeleteId(c.conversationId)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {contacts?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                      No contacts recorded yet — contacts populate automatically as customers message your lines.
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

