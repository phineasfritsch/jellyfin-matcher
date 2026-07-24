'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ExternalLink, X } from 'lucide-react';
import { useEffect } from 'react';
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`${card.title} details`}>
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-black/60"
      />
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-border bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{card.title}</h2>
            <p className="tabular text-sm text-muted-fg">
              {card.year ?? '—'}
              {card.runtime != null && ` · ${card.runtime} min`}
              {card.genres.length > 0 && ` · ${card.genres.join(', ')}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-fg"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {card.description && (
          <p className="mb-4 text-sm leading-relaxed text-foreground/90">{card.description}</p>
        )}

        {embed ? (
          <div className="mb-4 overflow-hidden rounded-xl border border-border">
            <iframe
              src={embed}
              title={`${card.title} trailer`}
              className="aspect-video w-full"
              allow="accelerometer; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          card.trailerUrl && (
            <a
              href={card.trailerUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-muted text-sm font-semibold"
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
                className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm"
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
    </div>
  );
}
