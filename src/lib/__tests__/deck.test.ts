import { describe, expect, it } from 'vitest';
import { buildDeck, interleave } from '../deck';
import type { MovieCandidate } from '../types';

let seq = 0;
function candidate(over: Partial<MovieCandidate>): MovieCandidate {
  return {
    id: `tmdb-${++seq}`,
    tmdbId: seq,
    imdbId: null,
    title: `Movie ${seq}`,
    year: 2000,
    runtime: 100,
    posterUrl: null,
    genres: [],
    isHybrid: false,
    jellyfinItemId: null,
    scores: { letterboxd: null, imdb: null, rt: null, composite: null },
    ...over,
  };
}

const scored = (composite: number, genres: string[], over: Partial<MovieCandidate> = {}) =>
  candidate({ genres, scores: { letterboxd: null, imdb: null, rt: null, composite }, ...over });

describe('interleave', () => {
  it('alternates 1-and-1 starting with the first list', () => {
    expect(interleave([1, 3, 5], [2, 4])).toEqual([1, 2, 3, 4, 5]);
  });

  it('appends the longer tail', () => {
    expect(interleave([1], [2, 4, 6])).toEqual([1, 2, 4, 6]);
  });
});

describe('buildDeck', () => {
  it('puts hybrids first (composite-desc), then interleaves single genres', () => {
    const hybridLow = scored(70, ['Sci-Fi', 'Horror'], { title: 'HybridLow' });
    const hybridHigh = scored(90, ['Sci-Fi', 'Horror'], { title: 'HybridHigh' });
    const sciFi = scored(85, ['Sci-Fi'], { title: 'SciFi' });
    const horror = scored(95, ['Horror'], { title: 'Horror' });

    const deck = buildDeck([sciFi, hybridLow, horror, hybridHigh], ['Sci-Fi', 'Horror']);

    expect(deck.map((c) => c.title)).toEqual(['HybridHigh', 'HybridLow', 'SciFi', 'Horror']);
    expect(deck[0]!.isHybrid).toBe(true);
    expect(deck[2]!.isHybrid).toBe(false);
  });

  it('sorts within each single-genre side before interleaving', () => {
    const a1 = scored(90, ['Sci-Fi'], { title: 'A90' });
    const a2 = scored(60, ['Sci-Fi'], { title: 'A60' });
    const b1 = scored(80, ['Horror'], { title: 'B80' });
    const b2 = scored(70, ['Horror'], { title: 'B70' });

    const deck = buildDeck([a2, b2, a1, b1], ['Sci-Fi', 'Horror']);

    expect(deck.map((c) => c.title)).toEqual(['A90', 'B80', 'A60', 'B70']);
  });

  it('drops titles matching neither locked genre', () => {
    const deck = buildDeck(
      [scored(90, ['Comedy']), scored(80, ['Horror'])],
      ['Sci-Fi', 'Horror'],
    );
    expect(deck).toHaveLength(1);
  });

  it('applies the runtime cap but lets unknown runtimes pass', () => {
    const deck = buildDeck(
      [
        scored(90, ['Horror'], { title: 'Long', runtime: 180 }),
        scored(80, ['Horror'], { title: 'Short', runtime: 90 }),
        scored(70, ['Horror'], { title: 'Unknown', runtime: null }),
      ],
      ['Sci-Fi', 'Horror'],
      { maxRuntime: 110 },
    );
    expect(deck.map((c) => c.title)).toEqual(['Short', 'Unknown']);
  });

  it('dedupes by candidate id', () => {
    const dupe = scored(90, ['Horror'], { id: 'tmdb-348' });
    const deck = buildDeck([dupe, { ...dupe }], ['Sci-Fi', 'Horror']);
    expect(deck).toHaveLength(1);
  });

  it('truncates to the deck limit', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      scored(50 + (i % 40), [i % 2 === 0 ? 'Sci-Fi' : 'Horror']),
    );
    expect(buildDeck(many, ['Sci-Fi', 'Horror'], { deckLimit: 25 })).toHaveLength(25);
  });

  it('matches genres case-insensitively', () => {
    const deck = buildDeck(
      [scored(90, ['science fiction', 'HORROR'])],
      ['Science Fiction', 'Horror'],
    );
    expect(deck[0]!.isHybrid).toBe(true);
  });

  it('sinks unscored titles to the back of their tier', () => {
    const unscored = candidate({ genres: ['Horror'], title: 'Unscored' });
    const rated = scored(40, ['Horror'], { title: 'Rated' });
    const deck = buildDeck([unscored, rated], ['Sci-Fi', 'Horror']);
    expect(deck.map((c) => c.title)).toEqual(['Rated', 'Unscored']);
  });
});
