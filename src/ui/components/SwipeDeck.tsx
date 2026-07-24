'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CircleHelp, Heart, Star, X } from 'lucide-react';
import { VOTE_POINTS } from '../../lib/match';
import type { MovieCandidate } from '../../lib/types';
import type { RoomHook } from '../useRoom';
import { MovieDetails } from './MovieDetails';
import { SwipeCard } from './SwipeCard';

/** How many upcoming posters to warm the browser cache with. */
const PREFETCH_AHEAD = 8;

export function SwipeDeck({ roomHook }: { roomHook: RoomHook }) {
  const { room, userId, vote } = roomHook;
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-col gap-2 pt-1">
        <div className="flex items-center justify-between text-xs text-muted-fg">
          <span className="font-semibold uppercase tracking-widest">
            {room.lockedGenres.join(' + ')}
          </span>
          <span className="tabular">
            {Math.min(myIndex + 1, room.deck.length)}/{room.deck.length}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={myIndex}
          aria-valuemax={room.deck.length}
          aria-label="Deck progress"
        >
          <div
            className="h-full rounded-full bg-secondary transition-[width] duration-300"
            style={{ width: `${(myIndex / room.deck.length) * 100}%` }}
          />
        </div>
        {others.length > 0 && (
          <p className="tabular text-xs text-muted-fg">
            {others
              .map((u) => `${u.name} ${Math.min(room.progress[u.id] ?? 0, room.deck.length)}/${room.deck.length}`)
              .join(' · ')}
          </p>
        )}
      </header>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-xl font-bold">Deck finished</p>
          <p className="text-sm text-muted-fg">
            Waiting for {others.map((u) => u.name).join(', ')} to finish — then the points decide.
          </p>
        </div>
      ) : (
        <>
          <div className="relative min-h-0 flex-1" style={{ minHeight: '55dvh' }}>
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

          <ActionBar onVote={(points) => castVote(visible[0]!.id, points)} />
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
      animate={{ scale: 1 - depth * 0.04, y: depth * 10, opacity: depth === 2 ? 0.4 : 1 }}
      exit={exit}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      {children}
    </motion.div>
  );
}

function ActionBar({ onVote }: { onVote: (points: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-3 pb-1" role="group" aria-label="Vote">
      <ActionButton
        label="Dislike"
        className="border-destructive text-destructive"
        onClick={() => onVote(VOTE_POINTS.DISLIKE)}
      >
        <X aria-hidden className="size-7" />
      </ActionButton>
      <ActionButton
        label="Maybe"
        className="border-maybe text-maybe"
        onClick={() => onVote(VOTE_POINTS.MAYBE)}
      >
        <CircleHelp aria-hidden className="size-6" />
      </ActionButton>
      <ActionButton
        label="Like"
        className="border-accent text-accent"
        onClick={() => onVote(VOTE_POINTS.LIKE)}
      >
        <Heart aria-hidden className="size-7" />
      </ActionButton>
      <ActionButton
        label="Super Like"
        className="border-super text-super"
        onClick={() => onVote(VOTE_POINTS.SUPER)}
      >
        <Star aria-hidden className="size-6" />
      </ActionButton>
    </div>
  );
}

function ActionButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex size-14 cursor-pointer items-center justify-center rounded-full border-2 bg-muted transition active:scale-90 ${className}`}
    >
      {children}
    </button>
  );
}

function DeckSkeleton({ lockedGenres }: { lockedGenres: string[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="pt-1 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-fg">
          {lockedGenres.join(' + ')}
        </p>
        <p className="mt-1 text-sm text-muted-fg">Building your deck…</p>
      </header>
      <div className="relative flex-1" style={{ minHeight: '55dvh' }} aria-hidden>
        <div className="absolute inset-0 animate-pulse rounded-2xl border border-border bg-muted" />
      </div>
      <div className="flex items-center justify-center gap-3 pb-1" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="size-14 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
    </div>
  );
}
