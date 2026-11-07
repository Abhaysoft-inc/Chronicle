'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import { useAuth } from './auth-context';

/** Only follow "?next=" to a path inside this app. Anything else (https://evil.example, //evil) is ignored. */
function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

type Mode = 'login' | 'signup';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { login, signup, signupOpen } = useAuth();
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /** Typing in a field clears that field's error straight away, instead of leaving it until the next submit. */
  const clearError = (field: string) => setFieldErrors((e) => (field in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== field)) : e));

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (isSignup && !name.trim()) e.name = 'Enter your name';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address';
    if (!password) e.password = isSignup ? 'Choose a password' : 'Enter your password';
    else if (isSignup && password.length < 8) e.password = 'Use at least 8 characters';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    const problems = validate();
    setFieldErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      if (isSignup) await signup(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      router.replace(safeNext());
    } catch (err) {
      setBusy(false);
      // The server's messages are already plain language ("Incorrect email or password.").
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  if (isSignup && !signupOpen) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 text-sm">
        <p className="font-medium">Sign-ups are closed</p>
        <p className="mt-1 text-muted">This server is not accepting new accounts. Ask the person who runs it to invite you, or <Link href="/login" className="text-accent underline">sign in</Link> if you already have an account.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="rounded-lg border border-bad/30 bg-bad-bg px-3.5 py-2.5 text-sm text-bad">{error}</div>
      )}

      {isSignup && (
        <Field label="Full name">
          <TextInput value={name} onChange={(e) => { setName(e.target.value); clearError('name'); }} autoComplete="name" autoFocus placeholder="Dr. Asha Rao" aria-invalid={!!fieldErrors.name} className="h-11" />
          {fieldErrors.name && <span className="text-xs text-bad">{fieldErrors.name}</span>}
        </Field>
      )}

      <Field label="Email">
        <TextInput type="email" value={email} onChange={(e) => { setEmail(e.target.value); clearError('email'); }} autoComplete="email" autoFocus={!isSignup} placeholder="you@example.com" aria-invalid={!!fieldErrors.email} className="h-11" />
        {fieldErrors.email && <span className="text-xs text-bad">{fieldErrors.email}</span>}
      </Field>

      <Field label="Password" hint={isSignup && !fieldErrors.password ? 'At least 8 characters.' : undefined}>
        <div className="relative">
          <TextInput
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError('password'); }}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            aria-invalid={!!fieldErrors.password}
            className="h-11 pr-16"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 px-3.5 text-xs font-medium text-muted hover:text-fg"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {fieldErrors.password && <span className="text-xs text-bad">{fieldErrors.password}</span>}
      </Field>

      <Button type="submit" loading={busy} className="mt-1 h-11 text-[15px]">
        {isSignup ? 'Create account' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-muted">
        {isSignup ? (
          <>Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link></>
        ) : (
          signupOpen && <>New to Chronicle? <Link href="/signup" className="font-medium text-accent hover:underline">Create an account</Link></>
        )}
      </p>
    </form>
  );
}
