import type { MovieCandidate } from './types';

export interface DeckOptions {
  /** Runtime cap in minutes; unknown runtimes pass. */
  maxRuntime?: number | null;
  /** Max cards in the deck (fallback scoring activates at the end). */
  deckLimit?: number;
}

const DEFAULT_DECK_LIMIT = 50;

function hasGenre(candidate: MovieCandidate, genre: string): boolean {
  const g = genre.toLowerCase();
  return candidate.genres.some((x) => x.toLowerCase() === g);
}

/** Composite-desc sort; unscored titles sink to the back of their tier. */
function byComposite(a: MovieCandidate, b: MovieCandidate): number {
  return (b.scores.composite ?? -1) - (a.scores.composite ?? -1);
}

/** Alternate two lists 1-and-1 (starting with `a`), appending the longer tail. */
export function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

/**
 * Assemble the swipe deck for two locked genres:
 *   1. Hybrid tier (both genres) first, composite-desc.
 *   2. Single-genre tier interleaved 1-and-1 (genreA first), each side composite-desc.
 * Runtime cap and dedupe (by candidate id) applied before tiering; deck
 * truncated to deckLimit.
 */
export function buildDeck(
  candidates: MovieCandidate[],
  lockedGenres: [string, string],
  opts: DeckOptions = {},
): MovieCandidate[] {
  const [genreA, genreB] = lockedGenres;
  const limit = opts.deckLimit ?? DEFAULT_DECK_LIMIT;

  const seen = new Set<string>();
  const eligible = candidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    if (opts.maxRuntime != null && c.runtime != null && c.runtime > opts.maxRuntime) {
      return false;
    }
    return hasGenre(c, genreA) || hasGenre(c, genreB);
  });

  const hybrid: MovieCandidate[] = [];
  const onlyA: MovieCandidate[] = [];
  const onlyB: MovieCandidate[] = [];
  for (const c of eligible) {
    const inA = hasGenre(c, genreA);
    const inB = hasGenre(c, genreB);
    const tagged = { ...c, isHybrid: inA && inB };
    if (inA && inB) hybrid.push(tagged);
    else if (inA) onlyA.push(tagged);
    else onlyB.push(tagged);
  }

  hybrid.sort(byComposite);
  onlyA.sort(byComposite);
  onlyB.sort(byComposite);

  return [...hybrid, ...interleave(onlyA, onlyB)].slice(0, limit);
}
