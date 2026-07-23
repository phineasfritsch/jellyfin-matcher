'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Knockout } from './components/Knockout';
import { Lobby } from './components/Lobby';
import { SwipeDeck } from './components/SwipeDeck';
import { WinnerScreen } from './components/WinnerScreen';
import { useRoom } from './useRoom';

export function RoomClient({ roomId }: { roomId: string }) {
  const roomHook = useRoom(roomId);
  const { room, userId, match, error, connecting } = roomHook;

  if (connecting) {
    return (
      <Centered>
        <Loader2 aria-hidden className="size-8 animate-spin text-muted-fg" />
        <p className="text-muted-fg">Reconnecting…</p>
      </Centered>
    );
  }

  if (!userId) {
    return <JoinGate roomId={roomId} join={roomHook.join} />;
  }

  if (!room) {
    return (
      <Centered>
        <Loader2 aria-hidden className="size-8 animate-spin text-muted-fg" />
        <p className="text-muted-fg">Loading room {roomId}…</p>
      </Centered>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-destructive/15 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {room.status === 'LOBBY' && <Lobby roomHook={roomHook} />}
      {room.status === 'KNOCKOUT' && <Knockout roomHook={roomHook} />}
      {room.status === 'SWIPING' && <SwipeDeck roomHook={roomHook} />}
      {room.status === 'FINISHED' && <WinnerScreen roomHook={roomHook} match={match} />}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      {children}
    </main>
  );
}

function JoinGate({ roomId, join }: { roomId: string; join: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await join(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
      setBusy(false);
    }
  }

  return (
    <Centered>
      <p className="text-sm font-medium uppercase tracking-widest text-muted-fg">Joining room</p>
      <h1 className="tabular text-4xl font-bold tracking-[0.3em]">{roomId}</h1>
      <form onSubmit={submit} className="mt-4 flex w-full max-w-xs flex-col gap-3">
        <label htmlFor="join-name" className="text-sm font-medium text-muted-fg">
          Your name
        </label>
        <input
          id="join-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ferb"
          autoComplete="given-name"
          className="h-12 rounded-xl border border-border bg-muted px-4 text-base outline-none focus:ring-2 focus:ring-secondary"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-background transition active:scale-95 disabled:opacity-50"
        >
          {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
          Join Room
        </button>
        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </Centered>
  );
}
