'use client';

import { useEffect, useState } from 'react';
import { Clapperboard, Loader2, Lock } from 'lucide-react';
import { getAuthToken, setAuth } from './socket';

export interface AuthConfig {
  createRequires: boolean;
  joinRequires: boolean;
  wideRequires: boolean;
  requestRequires: boolean;
}

/**
 * Fetches which actions need a Jellyfin login. Auth is enforced per action
 * (create vs join) rather than gating the whole app, so account-less guests
 * can still join a room someone shares with them.
 */
export function useAuthConfig(): { config: AuthConfig | null; loading: boolean } {
  const [config, setConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth-config')
      .then((r) => r.json())
      .then((cfg: AuthConfig) => active && setConfig(cfg))
      // Fail open rather than lock everyone out if the check errors.
      .catch(
        () =>
          active &&
          setConfig({
            createRequires: false,
            joinRequires: false,
            wideRequires: false,
            requestRequires: false,
          }),
      );
    return () => {
      active = false;
    };
  }, []);

  return { config, loading: config === null };
}

export function isLoggedIn(): boolean {
  return getAuthToken() !== null;
}

/** Full-screen Jellyfin login. `reason` explains why it's being asked for. */
export function LoginScreen({
  reason,
  onLoggedIn,
  onCancel,
}: {
  reason?: string;
  onLoggedIn: () => void;
  /** When set, shows a way back out (for optional gates the user can decline). */
  onCancel?: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as { token?: string; name?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error ?? 'Login failed');
      setAuth(data.token, data.name ?? username.trim());
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-8 px-6 py-12">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary">
          <Clapperboard aria-hidden className="size-8 text-on-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Jellyfin Matcher</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted-fg">
          <Lock aria-hidden className="size-4" /> {reason ?? 'Sign in with your Jellyfin account'}
        </p>
      </header>

      <form onSubmit={submit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="jf-user" className="text-sm font-medium text-muted-fg">
            Username
          </label>
          <input
            id="jf-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            className="h-12 rounded-xl border border-border bg-muted px-4 text-base outline-none focus:ring-2 focus:ring-secondary"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="jf-pass" className="text-sm font-medium text-muted-fg">
            Password
          </label>
          <input
            id="jf-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="h-12 rounded-xl border border-border bg-muted px-4 text-base outline-none focus:ring-2 focus:ring-secondary"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="mt-2 flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-background transition active:scale-95 disabled:opacity-50"
        >
          {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
          Sign in
        </button>
        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-1 cursor-pointer text-center text-sm text-muted-fg underline-offset-4 hover:underline"
          >
            Back
          </button>
        )}
      </form>
    </main>
  );
}
