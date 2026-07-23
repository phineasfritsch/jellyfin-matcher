'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Swords, X } from 'lucide-react';
import type { RoomHook } from '../useRoom';

export function Knockout({ roomHook }: { roomHook: RoomHook }) {
  const { room, userId } = roomHook;
  if (!room || !userId) return null;

  return room.knockout.phase === 'CHECKBOX' ? (
    <CheckboxPhase roomHook={roomHook} />
  ) : (
    <EliminationPhase roomHook={roomHook} />
  );
}

function CheckboxPhase({ roomHook }: { roomHook: RoomHook }) {
  const { room, userId, listGenres, submitGenres } = roomHook;
  const [genres, setGenres] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listGenres().then(setGenres).catch(() => setGenres([]));
  }, [listGenres]);

  if (!room || !userId) return null;
  const submitted = room.knockout.submissions[userId] !== undefined;
  const waitingOn = Object.values(room.users).filter(
    (u) => room.knockout.submissions[u.id] === undefined,
  );

  if (submitted) {
    return (
      <Waiting
        title="Picks locked in"
        detail={`Waiting on ${waitingOn.map((u) => u.name).join(', ')}…`}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="pt-2 text-center">
        <h1 className="text-2xl font-bold">What are you open to tonight?</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Check every genre you&apos;d watch. Overlap decides the deck.
        </p>
        {room.knockout.needsRevote && (
          <p role="alert" className="mt-2 rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
            Too few shared picks — vote again with more options.
          </p>
        )}
      </header>

      {genres === null ? (
        <div className="grid grid-cols-2 gap-2" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto pb-2" role="group" aria-label="Genres">
          {genres.map((g) => {
            const on = picked.has(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = new Set(picked);
                  if (on) next.delete(g);
                  else next.add(g);
                  setPicked(next);
                }}
                className={`flex h-12 cursor-pointer items-center justify-between rounded-xl border px-4 text-sm font-medium transition active:scale-95 ${
                  on ? 'border-accent bg-primary text-foreground' : 'border-border bg-muted text-muted-fg'
                }`}
              >
                {g}
                {on && <Check aria-hidden className="size-4 text-accent" />}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={picked.size === 0 || busy}
        onClick={() => {
          setBusy(true);
          void roomHook.submitGenres([...picked]).finally(() => setBusy(false));
        }}
        className="mt-auto flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-background transition active:scale-95 disabled:opacity-50"
      >
        {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
        Lock in {picked.size > 0 ? `${picked.size} pick${picked.size === 1 ? '' : 's'}` : 'picks'}
      </button>
    </div>
  );
}

function EliminationPhase({ roomHook }: { roomHook: RoomHook }) {
  const { room, userId, eliminate } = roomHook;
  const [busy, setBusy] = useState(false);
  if (!room || !userId) return null;

  const myVote = room.knockout.elimVotes[userId];
  const waitingOn = Object.values(room.users).filter(
    (u) => room.knockout.elimVotes[u.id] === undefined,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="pt-2 text-center">
        <p className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-fg">
          <Swords aria-hidden className="size-4" /> Knockout round
        </p>
        <h1 className="mt-1 text-2xl font-bold">Vote one genre OUT</h1>
        <p className="mt-1 text-sm text-muted-fg">{room.knockout.pool.length} left — 2 survive</p>
      </header>

      <div className="flex flex-col gap-2" role="group" aria-label="Surviving genres">
        {room.knockout.pool.map((g) => {
          const votedByMe = myVote === g;
          return (
            <button
              key={g}
              type="button"
              disabled={myVote !== undefined || busy}
              onClick={() => {
                setBusy(true);
                void eliminate(g).finally(() => setBusy(false));
              }}
              className={`flex h-14 cursor-pointer items-center justify-between rounded-xl border px-5 text-base font-semibold transition active:scale-95 disabled:cursor-default ${
                votedByMe
                  ? 'border-destructive bg-destructive/15 text-destructive'
                  : myVote !== undefined
                    ? 'border-border bg-muted text-muted-fg opacity-50'
                    : 'border-border bg-muted'
              }`}
            >
              {g}
              {votedByMe ? (
                <span className="flex items-center gap-1 text-sm">
                  <X aria-hidden className="size-4" /> your vote
                </span>
              ) : (
                <X aria-hidden className="size-5 text-muted-fg" />
              )}
            </button>
          );
        })}
      </div>

      {myVote !== undefined && (
        <Waiting title="Vote cast" detail={`Waiting on ${waitingOn.map((u) => u.name).join(', ')}…`} />
      )}
    </div>
  );
}

function Waiting({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
      <Loader2 aria-hidden className="size-8 animate-spin text-muted-fg" />
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-muted-fg">{detail}</p>
    </div>
  );
}
