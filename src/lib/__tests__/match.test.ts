import { describe, expect, it } from 'vitest';
import { VOTE_POINTS, fallbackWinner, isInstantMatch, isValidVote, rankFallback, type Votes } from '../match';
import type { MovieCandidate } from '../types';

function card(id: string, composite: number | null, isHybrid = false): MovieCandidate {
  return {
    id,
    tmdbId: null,
    imdbId: null,
    title: id,
    year: null,
    runtime: null,
    posterUrl: null,
    genres: [],
    isHybrid,
    jellyfinItemId: null,
    description: null,
    trailerUrl: null,
    allRatings: [],
    scores: { letterboxd: null, imdb: null, rt: null, composite },
  };
}

describe('isValidVote', () => {
  it('accepts only the four point values', () => {
    expect([-5, 1, 2, 3].every(isValidVote)).toBe(true);
    expect([0, 4, -1, 5].some(isValidVote)).toBe(false);
  });
});

describe('isInstantMatch', () => {
  const users = ['u_1', 'u_2', 'u_3'];

  it('requires EVERY member to vote Like or Super', () => {
    const votes: Votes = { c1: { u_1: 2, u_2: 3, u_3: 2 } };
    expect(isInstantMatch(votes, 'c1', users)).toBe(true);
  });

  it('never locks on a +1 maybe', () => {
    const votes: Votes = { c1: { u_1: 2, u_2: 3, u_3: 1 } };
    expect(isInstantMatch(votes, 'c1', users)).toBe(false);
  });

  it('waits for members who have not reached the card', () => {
    const votes: Votes = { c1: { u_1: 2, u_2: 3 } };
    expect(isInstantMatch(votes, 'c1', users)).toBe(false);
  });

  it('needs at least 2 members in the room', () => {
    expect(isInstantMatch({ c1: { u_1: 3 } }, 'c1', ['u_1'])).toBe(false);
  });
});

describe('rankFallback', () => {
  it('totals composite plus every member vote', () => {
    const deck = [card('a', 80), card('b', 90)];
    const votes: Votes = {
      a: { u_1: 3, u_2: 3 }, // 80 + 6 = 86
      b: { u_1: -5, u_2: 2 }, // 90 - 3 = 87
    };
    const ranked = rankFallback(deck, votes);
    expect(ranked.map((r) => r.cardId)).toEqual(['b', 'a']);
    expect(ranked[0]!.total).toBe(87);
    expect(ranked[1]!.total).toBe(86);
  });

  it('breaks total ties hybrid-first, then higher composite', () => {
    const deck = [card('single', 85), card('hybrid', 85, true)];
    const ranked = rankFallback(deck, {});
    expect(ranked[0]!.cardId).toBe('hybrid');
  });

  it('treats unscored cards as composite 0', () => {
    const deck = [card('unscored', null)];
    const votes: Votes = { unscored: { u_1: 2 } };
    expect(rankFallback(deck, votes)[0]!.total).toBe(2);
  });
});

describe('fallbackWinner', () => {
  it('returns the top-ranked card id', () => {
    const deck = [card('a', 50), card('b', 95)];
    expect(fallbackWinner(deck, {})).toBe('b');
  });

  it('returns null on an empty deck', () => {
    expect(fallbackWinner([], {})).toBeNull();
  });
});

/**
 * Undo is implemented in the socket handler, but the invariant it has to keep
 * is a match one: removing a vote must remove it from the tally, so a card
 * that was one vote short of unanimous does not stay "matched" after the vote
 * that made it unanimous is taken back.
 */
describe('undoing a vote', () => {
  const users = ['a', 'b'];

  it('a card that was an instant match stops being one', () => {
    const votes = { c1: { a: VOTE_POINTS.LIKE, b: VOTE_POINTS.LIKE } };
    expect(isInstantMatch(votes, 'c1', users)).toBe(true);
    const undone = { c1: { a: VOTE_POINTS.LIKE } };
    expect(isInstantMatch(undone, 'c1', users)).toBe(false);
  });

  it('removing the last vote on a card leaves its fallback score unweighted', () => {
    const deck = [
      { id: 'c1', isHybrid: false, scores: { composite: 50 } },
      // Within one super like of c1, so the vote is what decides it.
      { id: 'c2', isHybrid: false, scores: { composite: 48 } },
    ] as never;
    const withVote = rankFallback(deck, { c2: { a: VOTE_POINTS.SUPER } });
    expect(withVote[0]!.cardId).toBe('c2');
    const undone = rankFallback(deck, {});
    expect(undone[0]!.cardId).toBe('c1');
  });
});
