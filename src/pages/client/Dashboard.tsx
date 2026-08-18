import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Badge, Card, Spinner } from '../../components/ui';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'amber' | 'blue'> = {
  ACTIVE: 'green', EXPIRING_SOON: 'amber', EXPIRED: 'red', NOT_ACTIVATED: 'gray',
};

interface ClientDigest {
  ready: boolean;
  availableAt?: string;
  newConversationsToday?: { count: number };
  newLeadsToday?: number;
  followUpNeeded?: { count: number; items: { id: string; name: string | null; phone: string | null }[] };
  messagesToday?: number;
  pendingDrafts?: number;
  quotationsToday?: number;
  renewalDueSoon?: { dueOn: string } | null;
}

function DigestStat({ label, value, tone }: { label: string; value: number; tone: 'gray' | 'green' | 'red' | 'amber' | 'blue' }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/40 p-2.5 text-xs dark:bg-white/[0.02]">
      <span className="font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}

function ClientDailyDigestCard() {
  const { data, isLoading } = useQuery<ClientDigest>({
    queryKey: ['client-digest'],
    queryFn: async () => (await api.get('/client/dashboard/digest')).data.data,
  });

  return (
    <Card className="p-6">
      <h2 className="mb-3.5 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-200/60 pb-3 dark:border-white/10">
        <span className="h-2 w-2 rounded-full bg-purple-500" />
        Today's Digest
      </h2>

      {isLoading || !data ? (
        <Spinner />
      ) : !data.ready ? (
        <p className="py-6 text-center text-xs text-slate-400">
          Today's figures will be ready at <span className="font-semibold text-slate-600 dark:text-slate-300">{data.availableAt}</span>.
        </p>
      ) : (
        <div className="space-y-2">
          <DigestStat label="New Conversations Today" value={data.newConversationsToday?.count ?? 0} tone="blue" />
          <DigestStat label="New Leads Today" value={data.newLeadsToday ?? 0} tone="green" />
          <DigestStat label="Needing Follow-up" value={data.followUpNeeded?.count ?? 0} tone="amber" />
          <DigestStat label="Messages Today" value={data.messagesToday ?? 0} tone="gray" />
          <DigestStat label="Drafts Awaiting Approval" value={data.pendingDrafts ?? 0} tone="amber" />
          <DigestStat label="Quotations Today" value={data.quotationsToday ?? 0} tone="blue" />
          {data.renewalDueSoon && (
            <div className="flex items-center justify-between rounded-xl bg-rose-500/10 p-2.5 text-xs">
              <span className="font-semibold text-rose-700 dark:text-rose-300">Your Renewal Is Due</span>
              <span className="font-bold text-rose-700 dark:text-rose-300">{new Date(data.renewalDueSoon.dueOn).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ClientDashboard() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['client-profile'],
    queryFn: async () => (await api.get('/client/profile')).data.data,
  });

  const { data: accounts } = useQuery<any[]>({
    queryKey: ['client-whatsapp-accounts'],
    queryFn: async () => (await api.get('/client/whatsapp/accounts')).data.data,
  });

  const { data: limitData } = useQuery<{ limit: number }>({
    queryKey: ['client-whatsapp-limit'],
    queryFn: async () => (await api.get('/client/whatsapp/limit')).data.data,
  });

  const { data: features } = useQuery<Record<string, boolean>>({
    queryKey: ['client-features'],
    queryFn: async () => (await api.get('/client/features')).data.data,
  });

  if (isLoading || !profile) return <Spinner />;

  const connected = accounts?.filter((a) => a.status === 'CONNECTED').length ?? 0;

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Workspace Welcome Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {profile.businessName || 'Business Owner'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Monitor your WhatsApp AI automation, active chats, and connected phone lines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[profile.subscriptionStatus] ?? 'gray'}>
            {profile.subscriptionStatus.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* Subscription Expired Alert */}
      {profile.subscriptionStatus === 'EXPIRED' && (
        <Card className="border-rose-500/30 bg-rose-500/10 p-5 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-bold text-rose-700 dark:text-rose-300">Your Subscription Has Expired</p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                Renew your plan from the Settings page to continue auto-responding to customers.
              </p>
            </div>
            <Link
              to="/app/settings"
              className="shrink-0 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors"
            >
              Renew Now
            </Link>
          </div>
        </Card>
      )}

      {/* 4 Stat Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active Plan */}
        <Card hoverEffect className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Plan</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-amber-400 text-white shadow-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xl font-extrabold text-slate-900 dark:text-white truncate">
              {profile.plan?.title ?? 'No Plan Assigned'}
            </p>
            <div className="mt-1">
              <Badge tone={STATUS_TONE[profile.subscriptionStatus] ?? 'gray'}>
                {profile.subscriptionStatus.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Remaining Days */}
        <Card hoverEffect className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Days Remaining</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-400 text-white shadow-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {profile.remainingDays !== null ? `${profile.remainingDays} days` : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Automatic renewal alert</p>
          </div>
        </Card>

        {/* WhatsApp Accounts */}
        <Card hoverEffect className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Connected Lines</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {connected} <span className="text-base text-slate-400 font-normal">/ {limitData?.limit ?? '—'}</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">Active phone sockets</p>
            </div>
            <Link to="/app/whatsapp" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
              Manage &rarr;
            </Link>
          </div>
        </Card>

        {/* Automation Mode */}
        <Card hoverEffect className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">AI Response Mode</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white shadow-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-base font-bold text-slate-900 dark:text-white">
              {profile.automationMode === 'FULL_AUTONOMOUS' ? 'Full Autonomous' : 'Draft & Approve'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {profile.automationMode === 'FULL_AUTONOMOUS' ? 'AI sends replies immediately' : 'Staff reviews drafts'}
            </p>
          </div>
        </Card>
      </div>

      {features?.['DAILY_DIGEST'] && <ClientDailyDigestCard />}

      {/* Feature Navigation Glass Hub */}
      <Card className="p-6">
        <h2 className="mb-2 text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
          AI Training &amp; Operational Hub
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl mb-6">
          Equip your AI assistant with custom business knowledge, upload catalog documents, generate automated customer quotations, and monitor live WhatsApp conversation transcripts.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to="/app/training"
            className="group rounded-2xl border border-slate-200/60 bg-white/40 p-4 transition-all duration-300 hover:border-brand-500/40 hover:bg-white/80 hover:shadow-lg dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 transition-transform group-hover:scale-110 dark:text-brand-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-brand-600 dark:group-hover:text-brand-400">
              Business Training Knowledge
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Manage FAQ documents, products, and operational rules.
            </p>
          </Link>

          <Link
            to="/app/conversations"
            className="group rounded-2xl border border-slate-200/60 bg-white/40 p-4 transition-all duration-300 hover:border-brand-500/40 hover:bg-white/80 hover:shadow-lg dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 transition-transform group-hover:scale-110 dark:text-emerald-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
              Live Conversations
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              View real-time customer WhatsApp chat threads and AI responses.
            </p>
          </Link>

          <Link
            to="/app/quotations"
            className="group rounded-2xl border border-slate-200/60 bg-white/40 p-4 transition-all duration-300 hover:border-brand-500/40 hover:bg-white/80 hover:shadow-lg dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 transition-transform group-hover:scale-110 dark:text-sky-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-sky-600 dark:group-hover:text-sky-400">
              Automated Quotations
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Review price quotes automatically calculated and sent by AI.
            </p>
          </Link>
        </div>
      </Card>
    </div>
  );
}

