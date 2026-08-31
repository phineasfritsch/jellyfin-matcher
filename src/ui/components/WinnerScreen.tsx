'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { emitAck } from '../socket';
import type { MatchDeclaredPayload } from '../types';
import type { RoomHook } from '../useRoom';
import { Confetti } from './Confetti';
import { EmptyState } from './EmptyState';
import { Bar, BigButton, CostLine, Dock, Group, Row } from './Listing';

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

      <div className="scroll-body flex min-h-0 flex-1 flex-col">
        <div className="pane mx-3 mt-3 flex items-start gap-3.5 rounded-[var(--radius-card)] p-3.5">
          {winner.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={winner.posterUrl}
              alt={`${winner.title} poster`}
              className="w-24 shrink-0 rounded-[var(--radius-control)] object-cover ring-1 ring-[var(--color-hairline)]"
            />
          ) : null}
          <div className="min-w-0">
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-[22px] font-semibold leading-tight tracking-[-0.015em] outline-none"
            >
              {winner.title}
            </h1>
            <p className="tabular mt-1.5 text-[13px] text-muted-fg">
              {winner.year ?? 'Year unknown'}
              {winner.runtime != null && ` · ${winner.runtime} min`}
            </p>
            <p className="mt-1 text-[13px] text-muted-fg">
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
          <Group title="Final ranking" ariaLabel="Final ranking">
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
          </Group>
        )}
      </div>

      <Dock>
        {held && match?.playUrl ? (
          <a
            href={match.playUrl}
            className="flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-[var(--radius-control)] bg-accent px-4 py-3.5 text-[16px] font-semibold tracking-[-0.01em] text-on-primary"
          >
            Play in Jellyfin
          </a>
        ) : (
          <RequestControl title={winner.title} runtime={winner.runtime} />
        )}
      </Dock>
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
        className="flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent/12 px-4 py-3.5 text-[14px] font-medium text-accent ring-1 ring-accent/35"
      >
        <Check aria-hidden className="size-4" /> Asked. It appears in Jellyfin once the host
        approves it and it finishes downloading.
      </p>
    );
  }

  if (state === 'confirm' || state === 'busy') {
    return (
      <div className="flex flex-col">
        <p
          id="request-cost"
          className="rounded-[var(--radius-control)] bg-destructive/[0.14] px-3.5 py-2.5 text-[13.5px] font-medium leading-relaxed text-destructive ring-1 ring-destructive/35"
        >
          Sends {title}
          {runtime != null && ` (${runtime} min)`} to Jellyseerr. The host approves the
          download; you will not see it tonight.
        </p>
        <div className="grid grid-cols-2 gap-2">
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
        <p role="alert" className="px-1 py-1 text-center text-[14px] text-destructive">
          {message}
        </p>
      )}
    </>
  );
}
