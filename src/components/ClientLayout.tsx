import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/api';
import { Button } from './ui';
import { NotificationBell } from './NotificationBell';
import { ParticlesBackground } from './ParticlesBackground';

const NAV = [
  {
    to: '/app',
    label: 'Dashboard',
    end: true,
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/app/whatsapp',
    label: 'WhatsApp Accounts',
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    to: '/app/training',
    label: 'Business Training',
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    to: '/app/conversations',
    label: 'Conversations',
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    to: '/app/contacts',
    label: 'Contacts',
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    to: '/app/offers',
    label: 'Promotional Campaigns',
    feature: 'OFFER_MESSAGES',
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    to: '/app/trash',
    label: 'Trash',
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
  },
  {
    to: '/app/quotations',
    label: 'Quotations',
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </svg>
    ),
  },
  {
    to: '/app/settings',
    label: 'Settings',
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function ClientLayout() {
  const { auth, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const { data: branding } = useQuery({
    queryKey: ['client-branding'],
    queryFn: async () => (await api.get('/client/branding')).data.data,
  });

  const { data: profile } = useQuery({
    queryKey: ['client-profile'],
    queryFn: async () => (await api.get('/client/profile')).data.data,
  });

  const { data: features } = useQuery<Record<string, boolean>>({
    queryKey: ['client-features'],
    queryFn: async () => (await api.get('/client/features')).data.data,
  });

  const visibleNav = NAV.filter((item) => !item.feature || features?.[item.feature] === true);

  const primaryColor = branding?.primaryColor ?? '#F97316';

  return (
    <div className="relative min-h-screen bg-slate-100/80 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex overflow-x-hidden">
      {/* Ambient Animated Glow Mesh Blobs */}
      <div className="glass-bg-mesh">
        <div className="glass-blob-1" />
        <div className="glass-blob-2" />
        <div className="glass-blob-3" />
        <div className="glass-blob-4" />
      </div>

      {/* Interactive Particles Canvas */}
      <ParticlesBackground />

      {/* Desktop Frosted Glass Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col glass-sidebar z-30 md:flex md:sticky md:top-0 md:h-screen">
        <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-200/50 dark:border-white/5">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="h-8 w-8 rounded-xl object-cover shadow-sm ring-1 ring-white/20" />
          ) : (
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg transition-transform hover:scale-105 ring-2 ring-white/20"
              style={{ backgroundColor: primaryColor }}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z" />
              </svg>
            </div>
          )}
          <div>
            <div className="text-base font-extrabold tracking-tight truncate max-w-[130px] text-slate-900 dark:text-white">
              {profile?.businessName ?? 'Your Business'}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Workspace</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3.5 py-4">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group relative flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-r from-brand-600 via-orange-500 to-amber-500 text-white shadow-lg shadow-brand-500/25 border border-white/20'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white border border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    <span className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200'}`}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {isActive && (
                    <span className="flex h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200/50 p-4 dark:border-white/5">
          <div className="flex items-center gap-3 rounded-xl bg-white/40 p-2.5 dark:bg-white/[0.02] border border-slate-200/50 dark:border-white/5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {profile?.businessName?.charAt(0).toUpperCase() ?? 'B'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{auth?.email}</p>
              <p className="text-[10px] text-slate-400 font-medium">{profile?.plan?.title ?? 'Client'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Animated Sliding Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity duration-300"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex w-72 max-w-[85vw] flex-col glass-sidebar shadow-2xl animate-glass-entrance">
            <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200/50 dark:border-white/5">
              <div className="truncate text-base font-extrabold text-slate-800 dark:text-slate-100">
                {profile?.businessName ?? 'Client Panel'}
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-white/40 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
              {visibleNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-r from-brand-600 via-orange-500 to-amber-500 text-white shadow-md shadow-brand-500/25 border border-white/20'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10'
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-200/50 p-4 dark:border-white/5">
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{auth?.email}</p>
              <p className="text-[10px] text-slate-400 font-medium">{profile?.plan?.title ?? 'Client'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex min-h-screen flex-1 flex-col overflow-hidden">
        {/* Frosted Floating Header */}
        <header className="glass-header flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/60 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 md:hidden active:scale-95 transition-transform"
              aria-label="Open Mobile Menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{ backgroundColor: `${primaryColor}1A`, color: primaryColor }}
              >
                {profile?.businessName ?? 'Client Panel'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <NotificationBell />

            {/* Dark / Light Toggle */}
            <button
              onClick={toggle}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/60 text-slate-600 backdrop-blur-md transition-all duration-300 hover:border-brand-500/30 hover:bg-white/90 hover:text-brand-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-brand-500/30 dark:hover:bg-white/10 dark:hover:text-brand-400 active:scale-95"
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>

            {/* Logout Button */}
            <Button
              variant="secondary"
              onClick={() => logout()}
              className="text-xs px-3 py-2 min-h-[38px]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>

        {/* Content Viewport */}
        <main key={location.pathname} className="flex-1 p-3.5 sm:p-6 md:p-8 max-w-7xl w-full mx-auto animate-page-transition">
          <Outlet />
        </main>
      </div>
    </div>
  );
}



