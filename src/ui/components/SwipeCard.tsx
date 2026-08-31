'use client';

import { motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { Info } from 'lucide-react';
import type { MovieCandidate } from '../../lib/types';
import { VOTE_POINTS } from '../../lib/match';

/** A vote needs real travel, not just speed. See R49. */
const SWIPE_DISTANCE = 110;
/** Velocity is an accelerator past this distance, never a substitute for it. */
const VELOCITY_FLOOR = 45;
const SWIPE_VELOCITY = 600;

export interface SwipeCardProps {
  card: MovieCandidate;
  /** Called once with the chosen points when the card leaves. */
  onVote: (points: number) => void;
  /** Only the top card is draggable. */
  active: boolean;
  /** Open the details sheet (synopsis, all ratings, trailer). */
  onOpenDetails: () => void;
}

/** Ratings named by source. A bare number is not a rating (R12). */
function ratingLine(card: MovieCandidate): string {
  const parts: string[] = [];
  if (card.scores.imdb != null) parts.push(`IMDb ${card.scores.imdb}`);
  if (card.scores.letterboxd != null) parts.push(`Letterboxd ${card.scores.letterboxd}`);
  if (card.scores.rt != null) parts.push(`RT critics ${card.scores.rt}`);
  return parts.length ? parts.join(' · ') : 'No ratings found for this one.';
}

export function SwipeCard({ card, onVote, active, onOpenDetails }: SwipeCardProps) {
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const likeOpacity = useTransform(x, [40, SWIPE_DISTANCE], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_DISTANCE, -40], [1, 0]);
  const maybeOpacity = useTransform(y, [-SWIPE_DISTANCE, -40], [1, 0]);

  /**
   * R49: a vote commits on distance, or on velocity that has already travelled
   * VELOCITY_FLOOR. Velocity alone used to be enough, which meant a tremor, a
   * nudge from the person beside you, or a thumb put down to steady the phone
   * registered as a real answer on a card you had not read. There is no
   * gesture for the super like at all -- the vote that most distorts the
   * outcome is reachable only by a deliberate press.
   */
  function handleDragEnd(
    _e: unknown,
    info: { offset: { x: number; y: number }; velocity: { x: number; y: number } },
  ) {
    const { offset, velocity } = info;
    const fast = (v: number, o: number) => Math.abs(v) > SWIPE_VELOCITY && Math.abs(o) > VELOCITY_FLOOR;

    if (offset.x > SWIPE_DISTANCE || (velocity.x > 0 && fast(velocity.x, offset.x))) {
      onVote(VOTE_POINTS.LIKE);
    } else if (offset.x < -SWIPE_DISTANCE || (velocity.x < 0 && fast(velocity.x, offset.x))) {
      onVote(VOTE_POINTS.DISLIKE);
    } else if (offset.y < -SWIPE_DISTANCE || (velocity.y < 0 && fast(velocity.y, offset.y))) {
      onVote(VOTE_POINTS.MAYBE);
    }
  }

  const notHeld = card.jellyfinItemId == null;

  return (
    <motion.div
      className="absolute inset-0 touch-none select-none"
      style={{ x, y, rotate: reducedMotion ? 0 : rotate }}
      drag={active}
      dragSnapToOrigin
      dragElastic={0.7}
      onDragEnd={active ? handleDragEnd : undefined}
      aria-hidden={!active}
    >
      {/*
        scrim-strong, not pane: the cards behind the top one are still in the DOM
        and a 7%-white panel let their titles read straight through this one.
        The stack has to look like a stack, not a double exposure.
      */}
      <article className="gel-solid flex h-full flex-col overflow-hidden rounded-[var(--radius-sheet)] shadow-2xl shadow-black/60">
        <div className="relative min-h-0 flex-1 bg-white/[0.04]">
          {card.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.posterUrl}
              alt={`${card.title} poster`}
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
              loading="eager"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-2xl font-semibold text-muted-fg">
              {card.title}
            </div>
          )}

          {/*
            One chip, and it means one thing: this film is not on the server,
            so voting for it can start a download. "Both genres" was cut from
            the face -- it is a fact about why the card is here, not a cost,
            and it now lives in the details sheet.
          */}
          {notHeld && (
            <span className="absolute left-3 top-3 rounded-full bg-background/85 px-3 py-1.5 text-caption font-semibold text-destructive ring-1 ring-destructive/40">
              Not on your server
            </span>
          )}

          {active && (
            <button
              type="button"
              aria-label={`Ratings, synopsis and trailer for ${card.title}`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onClick={onOpenDetails}
              /*
                R96: a thumb is not type, so this does not scale with the text.

                `size-12` is 3rem, and at the 32px root a reader on 200% text
                gets a 96px disc. The poster it sits on is about 53px tall at
                that size, so the button was taller than its own container: its
                centre sat 19px ABOVE the card's top edge, the article's
                overflow-hidden clipped roughly 70% of it along with the whole
                Info glyph, and because overflow clips hit-testing too the
                tappable region collapsed to about 88x29 -- under the 44px
                minimum in REDESIGN.md, on the one control that explains the
                film you are voting on.

                R60 is about type tracking the reader, and it is right. A touch
                target is not type: a thumb does not get bigger when you raise
                the font size, so this is 44px at every text size -- the floor
                the redesign already asked for, now as a literal.
              */
              className="absolute bottom-3 right-3 flex size-[44px] cursor-pointer items-center justify-center rounded-full bg-background/85 text-foreground ring-1 ring-white/25 transition active:scale-90"
            >
              <Info aria-hidden className="size-[20px] shrink-0" />
            </button>
          )}

          {/*
            Drag verdicts. Under reduced motion the card does not track the
            finger, so these are the only feedback there is; they are words,
            never colour alone (R18, R26).
          */}
          <motion.span
            style={{ opacity: likeOpacity }}
            className="absolute right-4 top-4 rounded-2xl bg-accent px-4 py-2 text-2xl font-bold text-on-primary ring-2 ring-accent/60"
            aria-hidden
          >
            YES
          </motion.span>
          <motion.span
            style={{ opacity: nopeOpacity }}
            className="absolute left-4 top-4 rounded-2xl bg-destructive px-4 py-2 text-2xl font-bold text-on-primary ring-2 ring-destructive/60"
            aria-hidden
          >
            NO
          </motion.span>
          <motion.span
            style={{ opacity: maybeOpacity }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-2xl bg-maybe px-4 py-2 text-2xl font-bold text-on-primary ring-2 ring-maybe/60"
            aria-hidden
          >
            MAYBE
          </motion.span>
        </div>

        {/*
          The facts stay on the card. Nour wanted a poster and nothing else,
          with everything relocated to a sheet and a live region; Margo cannot
          use a screen whose content is a promise made elsewhere, and Ade
          cannot vote without knowing what he is voting on. The card carries
          what a vote needs and the sheet carries the rest.
        */}
        {/*
          R84: no cap and no scroller here.

          This was `max-h-[45%] overflow-y-auto`, which is a scrolling region
          inside the deck -- the exact thing R21 says the deck is physically
          incapable of, reaffirmed by R59. It did not degrade gracefully: at a
          32px root the three lines need about 236px against a cap of roughly
          133, so the title scrolled out of its own box and "RT critics 98"
          was sheared mid-glyph against the card's overflow-hidden. A person
          at 200% text was voting on a film whose name was not on the screen.

          The poster above is `min-h-0 flex-1`, so it yields instead. The
          facts a vote needs stay on the face (R58); it is the picture that
          gives up room, which is the correct thing to trade.
        */}
        <div className="flex shrink-0 flex-col gap-1 border-t border-[var(--color-hairline)] px-4 py-3">
          <h2 className="truncate text-title font-semibold tracking-[-0.01em]">{card.title}</h2>
          <p className="tabular text-label text-muted-fg">
            {card.year ?? 'Year unknown'}
            {card.runtime != null && ` · ${card.runtime} min`}
          </p>
          <p className="tabular text-label text-muted-fg">{ratingLine(card)}</p>
        </div>
      </article>
    </motion.div>
  );
}
