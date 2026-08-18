import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Badge, Card, Spinner } from '../../components/ui';

interface DigestItem { id: string; name?: string | null; phone?: string | null; businessName?: string; amount?: string | number }
interface Digest {
  ready: boolean;
  availableAt?: string;
  generatedAt?: string;
  newEnquiries?: { count: number; items: DigestItem[] };
  followUpNeeded?: { count: number; items: DigestItem[] };
  renewalsDueToday?: { count: number; items: DigestItem[] };
  renewalsDueSoon?: number;
  paymentsToday?: { count: number; total: string | number; items: DigestItem[] };
  newClientsToday?: { count: number; items: DigestItem[] };
  pendingDraftsAcrossClients?: number;
}

function DigestRow({ label, value, tone }: { label: string; value: number; tone: 'gray' | 'green' | 'red' | 'amber' | 'blue' }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/40 p-2.5 text-xs dark:bg-white/[0.02]">
      <span className="font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}

function DailyDigestCard() {
  const { data, isLoading } = useQuery<Digest>({
    queryKey: ['admin-digest'],
    queryFn: async () => (await api.get('/admin/dashboard/digest')).data.data,
  });

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-white/10">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-purple-500" />
          Today's Digest
        </h2>
        <Link to="/admin/settings" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
          Change time
        </Link>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : !data.ready ? (
        <p className="mt-3.5 py-6 text-center text-xs text-slate-400">
          Today's figures will be ready at <span className="font-semibold text-slate-600 dark:text-slate-300">{data.availableAt}</span>.
        </p>
      ) : (
        <div className="mt-3.5 space-y-2">
          <DigestRow label="New Enquiries Today" value={data.newEnquiries?.count ?? 0} tone="blue" />
          <DigestRow label="Needing Follow-up" value={data.followUpNeeded?.count ?? 0} tone="amber" />
          <DigestRow label="Renewals Due Today" value={data.renewalsDueToday?.count ?? 0} tone="red" />
          <DigestRow label="Renewals Due (7d)" value={data.renewalsDueSoon ?? 0} tone="amber" />
          <DigestRow label="New Clients Today" value={data.newClientsToday?.count ?? 0} tone="green" />
          <DigestRow label="Pending Drafts (all clients)" value={data.pendingDraftsAcrossClients ?? 0} tone="gray" />
          <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 p-2.5 text-xs">
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">Payments Today</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-300">
              {data.paymentsToday?.count ?? 0} · ₹{Number(data.paymentsToday?.total ?? 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

interface Stats {
  totalClients: number;
  activeClients: number;
  expiredClients: number;
  blockedClients: number;
  totalWhatsappAccounts: number;
  connectedWhatsappAccounts: number;
  monthlyRevenue: string | number;
  activeSubscriptions: number;
  upcomingRenewals: number;
  newEnquiries: number;
  recentActivations: { id: string; activatedAt: string; client: { businessName: string } }[];
  recentPayments: { id: string; amount: string; createdAt: string; client: { businessName: string } }[];
  recentEnquiries: { id: string; name: string; phone: string; createdAt: string }[];
}

function StatTile({
  label,
  value,
  icon,
  gradient,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  gradient: string;
}) {
  return (
    <Card hoverEffect className="flex flex-col justify-between p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-sm ${gradient}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3">
        <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{value}</p>
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ['admin-dashboard'],
    queryFn: async () => (await api.get('/admin/dashboard/stats')).data.data,
  });

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            System Overview
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time platform metrics, subscription status, and customer activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="green">System Live</Badge>
        </div>
      </div>

      {/* 10 Stat Tiles Grid */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Total Clients"
          value={data.totalClients}
          gradient="bg-gradient-to-tr from-brand-600 to-amber-500"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatTile
          label="Active Clients"
          value={data.activeClients}
          gradient="bg-gradient-to-tr from-emerald-600 to-teal-400"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatTile
          label="Expired Clients"
          value={data.expiredClients}
          gradient="bg-gradient-to-tr from-rose-600 to-red-400"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatTile
          label="Blocked Clients"
          value={data.blockedClients}
          gradient="bg-gradient-to-tr from-slate-600 to-slate-800"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
        <StatTile
          label="New Enquiries"
          value={data.newEnquiries}
          gradient="bg-gradient-to-tr from-sky-600 to-indigo-400"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          }
        />
        <StatTile
          label="WA Accounts"
          value={data.totalWhatsappAccounts}
          gradient="bg-gradient-to-tr from-purple-600 to-indigo-500"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatTile
          label="Connected Accts"
          value={data.connectedWhatsappAccounts}
          gradient="bg-gradient-to-tr from-emerald-600 to-green-500"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatTile
          label="Active Subs"
          value={data.activeSubscriptions}
          gradient="bg-gradient-to-tr from-blue-600 to-cyan-400"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          }
        />
        <StatTile
          label="Renewals (7d)"
          value={data.upcomingRenewals}
          gradient="bg-gradient-to-tr from-amber-600 to-yellow-400"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatTile
          label="Monthly Revenue"
          value={`₹${Number(data.monthlyRevenue).toLocaleString('en-IN')}`}
          gradient="bg-gradient-to-tr from-brand-600 via-orange-500 to-amber-400"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Activity Glass Panels Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <DailyDigestCard />

        {/* Recent Activations */}
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-white/10">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Recent Activations
            </h2>
            <Badge tone="green">{data.recentActivations.length}</Badge>
          </div>
          <ul className="mt-3.5 space-y-2.5">
            {data.recentActivations.length === 0 && (
              <li className="py-6 text-center text-xs text-slate-400">No recent activations.</li>
            )}
            {data.recentActivations.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-xl bg-white/40 p-2.5 text-xs transition-colors hover:bg-white/70 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
              >
                <span className="font-semibold text-slate-700 dark:text-slate-200 truncate pr-2">
                  {a.client.businessName}
                </span>
                <span className="shrink-0 text-slate-400 font-medium">
                  {new Date(a.activatedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Recent Payments */}
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-white/10">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              Recent Payments
            </h2>
            <Badge tone="amber">{data.recentPayments.length}</Badge>
          </div>
          <ul className="mt-3.5 space-y-2.5">
            {data.recentPayments.length === 0 && (
              <li className="py-6 text-center text-xs text-slate-400">No recent payments.</li>
            )}
            {data.recentPayments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white/40 p-2.5 text-xs transition-colors hover:bg-white/70 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
              >
                <span className="font-semibold text-slate-700 dark:text-slate-200 truncate pr-2">
                  {p.client.businessName}
                </span>
                <span className="shrink-0 font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{Number(p.amount).toLocaleString('en-IN')}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Recent Enquiries */}
        <Card className="p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-white/10">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                Recent Enquiries
              </h2>
              <Badge tone="blue">{data.recentEnquiries.length}</Badge>
            </div>
            <ul className="mt-3.5 space-y-2.5">
              {data.recentEnquiries.length === 0 && (
                <li className="py-6 text-center text-xs text-slate-400">No recent enquiries.</li>
              )}
              {data.recentEnquiries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded-xl bg-white/40 p-2.5 text-xs transition-colors hover:bg-white/70 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
                >
                  <span className="font-semibold text-slate-700 dark:text-slate-200 truncate pr-2">{e.name}</span>
                  <span className="shrink-0 text-slate-400 font-mono">{e.phone}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link
            to="/admin/enquiries"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-brand-500/20 bg-brand-500/10 py-2 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-500/20 dark:text-brand-400"
          >
            <span>View All Enquiries</span>
            <span>&rarr;</span>
          </Link>
        </Card>
      </div>
    </div>
  );
}

