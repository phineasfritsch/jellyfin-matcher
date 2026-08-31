'use client';

import { useEffect, useState } from 'react';
import { ABSTAIN } from '../../lib/knockout';
import type { RoomHook } from '../useRoom';
import { Bar, BigButton, Dock, Group, Row, RowButton } from './Listing';

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
    listGenres()
      .then(setGenres)
      .catch(() => setGenres([]));
  }, [listGenres]);

  if (!room || !userId) return null;
  const members = Object.values(room.users);
  const submittedCount = members.filter(
    (u) => room.knockout.submissions[u.id] !== undefined,
  ).length;
  const submitted = room.knockout.submissions[userId] !== undefined;

  if (submitted) {
    return (
      <Waiting
        title="Picks locked in"
        detail="Nobody can see what you picked until everyone is in."
        count={`${submittedCount} of ${members.length} in`}
      />
    );
  }

  function toggle(g: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Bar left="What are you open to?" right={`${submittedCount} of ${members.length} in`} />

      <div className="scroll-body flex min-h-0 flex-1 flex-col">
        <Group>
          <Row
            label="HOW"
            title="Check everything you would watch"
            detail="Overlap decides the deck. Picking more makes a deck more likely, not worse."
          />
        </Group>
        {room.knockout.needsRevote && (
          <p
            role="alert"
            className="mx-3 mt-3 rounded-[var(--radius-card)] border border-destructive/40 bg-destructive/[0.14] px-4 py-3 text-[15px] font-semibold text-destructive"
          >
            Too few shared picks — vote again with more options.
          </p>
        )}

        {genres === null ? (
          <Group>
            <div aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-[60px] animate-pulse border-b border-border bg-white/[0.04]" />
              ))}
            </div>
          </Group>
        ) : (
          /*
            Genres are rows, not chips. The old 26px chip was the primary
            control of the screen and it was a target a tremor cannot hit and
            a grid that does not contain it (R39).
          */
          <Group title="Genres" ariaLabel="Genres">
            {genres.map((g) => (
              <RowButton
                key={g}
                label={picked.has(g) ? '✓' : '—'}
                tone={picked.has(g) ? 'mine' : 'plain'}
                title={g}
                pressed={picked.has(g)}
                ariaLabel={picked.has(g) ? `${g}, picked` : `Pick ${g}`}
                onClick={() => toggle(g)}
              />
            ))}
          </Group>
        )}
      </div>

      <Dock>
        <BigButton
          onClick={() => {
            setBusy(true);
            void submitGenres([...picked]).finally(() => setBusy(false));
          }}
          disabled={busy || picked.size === 0}
        >
          {busy ? 'Sending…' : `Lock in ${picked.size}`}
        </BigButton>
      </Dock>
    </div>
  );
}

function EliminationPhase({ roomHook }: { roomHook: RoomHook }) {
  const { room, userId, eliminate } = roomHook;
  if (!room || !userId) return null;

  const members = Object.values(room.users);
  const votedCount = members.filter((u) => room.knockout.elimVotes[u.id] !== undefined).length;
  const myVote = room.knockout.elimVotes[userId];
  const pool = room.knockout.pool;

  if (myVote !== undefined) {
    return (
      <Waiting
        title="Vote cast"
        detail={
          myVote === ABSTAIN
            ? 'You went with the room — no genre carries your vote.'
            : `${myVote} carries your vote. Counts stay hidden until everyone is in.`
        }
        count={`${votedCount} of ${members.length} in`}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Bar left="Vote one out" right={`${pool.length} left · 2 survive`} />

      <div className="scroll-body flex min-h-0 flex-1 flex-col">
        <Group>
          <Row
            label="HOW"
            title="Vote out the one you least want"
            detail="Counts stay hidden until everyone has voted, so nobody is watched deciding."
          />
        </Group>
        <Group title="Still in" ariaLabel="Surviving genres">
          {pool.map((g) => (
            <RowButton
              key={g}
              label="—"
              title={g}
              ariaLabel={`Vote out ${g}`}
              onClick={() => void eliminate(g)}
            />
          ))}
        </Group>
        <Group>
        {/*
          R47. Somebody with no opinion should not have to invent one, and
          should not hold up four other people while they fail to. Yellow,
          because going with the room is a statement about the room.
        */}
        <RowButton
          label="ANY"
          tone="room"
          title="No preference"
          detail="Go with the room. Counts as voted, weighs nothing."
          ariaLabel="Abstain — go with the room"
          onClick={() => void eliminate(ABSTAIN)}
        />
        </Group>
      </div>
    </div>
  );
}

function Waiting({ title, detail, count }: { title: string; detail: string; count: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Bar left={title} right={count} tone="quiet" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        {/*
          role="status", not a bare spinner: a screen reader is told the state
          was reached, and reduced motion does not freeze the only signal into
          a tilted static icon (R35).
        */}
        <p role="status" className="text-[22px] font-semibold tracking-[-0.01em]">
          {title}
        </p>
        <p className="max-w-xs text-[14px] leading-relaxed text-muted-fg">{detail}</p>
        <p className="tabular rounded-full bg-maybe/12 px-3 py-1 text-[13px] font-semibold text-maybe">
          {count}
        </p>
      </div>
    </div>
  );
}
