import { describe, expect, it } from 'vitest';
import { compositeScore, pickSourceScores } from '../score';
import type { MdblistRating } from '../types';

describe('compositeScore', () => {
  it('weights all three sources 0.35/0.35/0.30', () => {
    // Alien: letterboxd 84, imdb 84, rt 93 → 29.4 + 29.4 + 27.9 = 86.7
    expect(compositeScore({ letterboxd: 84, imdb: 84, rt: 93 })).toBe(86.7);
  });

  it('reweights proportionally when one source is missing', () => {
    // (0.35·80 + 0.30·60) / 0.65 = 70.769… → 70.8
    expect(compositeScore({ letterboxd: null, imdb: 80, rt: 60 })).toBe(70.8);
  });

  it('returns the lone score when only one source exists', () => {
    expect(compositeScore({ rt: 90 })).toBe(90);
  });

  it('returns null when every source is missing (never zero-fills)', () => {
    expect(compositeScore({})).toBeNull();
    expect(compositeScore({ letterboxd: null, imdb: null, rt: null })).toBeNull();
  });

  it('ignores non-finite values', () => {
    expect(compositeScore({ imdb: Number.NaN, rt: 70 })).toBe(70);
  });
});

describe('pickSourceScores', () => {
  const ratings: MdblistRating[] = [
    { source: 'imdb', value: 8.4, score: 84, votes: 1068936 },
    { source: 'metacritic', value: 89, score: 89, votes: 34 },
    { source: 'tomatoes', value: 93, score: 93, votes: 211 },
    { source: 'popcorn', value: 94, score: 94, votes: 22355 },
    { source: 'letterboxd', value: 4.2, score: 84, votes: 1930455 },
    { source: 'myanimelist', value: null, score: null, votes: null },
  ];

  it('maps letterboxd/imdb/tomatoes and ignores the rest', () => {
    expect(pickSourceScores(ratings)).toEqual({ letterboxd: 84, imdb: 84, rt: 93 });
  });

  it('returns null for absent sources', () => {
    expect(pickSourceScores([{ source: 'imdb', value: 7, score: 70, votes: 1 }])).toEqual({
      letterboxd: null,
      imdb: 70,
      rt: null,
    });
  });
});
