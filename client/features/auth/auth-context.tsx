'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { UNAUTHENTICATED_EVENT } from '@/lib/api/client';
import { getMe, signIn, signOut, signUp } from '@/lib/api/endpoints';
import type { AuthUser } from '@/lib/api/types';

type Status = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: Status;
  user: AuthUser | null;
  /** False when the server has turned off new sign-ups. */
  signupOpen: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Who is signed in. The session itself is an httpOnly cookie that scripts cannot read, so this
 * asks the server ("/auth/me") once on load. If any later request finds the session has ended,
 * the API client announces it and this flips to signed-out, which sends the user to the login page.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: Status; user: AuthUser | null; signupOpen: boolean }>({ status: 'loading', user: null, signupOpen: true });

  useEffect(() => {
    let stale = false;
    getMe()
      .then((r) => !stale && setState({ status: r.user ? 'authed' : 'anon', user: r.user, signupOpen: r.signupOpen }))
      // Backend unreachable: treat as signed out so the login page can explain, instead of spinning for ever.
      .catch(() => !stale && setState((s) => ({ ...s, status: 'anon', user: null })));
    const onExpired = () => setState((s) => ({ ...s, status: 'anon', user: null }));
    window.addEventListener(UNAUTHENTICATED_EVENT, onExpired);
    return () => {
      stale = true;
      window.removeEventListener(UNAUTHENTICATED_EVENT, onExpired);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await signIn({ email, password });
    setState((s) => ({ ...s, status: 'authed', user }));
  }, []);
  const signup = useCallback(async (name: string, email: string, password: string) => {
    const user = await signUp({ name, email, password });
    setState((s) => ({ ...s, status: 'authed', user }));
  }, []);
  const logout = useCallback(async () => {
    try {
      await signOut();
    } finally {
      setState((s) => ({ ...s, status: 'anon', user: null }));
    }
  }, []);

  const value = useMemo(() => ({ ...state, login, signup, logout }), [state, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
