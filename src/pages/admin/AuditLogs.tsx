import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card, Pagination, Spinner } from '../../components/ui';
import { usePagination } from '../../lib/usePagination';

interface LogEntry {
  id: string; action: string; targetType: string | null; targetId: string | null;
  createdAt: string; admin: { email: string };
}

export default function AdminAuditLogs() {
  const { data: logs, isLoading } = useQuery<LogEntry[]>({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => (await api.get('/admin/audit-logs')).data.data,
  });

  const { page, setPage, totalPages, pageItems } = usePagination(logs, 20);

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Security &amp; Audit Trail
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Immutable event log of administrative actions, status toggles, and tenant modifications
        </p>
      </div>

      <Card className="p-6">
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="glass-table-container animate-tab-content">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="py-3 pr-4">Timestamp</th>
                  <th className="py-3 pr-4">Operator</th>
                  <th className="py-3 pr-4">Executed Action</th>
                  <th className="py-3 text-right">Target Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {pageItems.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3.5 pr-4 text-xs font-mono text-slate-500 dark:text-slate-400">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 pr-4 font-semibold text-slate-800 dark:text-slate-100 text-xs">
                      {l.admin.email}
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-500/10 px-2.5 py-1 rounded-lg border border-slate-500/10">
                        {l.action}
                      </span>
                    </td>
                    <td className="py-3.5 text-right text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {l.targetType} {l.targetId ? `(${l.targetId.slice(0, 8)}...)` : ''}
                    </td>
                  </tr>
                ))}
                {logs?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-sm text-slate-400">
                      No security audit events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="mt-5" />
      </Card>
    </div>
  );
}

