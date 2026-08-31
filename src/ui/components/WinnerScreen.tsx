'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { emitAck } from '../socket';
import type { MatchDeclaredPayload } from '../types';
import type { RoomHook } from '../useRoom';
import { Confetti } from './Confetti';
import { EmptyState } from './EmptyState';
import { Bar, BigButton, CostLine, Row } from './Listing';

export function WinnerScreen({
  roomHook,
  match,
}: {
  roomHook: RoomHook;
  match: MatchDeclaredPayload | null;
}) {
  const { room } = roomHook;
  const heading = useRef<HTMLHeadingElement>(null);

  /**
   * R52: this screen replaces the deck outright. Nothing announced that, so a
   * screen reader user's next Tab landed somewhere unrelated and the session
   * had silently ended. Focus moves to the title, which reads the whole result.
   */
  useEffect(() => {
    heading.current?.focus();
  }, [room?.winner]);

  if (!room) return null;

  const winner = match?.winner ?? room.deck.find((c) => c.id === room.winner) ?? null;
  if (!winner) {
    return <EmptyState title="Session ended">No winner could be determined.</EmptyState>;
  }

  const held = Boolean(match?.playUrl);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Confetti />
      {/*
        The old screen only ever drew the case that costs nothing: green bar,
        "Play in Jellyfin". Half the time in Any Movie mode the winner is a
        film nobody owns, and that is a different screen (R53).
      */}
      <Bar
        left={match?.viaFallback ? 'Points winner' : 'Locked in'}
        right={held ? 'On your server' : 'Not on your server'}
        tone={held ? 'go' : 'stop'}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex items-start gap-3 border-b border-border p-3">
          {winner.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={winner.posterUrl}
              alt={`${winner.title} poster`}
              className="w-24 shrink-0 border border-border object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <h1
              ref={heading}
              tabIndex={-1}
              className="font-display text-2xl uppercase leading-tight outline-none"
            >
              {winner.title}
            </h1>
            <p className="tabular mt-1 text-[12.5px] text-muted-fg">
              {winner.year ?? 'Year unknown'}
              {winner.runtime != null && ` · ${winner.runtime} min`}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-fg">
              {match?.viaFallback
                ? 'Nobody agreed outright, so the points decided.'
                : 'Everyone said yes.'}
            </p>
          </div>
        </div>

        {!held && (
          <CostLine
            headline="This one is not on the server yet."
            detail="Nothing has been downloaded. Asking sends it to Jellyseerr for the host to approve."
          />
        )}

        {match?.viaFallback && match.ranking && (
          <section aria-label="Final ranking" className="contents">
            {match.ranking.map((r, i) => {
              const card = room.deck.find((c) => c.id === r.cardId);
              return (
                <Row
                  key={r.cardId}
                  label={`${i + 1}`}
                  tone={i === 0 ? 'go' : 'plain'}
                  title={card?.title ?? r.cardId}
                  detail={`${r.total.toFixed(1)} points — ${r.composite.toFixed(1)} from ratings, ${r.votePoints > 0 ? '+' : ''}${r.votePoints} from the room`}
                />
              );
            })}
          </section>
        )}
      </div>

      <div className="border-t border-border">
        {held && match?.playUrl ? (
          <a
            href={match.playUrl}
            className="flex min-h-[52px] w-full cursor-pointer items-center justify-center bg-accent px-4 py-3.5 font-mono text-sm font-bold uppercase tracking-[0.08em] text-on-primary"
          >
            Play in Jellyfin
          </a>
        ) : (
          <RequestControl title={winner.title} runtime={winner.runtime} />
        )}
      </div>
    </div>
  );
}

/**
 * The one irreversible control in the app. R37: confirmed by a second tap, not
 * a timed hold — a hold is a different gesture for a tremor, for a switch user
 * and for a thumb, and this is the control where they must all behave the same.
 * The confirm states the cost before it is committed, not after.
 */
function RequestControl({ title, runtime }: { title: string; runtime: number | null }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
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
      <p
        role="status"
        className="flex items-center justify-center gap-2 border-t border-accent bg-accent/10 px-4 py-3.5 text-sm font-medium text-accent"
      >
        <Check aria-hidden className="size-4" /> Asked. It appears in Jellyfin once the host
        approves it and it finishes downloading.
      </p>
    );
  }

  if (state === 'confirm' || state === 'busy') {
    return (
      <div className="flex flex-col">
        <p id="request-cost" className="bg-destructive px-3 py-2 text-[13px] font-medium text-on-primary">
          Sends {title}
          {runtime != null && ` (${runtime} min)`} to Jellyseerr. The host approves the
          download; you will not see it tonight.
        </p>
        <div className="grid grid-cols-2">
          <BigButton onClick={send} tone="commit" disabled={state === 'busy'} ariaDescribedBy="request-cost">
            {state === 'busy' ? <Loader2 aria-hidden className="mx-auto size-5 animate-spin" /> : 'Yes, ask'}
          </BigButton>
          <BigButton onClick={() => setState('idle')} tone="ghost">
            Cancel
          </BigButton>
        </div>
      </div>
    );
  }

  return (
    <>
      <BigButton onClick={() => setState('confirm')} tone="commit">
        Request via Jellyseerr
      </BigButton>
      {state === 'error' && message && (
        <p role="alert" className="px-3 py-2 text-center text-sm text-destructive">
          {message}
        </p>
      )}
    </>
  );
}
