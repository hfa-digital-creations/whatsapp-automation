import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Select, Spinner } from '../../components/ui';

interface StaffUser {
  id: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'amber'> = {
  PENDING: 'gray', ACTIVE: 'green', BLOCKED: 'red', EXPIRED: 'amber', DELETED: 'gray',
};

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: '', phone: '', role: 'ADMIN' });
  const [error, setError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; temporaryPassword?: string } | null>(null);

  const { data, isLoading } = useQuery<{ items: StaffUser[]; total: number }>({
    queryKey: ['admin-staff-users'],
    queryFn: async () => (await api.get('/admin/users', { params: { role: 'ADMIN' } })).data.data,
  });

  const { data: superAdmins } = useQuery<{ items: StaffUser[] }>({
    queryKey: ['admin-super-admin-users'],
    queryFn: async () => (await api.get('/admin/users', { params: { role: 'SUPER_ADMIN' } })).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/users', form),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-staff-users'] });
      setCreatedCredentials({ email: form.email, temporaryPassword: res.data.data.temporaryPassword });
      setForm({ email: '', phone: '', role: 'ADMIN' });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'block' | 'unblock' | 'delete' }) =>
      api.patch(`/admin/users/${id}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-staff-users'] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (target: { id: string; email: string }) => api.post(`/admin/users/${target.id}/reset-password`),
    onSuccess: (res, target) => {
      setCreatedCredentials({ email: target.email, temporaryPassword: res.data.data.temporaryPassword });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCreatedCredentials(null);
    createMutation.mutate();
  }

  const allStaff = [...(superAdmins?.items ?? []), ...(data?.items ?? [])];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Platform Staff &amp; Administrators
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage system administrator credentials, roles, and administrative access permissions
        </p>
      </div>

      {/* Creation Card */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-500" />
          Add Administrator Account
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Staff Email</label>
            <Input type="email" placeholder="admin@domain.com" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Phone (Optional)</label>
            <Input placeholder="+919876543210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Admin Role</label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="ADMIN">Administrator</option>
              <option value="SUPER_ADMIN">Super Administrator</option>
            </Select>
          </div>
          <div className="col-span-full flex items-center gap-3 pt-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Admin Account'}
            </Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>

        {createdCredentials && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs dark:bg-emerald-950/30">
            <p className="font-bold text-emerald-700 dark:text-emerald-300 mb-1">
              Account Successfully Created for {createdCredentials.email}
            </p>
            {createdCredentials.temporaryPassword && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-slate-600 dark:text-slate-300">Temporary Password:</span>
                <span className="font-mono font-bold text-emerald-800 dark:text-emerald-200 bg-white/60 dark:bg-white/10 px-2 py-0.5 rounded border border-emerald-500/20 select-all">
                  {createdCredentials.temporaryPassword}
                </span>
                <span className="text-[11px] text-slate-400">(Save this now; it cannot be retrieved later)</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Staff Table Card */}
      <Card className="p-6">
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="py-3 pr-4">Admin Email</th>
                  <th className="py-3 pr-4">Phone</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Last Login</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {allStaff.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3.5 pr-4 font-semibold text-slate-800 dark:text-slate-100">{u.email}</td>
                    <td className="py-3.5 pr-4 text-xs font-mono text-slate-500 dark:text-slate-400">{u.phone ?? '—'}</td>
                    <td className="py-3.5 pr-4">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-lg border border-brand-500/20">
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge tone={STATUS_TONE[u.status] ?? 'gray'}>{u.status}</Badge>
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-slate-500 dark:text-slate-400">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="py-3.5 text-right">
                      {u.role !== 'SUPER_ADMIN' && (
                        <div className="flex items-center justify-end gap-1.5">
                          {u.status === 'BLOCKED' ? (
                            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => statusMutation.mutate({ id: u.id, action: 'unblock' })}>
                              Unblock
                            </Button>
                          ) : (
                            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => statusMutation.mutate({ id: u.id, action: 'block' })}>
                              Block
                            </Button>
                          )}
                          <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => statusMutation.mutate({ id: u.id, action: 'delete' })}>
                            Delete
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-2.5 py-1 text-xs"
                            onClick={() => { setError(''); resetPasswordMutation.mutate({ id: u.id, email: u.email }); }}
                          >
                            Reset Password
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {allStaff.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                      No admin accounts found.
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

