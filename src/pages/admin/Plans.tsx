import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Pagination, Select, TabPanel, Tabs, Textarea } from '../../components/ui';
import { usePagination } from '../../lib/usePagination';

interface Feature { id: string; code: string; name: string; }
interface Plan {
  id: string; name: string; title: string; shortDescription?: string; fullDescription?: string; price: string; currency: string;
  durationValue: number; durationType: string; whatsappAccountLimit: number; additionalAccountPrice: string;
  status: string; displayOrder: number; planFeatures: { feature: Feature }[];
}

const EMPTY_FORM = {
  name: '', title: '', shortDescription: '', fullDescription: '', price: '', currency: 'INR',
  durationValue: '30', durationType: 'DAYS', whatsappAccountLimit: '1', additionalAccountPrice: '0',
  displayOrder: '0', featureCodes: [] as string[],
};

export default function AdminPlans() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['admin-plans'],
    queryFn: async () => (await api.get('/admin/plans')).data.data,
  });

  const { data: features } = useQuery<Feature[]>({
    queryKey: ['admin-features'],
    queryFn: async () => (await api.get('/admin/features')).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/plans', {
        ...form,
        price: Number(form.price),
        durationValue: Number(form.durationValue),
        whatsappAccountLimit: Number(form.whatsappAccountLimit),
        additionalAccountPrice: Number(form.additionalAccountPrice),
        displayOrder: Number(form.displayOrder),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      closeForm();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/admin/plans/${editingId}`, {
        ...form,
        price: Number(form.price),
        durationValue: Number(form.durationValue),
        whatsappAccountLimit: Number(form.whatsappAccountLimit),
        additionalAccountPrice: Number(form.additionalAccountPrice),
        displayOrder: Number(form.displayOrder),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      closeForm();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/admin/plans/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-plans'] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/plans/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-plans'] }),
  });

  /**
   * `plans` already comes back ordered by displayOrder (see PlansService.list), so it's
   * the source of truth for rank — swap the moved plan with its neighbor in that full,
   * unfiltered order, then re-save displayOrder as a clean 0..n-1 sequence for every plan
   * whose position actually changed. Recomputing the whole sequence (rather than just
   * swapping two raw values) also self-heals plans that were never given a distinct
   * displayOrder before this feature existed and are all sitting at the same value.
   */
  async function movePlan(planId: string, direction: 'up' | 'down') {
    if (!plans || reorderingId) return;
    const idx = plans.findIndex((p) => p.id === planId);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || targetIdx < 0 || targetIdx >= plans.length) return;

    const reordered = [...plans];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];

    setReorderingId(planId);
    setError('');
    try {
      await Promise.all(
        reordered
          .map((p, i) => ({ p, i }))
          .filter(({ p, i }) => p.displayOrder !== i)
          .map(({ p, i }) => api.patch(`/admin/plans/${p.id}`, { displayOrder: i })),
      );
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setReorderingId(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (editingId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  function toggleFeature(code: string) {
    setForm((f) => ({
      ...f,
      featureCodes: f.featureCodes.includes(code) ? f.featureCodes.filter((c) => c !== code) : [...f.featureCodes, code],
    }));
  }

  function closeForm() {
    setShowCreate(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      title: plan.title,
      shortDescription: plan.shortDescription ?? '',
      fullDescription: plan.fullDescription ?? '',
      price: String(plan.price),
      currency: plan.currency,
      durationValue: String(plan.durationValue),
      durationType: plan.durationType,
      whatsappAccountLimit: String(plan.whatsappAccountLimit),
      additionalAccountPrice: String(plan.additionalAccountPrice),
      displayOrder: String(plan.displayOrder),
      featureCodes: plan.planFeatures.map((pf) => pf.feature.code),
    });
    setShowCreate(true);
    setError('');
  }

  const filteredPlans = plans?.filter((p) => {
    if (activeFilter === 'ALL') return true;
    return p.status === activeFilter;
  });

  const { page, setPage, totalPages, pageItems } = usePagination(filteredPlans, 12);

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Subscription Plans
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure recurring pricing plans, duration limits, and bundled feature sets
          </p>
        </div>
        <Button onClick={() => (showCreate ? closeForm() : setShowCreate(true))} className="text-xs">
          {showCreate ? 'Close Plan Editor' : '+ Create New Plan'}
        </Button>
      </div>

      {/* Plan Creator / Editor Form */}
      {showCreate && (
        <Card className="p-6 animate-tab-content">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            {editingId ? 'Edit Plan' : 'Create New Plan'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Internal Name</label>
              <Input placeholder="e.g. pro_monthly" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Display Title</label>
              <Input placeholder="e.g. Pro Growth Plan" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Price (INR/Currency)</label>
              <Input placeholder="999" type="number" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Currency</label>
              <Input placeholder="INR" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Duration Value</label>
              <Input placeholder="30" type="number" required value={form.durationValue} onChange={(e) => setForm({ ...form, durationValue: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Duration Period</label>
              <Select value={form.durationType} onChange={(e) => setForm({ ...form, durationType: e.target.value })}>
                <option value="DAYS">Days</option>
                <option value="MONTHS">Months</option>
                <option value="YEARS">Years</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">WhatsApp Limit</label>
              <Input placeholder="1" type="number" required value={form.whatsappAccountLimit} onChange={(e) => setForm({ ...form, whatsappAccountLimit: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Addon Account Price</label>
              <Input placeholder="299" type="number" value={form.additionalAccountPrice} onChange={(e) => setForm({ ...form, additionalAccountPrice: e.target.value })} />
            </div>
            <div className="col-span-full">
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Short Description</label>
              <Input placeholder="Perfect for small businesses scaling customer interactions" value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} />
            </div>
            <div className="col-span-full">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Bundled Features</label>
              <div className="flex flex-wrap gap-2">
                {features?.map((f) => {
                  const active = form.featureCodes.includes(f.code);
                  return (
                    <button
                      type="button"
                      key={f.code}
                      onClick={() => toggleFeature(f.code)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                        active
                          ? 'border-brand-500 bg-brand-500/15 text-brand-600 dark:text-brand-400 font-semibold shadow-sm'
                          : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                      }`}
                    >
                      {active ? '✓ ' : '+ '}
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-full flex items-center gap-3 pt-2">
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="text-xs">
                {editingId
                  ? updateMutation.isPending
                    ? 'Saving Changes...'
                    : 'Save Changes'
                  : createMutation.isPending
                    ? 'Publishing Plan...'
                    : 'Save & Publish Plan'}
              </Button>
              {editingId && (
                <Button type="button" variant="secondary" className="text-xs" onClick={closeForm}>
                  Cancel
                </Button>
              )}
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>
      )}

      {/* Smooth Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          tabs={[
            { id: 'ALL', label: 'All Plans', count: plans?.length ?? 0 },
            { id: 'ACTIVE', label: 'Active', count: plans?.filter((p) => p.status === 'ACTIVE').length ?? 0 },
            { id: 'INACTIVE', label: 'Inactive / Drafts', count: plans?.filter((p) => p.status === 'INACTIVE').length ?? 0 },
          ]}
          activeTab={activeFilter}
          onChange={(f) => { setActiveFilter(f as any); setPage(1); }}
        />
      </div>

      {activeFilter !== 'ALL' && (
        <p className="text-[11px] text-slate-400">Switch to "All Plans" to reorder — reordering compares against the full plan list.</p>
      )}

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-tab-content">
        {pageItems.map((plan) => {
          const rank = plans?.findIndex((p) => p.id === plan.id) ?? -1;
          const isFirst = rank <= 0;
          const isLast = rank === (plans?.length ?? 0) - 1;
          return (
          <Card key={plan.id} hoverEffect className="flex flex-col justify-between p-6">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.title}</h3>
                  <p className="text-xs font-mono text-slate-400">{plan.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {activeFilter === 'ALL' && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        title="Move up"
                        aria-label="Move up"
                        disabled={isFirst || reorderingId !== null}
                        onClick={() => movePlan(plan.id, 'up')}
                        className="rounded-md px-1 text-xs text-slate-400 hover:text-brand-600 disabled:opacity-25 disabled:hover:text-slate-400 dark:hover:text-brand-400"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        aria-label="Move down"
                        disabled={isLast || reorderingId !== null}
                        onClick={() => movePlan(plan.id, 'down')}
                        className="rounded-md px-1 text-xs text-slate-400 hover:text-brand-600 disabled:opacity-25 disabled:hover:text-slate-400 dark:hover:text-brand-400"
                      >
                        ▼
                      </button>
                    </div>
                  )}
                  <Badge tone={plan.status === 'ACTIVE' ? 'green' : 'gray'}>{plan.status}</Badge>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{plan.shortDescription || 'No description'}</p>

              <div className="mt-4 mb-2">
                <span className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-brand-600 to-amber-500 bg-clip-text text-transparent">
                  {plan.currency === 'INR' ? '₹' : plan.currency + ' '}{Number(plan.price).toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-slate-400 ml-1.5 font-medium">/ {plan.durationValue} {plan.durationType.toLowerCase()}</span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Includes <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.whatsappAccountLimit} WhatsApp account(s)</span>
              </p>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {plan.planFeatures.map((pf) => (
                  <span key={pf.feature.code} className="rounded-lg bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {pf.feature.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
              <Button variant="secondary" className="text-xs px-3" onClick={() => startEdit(plan)}>
                Edit
              </Button>
              {plan.status === 'ACTIVE' ? (
                <Button variant="secondary" className="flex-1 text-xs" onClick={() => statusMutation.mutate({ id: plan.id, status: 'INACTIVE' })}>
                  Deactivate
                </Button>
              ) : (
                <Button variant="secondary" className="flex-1 text-xs" onClick={() => statusMutation.mutate({ id: plan.id, status: 'ACTIVE' })}>
                  Activate
                </Button>
              )}
              <Button variant="danger" className="text-xs px-3" onClick={() => archiveMutation.mutate(plan.id)}>
                Delete
              </Button>
            </div>
          </Card>
          );
        })}
        {filteredPlans?.length === 0 && (
          <div className="col-span-full py-12 text-center text-xs text-slate-400">
            No subscription plans found matching the selected filter.
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
