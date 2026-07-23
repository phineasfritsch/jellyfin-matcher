'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Loader2, Plus } from 'lucide-react';
import { emitAck, saveSession } from './socket';

export function HomeActions() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    if (!name.trim()) return setError('Enter your name first');
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

  function joinRoom() {
    if (!code.trim()) return setError('Enter a room code');
    setBusy('join');
    // Name is collected on the room page's join gate (also the QR path).
    router.push(`/room/${code.trim().toUpperCase()}`);
  }

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-medium text-muted-fg">
          Your name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Phineas"
          autoComplete="given-name"
          className="h-12 rounded-xl border border-border bg-muted px-4 text-base outline-none focus:ring-2 focus:ring-secondary"
        />
      </div>

      <button
        type="button"
        onClick={createRoom}
        disabled={busy !== null}
        className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-background transition active:scale-95 disabled:opacity-50"
      >
        {busy === 'create' ? (
          <Loader2 aria-hidden className="size-5 animate-spin" />
        ) : (
          <Plus aria-hidden className="size-5" />
        )}
        Create Room
      </button>

      <div className="flex items-center gap-3 text-xs text-muted-fg">
        <div className="h-px flex-1 bg-border" />
        or join one
        <div className="h-px flex-1 bg-border" />
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
          className="tabular h-14 min-w-0 flex-1 rounded-xl border border-border bg-muted px-4 text-center text-xl font-bold tracking-[0.4em] outline-none focus:ring-2 focus:ring-secondary"
        />
        <button
          type="button"
          onClick={joinRoom}
          disabled={busy !== null}
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-xl bg-secondary text-on-primary transition active:scale-95 disabled:opacity-50"
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
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
