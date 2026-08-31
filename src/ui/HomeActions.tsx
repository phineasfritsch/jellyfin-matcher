'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Loader2, Plus } from 'lucide-react';
import { isLoggedIn, LoginScreen, useAuthConfig } from './AuthGate';
import { emitAck, saveSession } from './socket';

export function HomeActions() {
  const router = useRouter();
  const { config } = useAuthConfig();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  async function createRoom() {
    if (!name.trim()) return setError('Enter your name first');
    // Some deployments require a Jellyfin login before opening a room.
    if (config?.createRequires && !isLoggedIn()) {
      setShowLogin(true);
      return;
    }
    setBusy('create');
    setError(null);
    try {
      const res = await emitAck<{ roomId: string; userId: string }>('room:create', {
        name: name.trim(),
      });
      saveSession(res.roomId, { userId: res.userId, name: name.trim() });
      router.push(`/room/${res.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room');
      setBusy(null);
    }
  }

  if (showLogin) {
    return (
      <LoginScreen
        reason="Sign in to create a room"
        onLoggedIn={() => {
          setShowLogin(false);
          void createRoom();
        }}
        onCancel={() => setShowLogin(false)}
      />
    );
  }

  function joinRoom() {
    if (!code.trim()) return setError('Enter a room code');
    setBusy('join');
    // Name is collected on the room page's join gate (also the QR path).
    router.push(`/room/${code.trim().toUpperCase()}`);
  }

  return (
    <section className="gel flex w-full flex-col gap-5 rounded-[var(--radius-card)] p-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-label font-medium text-muted-fg">
          Your name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Phineas"
          autoComplete="given-name"
          className="h-12 rounded-[var(--radius-control)] bg-white/[0.07] px-4 text-base outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-secondary"
        />
      </div>

      <button
        type="button"
        onClick={createRoom}
        disabled={busy !== null}
        className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-3.5 text-row font-semibold tracking-[-0.01em] text-on-primary transition active:scale-[0.985] disabled:opacity-50"
      >
        {busy === 'create' ? (
          <Loader2 aria-hidden className="size-5 animate-spin" />
        ) : (
          <Plus aria-hidden className="size-5" />
        )}
        Create room
      </button>

      <div className="flex items-center gap-3 text-label text-muted-fg">
        <div className="h-px flex-1 bg-white/12" />
        or join one
        <div className="h-px flex-1 bg-white/12" />
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ROOM CODE"
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Room code"
          className="tabular h-14 min-w-0 flex-1 rounded-[var(--radius-control)] bg-white/[0.07] px-4 text-center font-mono text-xl font-bold tracking-[0.35em] outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-secondary"
        />
        <button
          type="button"
          onClick={joinRoom}
          disabled={busy !== null}
          className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] bg-maybe text-on-primary transition active:scale-95 disabled:opacity-50"
          aria-label="Join room"
        >
          {busy === 'join' ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : (
            <ArrowRight aria-hidden className="size-5" />
          )}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-[var(--radius-control)] bg-destructive/[0.14] px-3.5 py-2.5 text-body font-semibold text-destructive ring-1 ring-destructive/35">
          {error}
        </p>
      )}
    </section>
  );
}
