'use client';

import { useState } from 'react';
import { Check, Loader2, Play, Send, Trophy } from 'lucide-react';
import { emitAck } from '../socket';
import type { MatchDeclaredPayload } from '../types';
import type { RoomHook } from '../useRoom';
import { Confetti } from './Confetti';

export function WinnerScreen({
  roomHook,
  match,
}: {
  roomHook: RoomHook;
  match: MatchDeclaredPayload | null;
}) {
  const { room } = roomHook;
  if (!room) return null;

  const winner = match?.winner ?? room.deck.find((c) => c.id === room.winner) ?? null;
  if (!winner) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-xl font-bold">Session ended</p>
        <p className="text-sm text-muted-fg">No winner could be determined.</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto pt-4">
      <Confetti />

      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-super">
        <Trophy aria-hidden className="size-4" />
        {match?.viaFallback ? 'Points winner' : "It's a match!"}
      </p>

      <div className="w-56 overflow-hidden rounded-2xl border border-border shadow-2xl shadow-black/50">
        {winner.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={winner.posterUrl}
            alt={`${winner.title} poster`}
            className="aspect-[2/3] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[2/3] items-center justify-center bg-primary p-4 text-center text-xl font-bold">
            {winner.title}
          </div>
        )}
      </div>

      <header className="text-center">
        <h1 className="text-2xl font-bold">{winner.title}</h1>
        <p className="tabular mt-1 text-sm text-muted-fg">
          {winner.year ?? '—'}
          {winner.runtime != null && ` · ${winner.runtime} min`}
          {winner.scores.composite != null && ` · Score ${winner.scores.composite.toFixed(1)}`}
        </p>
      </header>

      {match?.viaFallback && match.ranking && (
        <ol className="w-full max-w-xs" aria-label="Final ranking">
          {match.ranking.map((r, i) => {
            const card = room.deck.find((c) => c.id === r.cardId);
            return (
              <li
                key={r.cardId}
                className={`flex items-center justify-between border-b border-border py-2 text-sm ${
                  i === 0 ? 'font-bold' : 'text-muted-fg'
                }`}
              >
                <span className="truncate">
                  {i + 1}. {card?.title ?? r.cardId}
                </span>
                <span className="tabular ml-2 shrink-0">{r.total.toFixed(1)} pts</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-auto flex w-full max-w-xs flex-col gap-2 pb-2">
        {match?.playUrl ? (
          <a
            href={match.playUrl}
            className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-background transition active:scale-95"
          >
            <Play aria-hidden className="size-5" /> Play in Jellyfin
          </a>
        ) : (
          <RequestButton />
        )}
      </div>
    </div>
  );
}

/** Wide-mode winner that is not in the library yet: queue it via Jellyseerr. */
function RequestButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function request() {
    setState('busy');
    try {
      await emitAck('winner:request', {});
      setState('done');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Request failed');
    }
  }

  if (state === 'done') {
    return (
      <p className="flex items-center justify-center gap-2 rounded-xl border border-accent bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
        <Check aria-hidden className="size-4" /> Requested. It will show up in Jellyfin once downloaded.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={request}
        disabled={state === 'busy'}
        className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-secondary text-lg font-semibold text-on-primary transition active:scale-95 disabled:opacity-50"
      >
        {state === 'busy' ? (
          <Loader2 aria-hidden className="size-5 animate-spin" />
        ) : (
          <Send aria-hidden className="size-5" />
        )}
        Request via Jellyseerr
      </button>
      {state === 'error' && message && (
        <p role="alert" className="text-center text-sm text-destructive">
          {message}
        </p>
      )}
    </>
  );
}
