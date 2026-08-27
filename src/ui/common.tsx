import type { ReactNode } from 'react';
import { hrefFor, type Route } from '../app/router';

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
}) {
  const styles: Record<string, string> = {
    default: 'border border-rule bg-white text-ink hover:bg-parchment',
    primary: 'border border-accent bg-accent text-white hover:opacity-90',
    ghost: 'border border-transparent text-muted hover:bg-rule/40 hover:text-ink',
    danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  };

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  children,
  variant = 'default',
}: {
  to: Route;
  children: ReactNode;
  variant?: 'default' | 'primary' | 'ghost';
}) {
  const styles: Record<string, string> = {
    default: 'border border-rule bg-white text-ink hover:bg-parchment',
    primary: 'border border-accent bg-accent text-white hover:opacity-90',
    ghost: 'border border-transparent text-muted hover:bg-rule/40 hover:text-ink',
  };
  return (
    <a
      href={hrefFor(to)}
      className={`inline-block rounded-md px-3 py-1.5 text-sm transition ${styles[variant]}`}
    >
      {children}
    </a>
  );
}

export function TopBar({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-rule bg-white/80 px-4 py-3 backdrop-blur">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </header>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-md border border-rule bg-white px-3 py-2 text-sm outline-none focus:border-accent';

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-rule border-t-accent" />
      {label}
    </span>
  );
}
