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
  for (const key of Object.keys(WEIGHTS) as Array<keyof SourceScores>) {
    const value = scores[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
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
