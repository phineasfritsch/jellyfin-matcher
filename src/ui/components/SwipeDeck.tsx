'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { VOTE_POINTS } from '../../lib/match';
import type { MovieCandidate } from '../../lib/types';
import type { RoomHook } from '../useRoom';
import { EmptyState } from './EmptyState';
import { Bar, CostLine, Group, RowButton } from './Listing';
import { MovieDetails } from './MovieDetails';
import { SwipeCard } from './SwipeCard';
import { VoteRow, VoteRowSkeleton } from './VoteRow';

/** How many upcoming posters to warm the browser cache with. */
const PREFETCH_AHEAD = 8;

export function SwipeDeck({ roomHook }: { roomHook: RoomHook }) {
  const { room, userId, vote, undoVote } = roomHook;
  const reducedMotion = useReducedMotion();
  /** Exit direction per card id so AnimatePresence knows where it flew. */
  const [exits, setExits] = useState<Record<string, number>>({});
  /** Card whose details sheet is open, if any. */
  const [details, setDetails] = useState<MovieCandidate | null>(null);

  const deck = room?.deck;
  const index = room && userId ? (room.progress[userId] ?? 0) : 0;

  // Fetch upcoming posters before their cards reach the top of the stack,
  // so swiping never waits on the network. Browser dedupes repeats.
  useEffect(() => {
    if (!deck) return;
    for (const card of deck.slice(index, index + PREFETCH_AHEAD)) {
      if (card.posterUrl) {
        const img = new Image();
        img.src = card.posterUrl;
      }
    }
  }, [deck, index]);

  if (!room || !userId) return null;

  if (room.deck.length === 0) {
    return <DeckSkeleton lockedGenres={room.lockedGenres} />;
  }

  const myIndex = room.progress[userId] ?? 0;
  const others = Object.values(room.users).filter((u) => u.id !== userId);
  const done = myIndex >= room.deck.length;
  const visible = room.deck.slice(myIndex, myIndex + 3);

  function castVote(cardId: string, points: number) {
    setExits((prev) => ({ ...prev, [cardId]: points }));
    void vote(cardId, points).catch(() => {
      setExits((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
    });
  }

  const top = visible[0];
  const notHeld = top != null && top.jellyfinItemId == null;
  const behind = myIndex > 0 ? room.deck[myIndex - 1] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* R40: readout only. Nothing in the top bar is tappable. */}
      <Bar
        left={room.lockedGenres.join(' + ')}
        right={`${Math.min(myIndex + 1, room.deck.length)} / ${room.deck.length}`}
      />
      <div
        className="h-1 bg-white/[0.07]"
        role="progressbar"
        aria-valuenow={myIndex}
        aria-valuemax={room.deck.length}
        aria-label="Deck progress"
      >
        <div
          className="h-full bg-maybe transition-[width] duration-300"
          style={{ width: `${(myIndex / room.deck.length) * 100}%` }}
        />
      </div>
      {/*
        Peer progress as a count, never a per-person figure anyone can compare
        themselves against (R46). Ade could see the room watching him be the
        slow one; now the room only knows how many have finished.
      */}
      {others.length > 0 && (
        <p className="tabular px-4 py-1.5 text-label text-muted-fg">
          {room.othersFinished} of {others.length} others finished
        </p>
      )}
      {/*
        R42. The cost of voting yes on a film nobody owns, stated where the
        vote is cast, at a size a person can read in the dark. Nothing
        downloads from this screen -- the request is confirmed later, by the
        host.

        This comment used to promise "a size in gigabytes rather than a
        runtime". It never printed one, because there is none to print: no size
        datum reaches this app from Jellyfin or Jellyseerr, and the real figure
        is not settled until the host's Radarr picks a release (R91).
      */}
      {notHeld && (
        <CostLine
          headline="Not on your server — voting yes can download it."
          detail="The host is asked to approve it before anything is fetched."
        />
      )}
      {/*
        One polite live region, fired by the card changing, so a screen reader
        is told what it is voting on (R22). Without it the deck is silent and
        the vote buttons are the only thing that speaks.
      */}
      <p className="sr-only" role="status">
        {top
          ? `Card ${myIndex + 1} of ${room.deck.length}. ${top.title}${top.year ? `, ${top.year}` : ''}${
              top.runtime ? `, ${top.runtime} minutes` : ''
            }. ${top.jellyfinItemId ? 'On your server.' : 'Not on your server.'}`
          : ''}
      </p>

      {done ? (
        <EmptyState title="Deck finished">
          Waiting for {others.map((u) => u.name).join(', ')} to finish — then the points decide.
        </EmptyState>
      ) : (
        <>
          <div className="relative min-h-[150px] flex-1 shrink px-3 pt-3">
            <AnimatePresence>
              {visible
                .map((card, i) => (
                  <CardShell
                    key={card.id}
                    depth={i}
                    exitPoints={exits[card.id]}
                    reducedMotion={Boolean(reducedMotion)}
                  >
                    <SwipeCard
                      card={card}
                      active={i === 0}
                      onVote={(points) => castVote(card.id, points)}
                      onOpenDetails={() => setDetails(card)}
                    />
                  </CardShell>
                ))
                .reverse()}
            </AnimatePresence>
          </div>

          <VoteRow onVote={(points) => castVote(visible[0]!.id, points)} title={visible[0]!.title} />
          {/*
            R48. The deck is the one place a slip costs a film you cannot get
            back. A tremor, a nudge, a thumb put down to steady the phone --
            all of them used to be final.
          */}
          {behind && (
            <Group>
            <RowButton
              label="BACK"
              title={`Undo — ${behind.title}`}
              detail="Puts the card back and clears your vote."
              ariaLabel={`Undo your vote on ${behind.title}`}
              onClick={() => void undoVote()}
            />
            </Group>
          )}
        </>
      )}

      {details && <MovieDetails card={details} onClose={() => setDetails(null)} />}
    </div>
  );
}

function CardShell({
  depth,
  exitPoints,
  reducedMotion,
  children,
}: {
  depth: number;
  exitPoints: number | undefined;
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  const exit =
    reducedMotion || exitPoints === undefined
      ? { opacity: 0 }
      : exitPoints === VOTE_POINTS.DISLIKE
        ? { x: -500, rotate: -20, opacity: 0 }
        : exitPoints === VOTE_POINTS.MAYBE
          ? { y: -500, opacity: 0 }
          : { x: 500, rotate: 20, opacity: 0 };

  return (
    <motion.div
      className="absolute inset-0"
      style={{ zIndex: 10 - depth }}
      initial={false}
      animate={{ scale: 1 - depth * 0.045, y: depth * 12, opacity: depth === 0 ? 1 : 0.55 }}
      exit={exit}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      {children}
    </motion.div>
  );
}

function DeckSkeleton({ lockedGenres }: { lockedGenres: string[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="pt-1 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-fg">
          {lockedGenres.join(' + ')}
        </p>
        <p className="mt-1 text-sm text-muted-fg">Building your deck…</p>
      </header>
      <div className="relative min-h-[150px] flex-1 shrink px-3 pt-3" aria-hidden>
        <div className="absolute inset-0 animate-pulse rounded-2xl border border-border bg-muted" />
      </div>
      <VoteRowSkeleton />
    </div>
  );
}
