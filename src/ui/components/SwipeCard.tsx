'use client';

import { motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { Layers } from 'lucide-react';
import type { MovieCandidate } from '../../lib/types';
import { VOTE_POINTS } from '../../lib/match';

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 600;

export interface SwipeCardProps {
  card: MovieCandidate;
  /** Called once with the chosen points when the card leaves. */
  onVote: (points: number) => void;
  /** Only the top card is draggable. */
  active: boolean;
}

export function SwipeCard({ card, onVote, active }: SwipeCardProps) {
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const likeOpacity = useTransform(x, [40, SWIPE_DISTANCE], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_DISTANCE, -40], [1, 0]);
  const maybeOpacity = useTransform(y, [-SWIPE_DISTANCE, -40], [1, 0]);

  function handleDragEnd(
    _e: unknown,
    info: { offset: { x: number; y: number }; velocity: { x: number; y: number } },
  ) {
    const { offset, velocity } = info;
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) {
      onVote(VOTE_POINTS.LIKE);
    } else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) {
      onVote(VOTE_POINTS.DISLIKE);
    } else if (offset.y < -SWIPE_DISTANCE || velocity.y < -SWIPE_VELOCITY) {
      onVote(VOTE_POINTS.MAYBE);
    }
  }

  return (
    <motion.div
      className="absolute inset-0 touch-none select-none"
      style={{ x, y, rotate: reducedMotion ? 0 : rotate }}
      drag={active}
      dragSnapToOrigin
      dragElastic={0.7}
      whileTap={active && !reducedMotion ? { scale: 1.02 } : undefined}
      onDragEnd={active ? handleDragEnd : undefined}
    >
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-muted shadow-xl shadow-black/40">
        <div className="relative min-h-0 flex-1 bg-primary">
          {card.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.posterUrl}
              alt={`${card.title} poster`}
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
              loading={active ? 'eager' : 'lazy'}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-2xl font-bold text-muted-fg">
              {card.title}
            </div>
          )}

          {card.isHybrid && (
            <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-on-primary">
              <Layers aria-hidden className="size-3.5" /> Both genres
            </span>
          )}

          {/* Drag verdict badges */}
          <motion.span
            style={{ opacity: likeOpacity }}
            className="absolute right-4 top-4 -rotate-12 rounded-lg border-4 border-accent px-3 py-1 text-2xl font-black text-accent"
            aria-hidden
          >
            LIKE
          </motion.span>
          <motion.span
            style={{ opacity: nopeOpacity }}
            className="absolute left-4 top-4 rotate-12 rounded-lg border-4 border-destructive px-3 py-1 text-2xl font-black text-destructive"
            aria-hidden
          >
            NOPE
          </motion.span>
          <motion.span
            style={{ opacity: maybeOpacity }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border-4 border-maybe px-3 py-1 text-2xl font-black text-maybe"
            aria-hidden
          >
            MAYBE
          </motion.span>
        </div>

        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="truncate text-xl font-bold">{card.title}</h2>
            {card.scores.composite != null && (
              <span className="tabular shrink-0 rounded-lg bg-primary px-2 py-0.5 text-lg font-bold text-accent">
                {card.scores.composite.toFixed(1)}
              </span>
            )}
          </div>
          <p className="tabular text-sm text-muted-fg">
            {card.year ?? '—'}
            {card.runtime != null && ` · ${card.runtime} min`}
            {card.jellyfinItemId != null && ' · In library'}
          </p>
          <p className="tabular text-xs text-muted-fg">
            {card.scores.letterboxd != null && `Letterboxd ${card.scores.letterboxd}`}
            {card.scores.imdb != null && `  ·  IMDb ${card.scores.imdb}`}
            {card.scores.rt != null && `  ·  RT ${card.scores.rt}%`}
          </p>
        </div>
      </article>
    </motion.div>
  );
}
