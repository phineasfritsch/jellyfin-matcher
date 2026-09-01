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

describe('a rating that cannot be a rating (R165)', () => {
  /*
    Nothing validates what MDBList sends. `MdblistRating` is a TYPE -- a promise
    about the shape that says nothing at runtime -- and pickSourceScores hands
    those numbers straight here.

    Number.isFinite already refused NaN and Infinity, so what got through were
    the ordinary-looking impossibilities: an API that changed, a scale that
    switched from 0-10 to 0-100, one bad row. A score of 1000 would sort its
    film to the top of every deck and win any settlement decided on points.
  */
  it('ignores a score above 100 rather than letting it win the room', () => {
    const sane = compositeScore({ letterboxd: 80, imdb: 80, rt: 80 });
    const rotten = compositeScore({ letterboxd: 1000, imdb: 80, rt: 80 });
    expect(rotten, 'an impossible score reached the composite').toBe(80);
    expect(rotten).toBe(sane);
  });

  it('ignores a negative score rather than burying the film', () => {
    expect(compositeScore({ letterboxd: -50, imdb: 60, rt: 60 })).toBe(60);
  });

  it('keeps the edges, which are real scores', () => {
    // 0 is a real rating and must not be confused with missing. A film everyone
    // hated is not a film nobody rated.
    expect(compositeScore({ letterboxd: 0, imdb: 0, rt: 0 })).toBe(0);
    expect(compositeScore({ letterboxd: 100, imdb: 100, rt: 100 })).toBe(100);
  });

  it('comes back unrated when every source is impossible', () => {
    /*
      Not 0. Zero is a verdict and null is the absence of one, and this function
      is careful about the difference.

      Written after getting this wrong: the first version of this comment said
      the deck sorts the two differently, and it does not. `rankFallback` reads
      `card.scores.composite ?? 0`, so an unrated film ranks exactly where a
      film everybody hated ranks. That is a real consequence and possibly a
      wrong one -- roughly a tenth of a real library has no TMDb id and so no
      ratings, and those titles need votes to overcome a 0 they did not earn.

      It is left alone here on purpose. This ruling is about not letting an
      impossible number into the formula; how the deck should treat an honestly
      unrated film is a different question and inventing an answer to it while
      fixing something else is how a fix becomes a rewrite.
    */
    expect(compositeScore({ letterboxd: 200, imdb: -1, rt: 101 })).toBeNull();
  });
});
