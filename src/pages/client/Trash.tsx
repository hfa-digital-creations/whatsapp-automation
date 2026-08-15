import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { useMultiSelect } from '../../lib/useMultiSelect';
import { Button, Card, ErrorText, Spinner } from '../../components/ui';

interface TrashedContact {
  conversationId: string;
  customerPhone: string;
  customerName: string | null;
  lastMessageAt: string | null;
  deletedAt: string;
}

function formatCustomerId(phone: string): string {
  if (phone.endsWith('@lid')) return `WhatsApp Contact (${phone.replace('@lid', '').slice(-6)})`;
  if (phone.endsWith('@newsletter')) return 'WhatsApp Channel';
  return phone;
}

export default function ClientTrash() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const { selected, toggle, toggleAll, clear } = useMultiSelect();

  const { data: trashed, isLoading } = useQuery<TrashedContact[]>({
    queryKey: ['client-trash'],
    queryFn: async () => (await api.get('/client/conversations/trash')).data.data,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['client-trash'] });
    queryClient.invalidateQueries({ queryKey: ['client-contacts'] });
    queryClient.invalidateQueries({ queryKey: ['client-conversations'] });
  }

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/client/conversations/${id}/restore`),
    onSuccess: invalidateAll,
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/client/conversations/${id}/permanent`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      invalidateAll();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const bulkRestoreMutation = useMutation({
    mutationFn: () => api.post('/client/conversations/bulk-restore', { ids: Array.from(selected) }),
    onSuccess: () => {
      clear();
      invalidateAll();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const bulkPermanentDeleteMutation = useMutation({
    mutationFn: () => api.post('/client/conversations/bulk-permanent-delete', { ids: Array.from(selected) }),
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
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Recycle Bin &amp; Deleted Contacts
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Archived chat logs remain recoverable here until permanently removed. Deletion does not affect the customer's phone or active device sockets.
        </p>
      </div>

      <ErrorText>{error}</ErrorText>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-xs backdrop-blur-xl">
          <span className="font-semibold text-brand-600 dark:text-brand-400">{selected.size} items selected</span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              disabled={bulkRestoreMutation.isPending}
              onClick={() => { setError(''); bulkRestoreMutation.mutate(); }}
            >
              {bulkRestoreMutation.isPending ? 'Restoring...' : 'Restore Selected'}
            </Button>
            {confirmBulkDelete ? (
              <>
                <Button
                  variant="danger"
                  className="px-3 py-1 text-xs"
                  disabled={bulkPermanentDeleteMutation.isPending}
                  onClick={() => { setError(''); bulkPermanentDeleteMutation.mutate(); }}
                >
                  {bulkPermanentDeleteMutation.isPending ? 'Deleting...' : 'Confirm Permanent Delete'}
                </Button>
                <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setConfirmBulkDelete(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => setConfirmBulkDelete(true)}>
                  Delete Permanently
                </Button>
                <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={clear}>
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Trash Table */}
      <Card className="p-6">
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="glass-table-container animate-tab-content">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="py-3 pr-2 w-8">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={!!trashed?.length && selected.size === trashed.length}
                      onChange={() => toggleAll(trashed?.map((t) => t.conversationId) ?? [])}
                    />
                  </th>
                  <th className="py-3 pr-4">Contact</th>
                  <th className="py-3 pr-4">Last Activity</th>
                  <th className="py-3 pr-4">Deleted At</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {trashed?.map((t) => (
                  <tr key={t.conversationId} className="align-top">
                    <td className="py-3.5 pr-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 mt-1"
                        checked={selected.has(t.conversationId)}
                        onChange={() => toggle(t.conversationId)}
                      />
                    </td>
                    <td className="py-3.5 pr-4">
                      <p className="font-bold text-slate-800 dark:text-slate-100">{t.customerName ?? formatCustomerId(t.customerPhone)}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{formatCustomerId(t.customerPhone)}</p>
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-slate-400 font-medium">
                      {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-slate-400 font-medium">
                      {new Date(t.deletedAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          className="px-2.5 py-1 text-xs"
                          disabled={restoreMutation.isPending}
                          onClick={() => { setError(''); restoreMutation.mutate(t.conversationId); }}
                        >
                          Restore
                        </Button>
                        {confirmDeleteId === t.conversationId ? (
                          <>
                            <Button
                              variant="danger"
                              className="px-2.5 py-1 text-xs"
                              disabled={permanentDeleteMutation.isPending}
                              onClick={() => { setError(''); permanentDeleteMutation.mutate(t.conversationId); }}
                            >
                              {permanentDeleteMutation.isPending ? 'Deleting...' : 'Confirm'}
                            </Button>
                            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setConfirmDeleteId(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" className="px-2 py-1 text-xs text-rose-500 hover:text-rose-600" onClick={() => setConfirmDeleteId(t.conversationId)}>
                            Delete Forever
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {trashed?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                      Trash bin is empty.
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

