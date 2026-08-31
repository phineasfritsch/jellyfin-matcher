'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ExternalLink, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MovieCandidate } from '../../lib/types';

/** Human labels for MDBList rating sources. */
const SOURCE_LABELS: Record<string, string> = {
  imdb: 'IMDb',
  letterboxd: 'Letterboxd',
  tomatoes: 'RT Critics',
  popcorn: 'RT Audience',
  metacritic: 'Metacritic',
  metacriticuser: 'Metacritic Users',
  trakt: 'Trakt',
  tmdb: 'TMDb',
  rogerebert: 'Roger Ebert',
  myanimelist: 'MyAnimeList',
};

function youtubeEmbedUrl(watchUrl: string): string | null {
  const match = watchUrl.match(/(?:v=|youtu\.be\/)([\w-]{6,})/);
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
}

/** Bottom sheet with the full ratings breakdown, synopsis, and trailer. */
export function MovieDetails({ card, onClose }: { card: MovieCandidate; onClose: () => void }) {
  const reducedMotion = useReducedMotion();
  const embed = card.trailerUrl ? youtubeEmbedUrl(card.trailerUrl) : null;
  const sheetRef = useRef<HTMLDivElement>(null);
  const [playTrailer, setPlayTrailer] = useState(false);
  const [mounted, setMounted] = useState(false);

  /**
   * R81: the sheet renders into <body>, not where it is written.
   *
   * It is written inside the deck, which is a stack of animated, overflowing,
   * translucent panes. A frosted pane only blurs what its nearest *backdrop
   * root* painted -- and an ancestor with a filter, an opacity below 1 or a
   * will-change becomes one. So the sheet was translucent over the poster
   * without blurring it: the card's title and the vote row's No/Maybe/Yes read
   * straight through the synopsis, as legible words competing with it.
   *
   * That is the same class of bug as the focus ring above (R80) -- correct CSS
   * that addresses the wrong element -- and chasing which ancestor is at fault
   * fixes it until someone adds another. A portal has no ancestors.
   */
  useEffect(() => setMounted(true), []);

  /**
   * R31: focus is trapped while the sheet is open and handed back to the
   * control that opened it on close, by every route -- Escape, the backdrop,
   * or the close button. Focus dropped to <body> is how a keyboard or screen
   * reader user loses the rest of the deck.
   */
  useEffect(() => {
    // The portal only exists from the second render, so until then sheetRef is
    // null and every line below would silently no-op: no focus move, and a
    // trap closed over nothing.
    if (!mounted) return;
    const opener = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    sheet?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheet) return;
      const focusable = sheet.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose, mounted]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`${card.title} details`}>
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-black/60"
      />
      <motion.div
        ref={sheetRef}
        tabIndex={-1}
        data-app-focus
        initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="scrim-strong relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[var(--radius-sheet)] p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-title font-semibold leading-tight tracking-[-0.015em]">{card.title}</h2>
            <p className="tabular text-label text-muted-fg">
              {card.year ?? 'Year unknown'}
              {card.runtime != null && ` · ${card.runtime} min`}
              {card.genres.length > 0 && ` · ${card.genres.join(', ')}`}
            </p>
            {/* Moved off the card face: a fact about why this is in the deck,
                not a cost, so it belongs here rather than competing with the
                one chip that means money. */}
            {card.isHybrid && (
              <p className="mt-1.5 inline-block rounded-full bg-maybe/12 px-2.5 py-1 text-caption font-semibold text-maybe">
                Tagged both genres
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/[0.08] text-muted-fg ring-1 ring-white/15"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {card.description && (
          <p className="mb-4 text-sm leading-relaxed text-foreground/90">{card.description}</p>
        )}

        {embed ? (
          playTrailer ? (
            <div className="mb-4 overflow-hidden rounded-[var(--radius-card)] ring-1 ring-[var(--color-hairline)]">
              <iframe
                src={embed}
                title={`${card.title} trailer`}
                className="aspect-video w-full"
                allow="accelerometer; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            /*
              R29: the sheet opens with zero network. Everything else here
              already shipped with the deck; the trailer is the only thing that
              would reach out, and on a LAN with no route to YouTube it was a
              dead grey rectangle sitting where the synopsis should be.
            */
            <button
              type="button"
              onClick={() => setPlayTrailer(true)}
              className="mb-4 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-white/[0.08] text-body font-semibold ring-1 ring-white/15"
            >
              <ExternalLink aria-hidden className="size-4" /> Play trailer
            </button>
          )
        ) : (
          card.trailerUrl && (
            <a
              href={card.trailerUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-4 flex h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-white/[0.08] text-body font-semibold ring-1 ring-white/15"
            >
              <ExternalLink aria-hidden className="size-4" /> Watch trailer
            </a>
          )
        )}

        <h3 className="mb-2 text-sm font-semibold text-muted-fg">Ratings</h3>
        {card.allRatings.length === 0 ? (
          <p className="text-sm text-muted-fg">No ratings found for this one.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {card.allRatings.map((r) => (
              <li
                key={r.source}
                className="flex items-center justify-between rounded-[var(--radius-control)] bg-white/[0.06] px-3 py-2.5 text-body ring-1 ring-white/10"
              >
                <span className="text-muted-fg">{SOURCE_LABELS[r.source] ?? r.source}</span>
                <span className="tabular font-semibold">{r.score}</span>
              </li>
            ))}
          </ul>
        )}

        {card.scores.composite != null && (
          <p className="tabular mt-3 text-center text-sm text-muted-fg">
            Deck score {card.scores.composite.toFixed(1)} (35% Letterboxd, 35% IMDb, 30% RT)
          </p>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
