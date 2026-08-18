import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Button, Card, ErrorText, Input, Pagination, Spinner } from '../../components/ui';
import { usePagination } from '../../lib/usePagination';

interface Feature { id: string; code: string; name: string; description?: string; }

export default function AdminFeatures() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: features, isLoading } = useQuery<Feature[]>({
    queryKey: ['admin-features'],
    queryFn: async () => (await api.get('/admin/features')).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/features', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-features'] });
      setForm({ code: '', name: '', description: '' });
      setShowCreate(false);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/features/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-features'] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    createMutation.mutate();
  }

  const { page, setPage, totalPages, pageItems } = usePagination(features, 15);

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            System Feature Registry
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Define core capabilities and permission flags attachable to plans and client accounts
          </p>
        </div>
        <Button onClick={() => setShowCreate((s) => !s)} className="text-xs">
          {showCreate ? 'Close Form' : '+ Register Feature'}
        </Button>
      </div>

      {/* Feature Creator */}
      {showCreate && (
        <Card className="p-6 animate-tab-content">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            Register New Feature
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Feature Code</label>
              <Input placeholder="e.g. AUTO_QUOTATION" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Display Name</label>
              <Input placeholder="e.g. Automated Quotations" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Description</label>
              <Input placeholder="Allows AI to generate instant quotation PDFs" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="col-span-full flex items-center gap-3 pt-2">
              <Button type="submit" disabled={createMutation.isPending} className="text-xs">
                {createMutation.isPending ? 'Registering...' : 'Register Feature'}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>
      )}

      {/* Feature List */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-purple-500" />
          Registered Capabilities ({features?.length ?? 0})
        </h2>
        {isLoading ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {pageItems.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-3.5 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{f.name}</p>
                    <span className="font-mono text-[10px] bg-slate-500/10 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-500/10">
                      {f.code}
                    </span>
                  </div>
                  {f.description && <p className="mt-1 text-slate-400">{f.description}</p>}
                </div>
                <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => deleteMutation.mutate(f.id)}>
                  Delete
                </Button>
              </li>
            ))}
            {features?.length === 0 && <li className="py-8 text-center text-xs text-slate-400">No features registered yet.</li>}
          </ul>
        )}

        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="mt-4" />
      </Card>
    </div>
  );
}


