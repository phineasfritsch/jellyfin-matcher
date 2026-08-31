'use client';

import { useEffect, useState } from 'react';
import { ABSTAIN } from '../../lib/knockout';
import type { RoomHook } from '../useRoom';
import { Bar, BigButton, Dock, Group, Row, RowButton } from './Listing';
import { t } from '../strings';

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
  const submittedCount = room.submittedCount;
  const submitted = room.knockout.submissions[userId] !== undefined;

  if (submitted) {
    return (
      <Waiting
        title={t('knockout.locked')}
        detail={t('knockout.hidden')}
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
      {/* R136: moves when somebody else answers, so it says so (4.1.3). */}
      <Bar left={t('knockout.prompt')} right={`${submittedCount} of ${members.length} in`} liveRight />

      <div className="scroll-body flex min-h-0 flex-1 flex-col">
        <Group>
          <Row
            label="HOW"
            title="Check everything you would watch"
            detail={t('knockout.overlap')}
          />
        </Group>
        {room.knockout.needsRevote && (
          <p
            role="alert"
            className="mx-3 mt-3 rounded-[var(--radius-card)] border border-destructive/40 bg-destructive/[0.14] px-4 py-3 text-body font-semibold text-destructive"
          >
            Too few shared picks — vote again with more options.
          </p>
        )}

        {genres === null ? (
          /*
            R85: the one wait in this component that said nothing.
            aria-hidden on the stripes is right -- eight decorative bars are
            not information -- but with nothing else here a screen reader met
            silence between "I'm ready" and a list of genres appearing.
          */
          <Group>
            <p role="status" className="sr-only">
              {t('knockout.loading')}
            </p>
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
        {/*
          R62. This is the first screen that demands an opinion, and it was the
          only one with no way to decline: twenty genres and a greyed-out
          button. The abstain row existed one screen later, which is exactly one
          screen too late for somebody who does not have a preference.
        */}
        <button
          type="button"
          onClick={() => {
            setBusy(true);
            void submitGenres([]).finally(() => setBusy(false));
          }}
          disabled={busy}
          className="min-h-[52px] w-full cursor-pointer rounded-[var(--radius-control)] px-4 py-3.5 text-row font-semibold text-muted-fg ring-1 ring-[var(--color-hairline)] transition active:scale-[0.985] disabled:opacity-50"
        >
          {t('knockout.abstain')}
        </button>
      </Dock>
    </div>
  );
}

function EliminationPhase({ roomHook }: { roomHook: RoomHook }) {
  const { room, userId, eliminate } = roomHook;
  if (!room || !userId) return null;

  const members = Object.values(room.users);
  const votedCount = room.votedCount;
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
      {/* R136: the pool shrinks as the room votes, with focus elsewhere. */}
      <Bar left={t('knockout.voteOut')} right={`${pool.length} left · 2 survive`} liveRight />

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
          /*
            R134 / WCAG 2.2 A 2.5.3 Label in Name. The name was "Abstain — go
            with the room" over a row that reads "No preference", with not one
            word in common, so "click No preference" did nothing. This is the
            control R47 added FOR the person who does not want to invent an
            opinion, and a voice user could not reach it. The name now starts
            with what the row says.
          */
          ariaLabel={t('knockout.abstain')}
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
        <p role="status" className="text-title font-semibold tracking-[-0.01em]">
          {title}
        </p>
        <p className="max-w-xs text-body leading-relaxed text-muted-fg">{detail}</p>
        <p className="tabular rounded-full bg-maybe/12 px-3 py-1 text-label font-semibold text-maybe">
          {count}
        </p>
      </div>
    </div>
  );
}
