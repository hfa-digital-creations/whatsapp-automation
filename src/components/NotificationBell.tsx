import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data.data,
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/60 text-slate-600 backdrop-blur-md transition-all duration-200 hover:border-brand-500/30 hover:bg-white/90 hover:text-brand-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-brand-500/30 dark:hover:bg-white/10 dark:hover:text-brand-400"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-600 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-900 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2.5 w-84 max-w-[92vw] overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/90 sm:w-96 animate-glass-entrance">
            <div className="flex items-center justify-between border-b border-slate-100 bg-white/40 px-4 py-3 dark:border-white/5 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-400">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <div className="max-h-96 divide-y divide-slate-100/80 overflow-y-auto dark:divide-white/5">
              {notifications?.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  <p>No notifications yet.</p>
                </div>
              )}
              {notifications?.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
                  className={`block w-full px-4 py-3.5 text-left text-sm transition-colors ${
                    n.isRead
                      ? 'opacity-60 hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                      : 'bg-brand-500/5 hover:bg-brand-500/10 dark:bg-brand-500/[0.04] dark:hover:bg-brand-500/[0.08]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{n.title}</p>
                    {!n.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-500/20" />}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{n.message}</p>
                  <p className="mt-1.5 text-[10px] font-medium text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

