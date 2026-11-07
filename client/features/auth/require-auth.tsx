'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from './auth-context';

/** Wrap anything that needs a signed-in user. Signed out? Go to /login and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anon') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authed') {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted" role="status" aria-live="polite">
        <span className="flex items-center gap-2"><Spinner className="size-4" /> {status === 'loading' ? 'Loading…' : 'Redirecting to sign in…'}</span>
      </div>
    );
  }
  return <>{children}</>;
}

/** The opposite: login and sign-up pages send you on to the app if you are already signed in. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'authed') router.replace('/dashboard');
  }, [status, router]);
  return <>{children}</>;
}
