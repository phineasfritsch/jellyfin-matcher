'use client';

import { useEffect, useState } from 'react';
import { Clapperboard, Loader2, Lock } from 'lucide-react';
import { getAuthToken, setAuth } from './socket';
import { t } from './strings';

/** Longer than the server's own 15s upstream deadline, so its message wins when it has one (R88). */
const LOGIN_TIMEOUT_MS = 20_000;

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
      /*
        R88: the sign-in has a deadline on this side too.

        setBusy(false) runs only in the catch, which is correct as long as the
        request always settles -- and `fetch` has no default timeout, so a
        Jellyfin that accepts the connection and never answers left this button
        disabled with nothing said and no way out but a reload. The server-side
        deadline is 15s; this one is longer so that when the server can produce
        a real message, its message wins.
      */
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
        signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
      });
      const data = (await res.json()) as { token?: string; name?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error ?? t('auth.failed'));
      setAuth(data.token, data.name ?? username.trim());
      onLoggedIn();
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
      setError(
        timedOut
          ? t('auth.timeout')
          : err instanceof Error
            ? err.message
            : t('auth.failed'),
      );
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="flex w-full flex-col gap-2 px-1 pb-1">
        <p className="text-label font-semibold text-super">Jellyfin Matcher</p>
        {/*
          R10: the fallback names whose account is being asked for. Every
          caller that can say why it is asking passes a `reason` instead, and
          those live in the file that knows the reason -- Lobby.tsx,
          HomeActions.tsx, RoomClient.tsx. They are not catalogued here because
          they are not this file's to move.
        */}
        <h1 className="text-display font-semibold leading-tight tracking-[-0.02em]">
          {reason ?? t('auth.title')}
        </h1>
        <p className="flex items-start gap-1.5 text-label leading-relaxed text-muted-fg">
          <Lock aria-hidden className="size-3.5" /> {t('auth.serverChecks')}
        </p>
      </header>

      <form onSubmit={submit} className="gel flex w-full flex-col gap-4 rounded-[var(--radius-card)] p-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="jf-user" className="text-label font-medium text-muted-fg">
            {t('auth.username')}
          </label>
          <input
            id="jf-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            className="h-12 rounded-[var(--radius-control)] bg-white/[0.07] px-4 text-base outline-none ring-1 ring-border focus:ring-2 focus:ring-secondary"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="jf-pass" className="text-label font-medium text-muted-fg">
            {t('auth.password')}
          </label>
          <input
            id="jf-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="h-12 rounded-[var(--radius-control)] bg-white/[0.07] px-4 text-base outline-none ring-1 ring-border focus:ring-2 focus:ring-secondary"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="mt-1 flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-3.5 text-row font-semibold tracking-[-0.01em] text-on-primary transition active:scale-[0.985] disabled:opacity-50"
        >
          {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
          {t('auth.submit')}
        </button>
        {error && (
          <p role="alert" className="rounded-[var(--radius-control)] bg-destructive/[0.14] px-3.5 py-2.5 text-body font-semibold text-destructive ring-1 ring-destructive/35">
            {error}
          </p>
        )}
        {/*
          R55: the way out is the same size and shape as the way in.

          It was 14px grey underlined text called "Back", underneath a
          full-width green button. A guest who will never make an account reads
          that pairing as a trial wall -- the decline is styled as the lesser
          option, which is the house style of software that does not really
          mean to offer it -- and puts the phone down rather than reading the
          screen. Nothing is gated here that a guest cannot simply skip.
        */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-[52px] cursor-pointer items-center justify-center rounded-[var(--radius-control)] bg-white/[0.07] px-4 py-3.5 text-row font-semibold tracking-[-0.01em] text-foreground ring-1 ring-white/15 transition active:scale-[0.985]"
          >
            {t('auth.decline')}
          </button>
        )}
      </form>
    </main>
  );
}
