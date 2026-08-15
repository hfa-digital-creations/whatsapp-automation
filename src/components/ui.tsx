import {
  useState,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary:
      'glass-sheen bg-gradient-to-r from-brand-600 via-orange-500 to-amber-500 hover:from-brand-500 hover:via-orange-400 hover:to-amber-400 text-white shadow-lg shadow-brand-500/25 border border-white/30 hover:shadow-xl hover:shadow-brand-500/35 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0',
    secondary:
      'glass-sheen bg-white/75 dark:bg-white/10 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-white/15 hover:bg-white/95 dark:hover:bg-white/20 backdrop-blur-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:translate-y-0',
    danger:
      'glass-sheen bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-500/25 border border-red-400/30 hover:shadow-xl hover:shadow-red-500/35 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:translate-y-0',
    ghost:
      'text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 dark:hover:bg-brand-500/20 backdrop-blur-md border border-transparent hover:border-brand-500/20 active:scale-[0.98] disabled:opacity-50',
  }[variant];

  return (
    <button
      className={`inline-flex min-h-[38px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = '',
  hoverEffect = false,
}: {
  children: ReactNode;
  className?: string;
  hoverEffect?: boolean;
}) {
  return (
    <div
      className={`glass-card p-5 ${
        hoverEffect ? 'glass-card-interactive' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`glass-input min-h-[42px] ${props.className ?? ''}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`glass-input min-h-[90px] ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`glass-input min-h-[42px] ${props.className ?? ''}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{children}</label>;
}

export function Badge({
  children,
  tone = 'gray',
}: {
  children: ReactNode;
  tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'purple';
}) {
  const styles = {
    gray: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
    green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 shadow-sm shadow-emerald-500/10',
    red: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 shadow-sm shadow-rose-500/10',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 shadow-sm shadow-amber-500/10',
    blue: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 shadow-sm shadow-sky-500/10',
    purple: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 shadow-sm shadow-purple-500/10',
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold backdrop-blur-md transition-all ${styles}`}
    >
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="relative h-9 w-9">
        <div className="absolute inset-0 rounded-full border-2 border-brand-500/20" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-brand-500 border-t-transparent shadow-sm" />
      </div>
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/40 p-8 text-center backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.02]">
      {icon && <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>}
      <p className="font-bold text-slate-700 dark:text-slate-200">{title}</p>
      {description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 backdrop-blur-md animate-glass-entrance">
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  className = '',
}: {
  tabs: { id: T; label: string; icon?: ReactNode; count?: number | string }[];
  activeTab: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateIndicator = () => {
      const activeBtn = container.querySelector('[aria-selected="true"]') as HTMLElement;
      if (activeBtn) {
        setIndicatorStyle({
          left: activeBtn.offsetLeft,
          width: activeBtn.offsetWidth,
        });
      }
    };

    updateIndicator();

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(updateIndicator);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [activeTab, tabs]);

  return (
    <div
      ref={containerRef}
      className={`glass-tab-container relative ${className}`}
    >
      {/* Sliding Active Pill Background */}
      {indicatorStyle.width > 0 && (
        <div
          className="absolute top-1.5 bottom-1.5 rounded-xl pointer-events-none"
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
            background: 'linear-gradient(135deg, #ea580c 0%, #f97316 50%, #f59e0b 100%)',
            boxShadow: '0 8px 24px -4px rgba(249, 115, 22, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            transition: 'all 350ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      )}

      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`glass-tab-btn z-10 ${
              isActive
                ? 'text-white font-bold'
                : ''
            }`}
            style={isActive ? { color: 'white' } : undefined}
          >
            {tab.icon && (
              <span className={`transition-all duration-300 ${isActive ? 'scale-110 drop-shadow-sm' : 'opacity-60'}`}>
                {tab.icon}
              </span>
            )}
            <span className="whitespace-nowrap">{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all duration-300 ${
                  isActive
                    ? 'bg-white/25 text-white shadow-sm'
                    : 'bg-slate-200/80 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}


export function TabPanel({
  id,
  activeTab,
  children,
  className = '',
}: {
  id: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
}) {
  if (id !== activeTab) return null;
  return (
    <div key={id} className={`animate-tab-content ${className}`}>
      {children}
    </div>
  );
}
