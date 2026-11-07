'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { ApiStatus, ConnectionButton } from './connection-controls';
import { IconClose, IconDashboard, IconFolder, IconLogOut, IconMenu } from './nav-icons';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: IconDashboard },
  { href: '/cases', label: 'Cases', icon: IconFolder },
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase() || '?';
}

function Sidebar({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  async function signOutNow() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} title="Chronicle home" className={`flex h-14 items-center gap-2 border-b border-line px-4 font-semibold tracking-tight ${rail ? 'justify-center px-0' : ''}`}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg" aria-hidden="true">C</span>
        {!rail && <span>Chronicle</span>}
      </Link>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map(({ href, label, icon: NavIcon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={rail ? label : undefined}
              aria-current={active ? 'page' : undefined}
              className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${rail ? 'justify-center px-0' : ''} ${active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'}`}
            >
              <NavIcon className="size-5 shrink-0" />
              {!rail && label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className={`flex items-center gap-3 ${rail ? 'flex-col' : ''}`}>
          <span title={user?.name} className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent" aria-hidden={!rail}>
            {initials(user?.name ?? '')}
          </span>
          {!rail && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
          )}
          <button
            type="button"
            onClick={signOutNow}
            title="Sign out"
            aria-label="Sign out"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          >
            <IconLogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The signed-in frame: a sidebar (an icon rail while a case is open, to leave room for the page
 * viewer), a slim top bar, and the page. On phones the sidebar is a slide-over drawer.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const rail = /^\/cases\/[^/]+/.test(pathname);
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className={`sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface lg:block ${rail ? 'w-[4.5rem]' : 'w-60'}`}>
        <Sidebar rail={rail} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-surface shadow-xl">
            <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2">
              <IconClose className="size-5" />
            </button>
            <Sidebar rail={false} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:px-8">
          <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 lg:hidden">
            <IconMenu className="size-5" />
          </button>
          <span className="flex-1" />
          <div className="flex items-center gap-2">
            <ApiStatus />
            <ConnectionButton />
          </div>
        </header>
        <main className="flex-1 px-4 py-4 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
