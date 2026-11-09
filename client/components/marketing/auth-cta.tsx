'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-context';

const PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-full bg-fg font-medium text-bg transition-[opacity,transform] duration-300 ease-sarvam hover:opacity-85 active:scale-[0.97]';

/** The navbar's right-hand side. Signed out: Sign in + Get started. Signed in: straight to the app. */
export function HeaderActions() {
  const { status, user } = useAuth();
  if (status === 'loading') return <div className="h-9 w-44" aria-hidden="true" />; // reserve the space: no layout jump
  if (status === 'authed') {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden max-w-40 truncate text-sm text-muted sm:inline">{user?.name}</span>
        <Link href="/dashboard" className={`${PRIMARY} h-9 px-4 text-sm`}>Dashboard</Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Link href="/login" className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-muted transition-colors hover:text-fg">Sign in</Link>
      <Link href="/signup" className={`${PRIMARY} h-9 px-4 text-sm`}>Get started</Link>
    </div>
  );
}

/** A big call-to-action that goes to sign-up, or to the dashboard if already signed in. */
export function CtaLink({ children, className = '', inverted = false }: { children: ReactNode; className?: string; inverted?: boolean }) {
  const { status } = useAuth();
  const href = status === 'authed' ? '/dashboard' : '/signup';
  const look = inverted ? 'bg-accent-fg text-accent' : 'bg-fg text-bg';
  return (
    <Link href={href} className={`inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-medium transition-[opacity,transform] duration-300 ease-sarvam hover:opacity-85 active:scale-[0.97] ${look} ${className}`}>
      {children}
    </Link>
  );
}
