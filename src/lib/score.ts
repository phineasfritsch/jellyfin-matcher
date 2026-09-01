import type { MdblistRating } from './types';

/** The three sources the composite formula uses, each 0–100 or null when unrated. */
export interface SourceScores {
  letterboxd: number | null;
  imdb: number | null;
  rt: number | null;
}

export const WEIGHTS: Record<keyof SourceScores, number> = {
  letterboxd: 0.35,
  imdb: 0.35,
  rt: 0.3,
};

/**
 * S = 0.35·Letterboxd + 0.35·IMDb + 0.30·RottenTomatoes, on 0–100 inputs.
 * Missing sources reweight the remaining ones proportionally so unrated
 * titles are not buried by zero-filling. All sources missing → null.
 */
export function compositeScore(scores: Partial<SourceScores>): number | null {
  let weightSum = 0;
  let total = 0;
  /*
    R165: a number outside 0-100 is not a rating, so it is treated as a MISSING
    one rather than clamped.

    These come from MDBList and nothing validates them at ingestion --
    `MdblistRating` is a type, which is a promise about the shape and says
    nothing at runtime. `Number.isFinite` already refused NaN and Infinity, so
    the impossible values that got through were the ordinary-looking ones: a
    changed API, a scale switching from 0-10 to 0-100, one bad row.

    Clamping was the obvious answer and is worse. Clamp 1000 to 100 and the film
    still sorts to the top of the deck and still wins a points settlement, on a
    number nobody can defend -- and R12 says a statistic never appears without
    naming what it covers. Dropping it reweights the sources that ARE credible,
    which is what this function already does for a title nobody rated, and a
    film with no usable rating at all correctly comes back null.
  */
  for (const key of Object.keys(WEIGHTS) as Array<keyof SourceScores>) {
    const value = scores[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) {
      weightSum += WEIGHTS[key];
      total += WEIGHTS[key] * value;
    }
  }
  if (weightSum === 0) return null;
  return Math.round((total / weightSum) * 10) / 10;
}

/**
 * Map MDBList's ratings[] to the formula's three sources using the
 * pre-normalized `score` field (0–100). RT critics = source "tomatoes".
 */
export function pickSourceScores(ratings: MdblistRating[]): SourceScores {
  const bySource = new Map(ratings.map((r) => [r.source, r.score]));
  return {
    letterboxd: bySource.get('letterboxd') ?? null,
    imdb: bySource.get('imdb') ?? null,
    rt: bySource.get('tomatoes') ?? null,
  };
}
