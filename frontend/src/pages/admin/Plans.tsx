import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Select, Textarea } from '../../components/ui';

interface Feature { id: string; code: string; name: string; }
interface Plan {
  id: string; name: string; title: string; shortDescription?: string; price: string; currency: string;
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
      setForm(EMPTY_FORM);
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    createMutation.mutate();
  }

  function toggleFeature(code: string) {
    setForm((f) => ({
      ...f,
      featureCodes: f.featureCodes.includes(code) ? f.featureCodes.filter((c) => c !== code) : [...f.featureCodes, code],
    }));
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Subscription Plans
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure recurring pricing plans, duration limits, and bundled feature sets
        </p>
      </div>

      {/* Glass Plan Creator */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-500" />
          Create New Plan
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
            <Textarea rows={2} placeholder="Brief summary of what this plan includes..." value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} />
          </div>

          <div className="col-span-full">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">Included Features</p>
            <div className="flex flex-wrap gap-2">
              {features?.map((f) => (
                <label
                  key={f.id}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                    form.featureCodes.includes(f.code)
                      ? 'border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'border-slate-200/80 bg-white/40 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400'
                  }`}
                >
                  <input type="checkbox" className="rounded text-brand-500 focus:ring-brand-500" checked={form.featureCodes.includes(f.code)} onChange={() => toggleFeature(f.code)} />
                  <span>{f.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="col-span-full flex items-center gap-3 pt-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Create Subscription Plan'}
            </Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      </Card>

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan) => (
          <Card key={plan.id} hoverEffect className="flex flex-col justify-between p-6">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.title}</h3>
                  <p className="text-xs font-mono text-slate-400">{plan.name}</p>
                </div>
                <Badge tone={plan.status === 'ACTIVE' ? 'green' : 'gray'}>{plan.status}</Badge>
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
        ))}
      </div>
    </div>
  );
}

