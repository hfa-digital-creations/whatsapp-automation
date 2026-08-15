import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Select, Spinner, Tabs } from '../../components/ui';

interface Voucher {
  id: string; code: string; discountType: string; discountValue: string; maxUsage: number | null;
  perUserUsageLimit: number; expiryDate: string | null; minPurchaseAmount: string; status: string;
}

const EMPTY_FORM = {
  code: '', discountType: 'PERCENTAGE', discountValue: '', maxUsage: '', perUserUsageLimit: '1',
  startDate: '', expiryDate: '', minPurchaseAmount: '0',
};

export default function AdminVouchers() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const { data: vouchers, isLoading } = useQuery<Voucher[]>({
    queryKey: ['admin-vouchers'],
    queryFn: async () => (await api.get('/admin/vouchers')).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/vouchers', {
        code: form.code,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxUsage: form.maxUsage ? Number(form.maxUsage) : undefined,
        perUserUsageLimit: Number(form.perUserUsageLimit),
        startDate: form.startDate || undefined,
        expiryDate: form.expiryDate || undefined,
        minPurchaseAmount: Number(form.minPurchaseAmount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vouchers'] });
      setForm(EMPTY_FORM);
      setShowCreate(false);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/admin/vouchers/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-vouchers'] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    createMutation.mutate();
  }

  const filteredVouchers = vouchers?.filter((v) => {
    if (activeFilter === 'ALL') return true;
    return v.status === activeFilter;
  });

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Promotional Vouchers
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Generate and manage percentage and fixed discount coupons for subscription checkouts
          </p>
        </div>
        <Button onClick={() => setShowCreate((s) => !s)} className="text-xs">
          {showCreate ? 'Close Voucher Form' : '+ Create Voucher Code'}
        </Button>
      </div>

      {/* Glass Voucher Creator */}
      {showCreate && (
        <Card className="p-6 animate-tab-content">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            Create Promo Voucher
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Voucher Code</label>
              <Input placeholder="e.g. FESTIVE50" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Discount Type</label>
              <Select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₹)</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Discount Value</label>
              <Input placeholder="50" type="number" required value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Global Max Usages</label>
              <Input placeholder="100 (optional)" type="number" value={form.maxUsage} onChange={(e) => setForm({ ...form, maxUsage: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Per-User Usage Limit</label>
              <Input placeholder="1" type="number" required value={form.perUserUsageLimit} onChange={(e) => setForm({ ...form, perUserUsageLimit: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Expiry Date</label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Min Purchase Amount</label>
              <Input placeholder="0" type="number" value={form.minPurchaseAmount} onChange={(e) => setForm({ ...form, minPurchaseAmount: e.target.value })} />
            </div>
            <div className="col-span-full flex items-center gap-3 pt-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving...' : 'Save & Deploy Voucher'}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>
      )}

      {/* Smooth Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          tabs={[
            { id: 'ALL', label: 'All Vouchers', count: vouchers?.length ?? 0 },
            { id: 'ACTIVE', label: 'Active', count: vouchers?.filter((v) => v.status === 'ACTIVE').length ?? 0 },
            { id: 'INACTIVE', label: 'Inactive / Expired', count: vouchers?.filter((v) => v.status === 'INACTIVE').length ?? 0 },
          ]}
          activeTab={activeFilter}
          onChange={(f) => setActiveFilter(f as any)}
        />
      </div>

      {/* Vouchers Table */}
      <Card className="p-6">
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="glass-table-container animate-tab-content">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="py-3 pr-4">Code</th>
                  <th className="py-3 pr-4">Discount</th>
                  <th className="py-3 pr-4">Usage Limit</th>
                  <th className="py-3 pr-4">Expiry</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredVouchers?.map((v) => (
                  <tr key={v.id}>
                    <td className="py-3.5 pr-4">
                      <span className="font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-1 rounded-lg border border-brand-500/20">
                        {v.code}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 font-bold text-slate-800 dark:text-slate-100">
                      {v.discountType === 'PERCENTAGE' ? `${v.discountValue}%` : `₹${v.discountValue}`}
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-slate-500 dark:text-slate-400">
                      {v.maxUsage ? `${v.maxUsage} total` : 'Unlimited'} &middot; {v.perUserUsageLimit}/user
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-slate-500 dark:text-slate-400">
                      {v.expiryDate ? new Date(v.expiryDate).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge tone={v.status === 'ACTIVE' ? 'green' : 'gray'}>{v.status}</Badge>
                    </td>
                    <td className="py-3.5 text-right">
                      <Button
                        variant="secondary"
                        className="px-2.5 py-1 text-xs"
                        onClick={() => statusMutation.mutate({ id: v.id, status: v.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
                      >
                        {v.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredVouchers?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                      No vouchers found matching the selected filter.
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
