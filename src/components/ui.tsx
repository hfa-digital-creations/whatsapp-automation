import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary:
      'bg-gradient-to-r from-brand-600 via-orange-500 to-amber-500 hover:from-brand-500 hover:via-orange-400 hover:to-amber-400 text-white shadow-md shadow-brand-500/25 border border-white/20 hover:shadow-lg hover:shadow-brand-500/35 disabled:opacity-50 disabled:shadow-none',
    secondary:
      'bg-white/60 dark:bg-white/10 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-white/15 hover:bg-white/90 dark:hover:bg-white/20 backdrop-blur-md shadow-sm hover:shadow disabled:opacity-50',
    danger:
      'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-md shadow-red-500/20 border border-red-400/30 hover:shadow-lg hover:shadow-red-500/30 disabled:opacity-50',
    ghost:
      'text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 dark:hover:bg-brand-500/20 backdrop-blur-sm border border-transparent hover:border-brand-500/20 disabled:opacity-50',
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${styles} ${className}`}
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
      className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-300 ${
        hoverEffect ? 'hover:-translate-y-0.5 hover:shadow-xl hover:border-brand-500/30 dark:hover:border-brand-500/40' : ''
      } bg-white/70 border-white/60 shadow-glass text-slate-800 dark:bg-slate-900/60 dark:border-white/10 dark:shadow-glass-dark dark:text-slate-100 p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border px-3.5 py-2 text-sm outline-none transition-all duration-200 bg-white/80 border-slate-200/80 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 shadow-sm dark:bg-slate-900/50 dark:border-white/10 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900/80 dark:focus:border-brand-500 dark:focus:ring-brand-500/30 ${props.className ?? ''}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border px-3.5 py-2 text-sm outline-none transition-all duration-200 bg-white/80 border-slate-200/80 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 shadow-sm dark:bg-slate-900/50 dark:border-white/10 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900/80 dark:focus:border-brand-500 dark:focus:ring-brand-500/30 ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border px-3.5 py-2 text-sm outline-none transition-all duration-200 bg-white/80 border-slate-200/80 text-slate-900 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 shadow-sm dark:bg-slate-900/50 dark:border-white/10 dark:text-slate-100 dark:focus:bg-slate-900/80 dark:focus:border-brand-500 dark:focus:ring-brand-500/30 ${props.className ?? ''}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">{children}</label>;
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
    green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    red: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    blue: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
    purple: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm transition-colors ${styles}`}
    >
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="relative h-8 w-8">
        <div className="absolute inset-0 rounded-full border-2 border-brand-500/20" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-brand-500 border-t-transparent shadow-sm" />
      </div>
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/30 p-8 text-center backdrop-blur-md dark:border-white/10 dark:bg-white/[0.02]">
      {icon && <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>}
      <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 backdrop-blur-sm">
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

