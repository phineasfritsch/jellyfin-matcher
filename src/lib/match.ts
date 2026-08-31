import type { MovieCandidate } from './types';

/** Valid swipe point values. */
export const VOTE_POINTS = {
  DISLIKE: -5,
  MAYBE: 1,
  LIKE: 2,
  SUPER: 3,
} as const;

export type VotePoints = (typeof VOTE_POINTS)[keyof typeof VOTE_POINTS];

export function isValidVote(points: number): points is VotePoints {
  return points === -5 || points === 1 || points === 2 || points === 3;
}

/** Only Like/Super count toward an instant match — a "maybe" never locks the room. */
const POSITIVE_THRESHOLD = 2;

/** cardId → (userId → points). */
export type Votes = Record<string, Record<string, number>>;

/**
 * True when every member has voted Like or Super on this card.
 * N-user safe: requires ALL of `allUserIds`, not just any two.
 */
export function isInstantMatch(votes: Votes, cardId: string, allUserIds: string[]): boolean {
  if (allUserIds.length < 2) return false;
  const cardVotes = votes[cardId];
  if (!cardVotes) return false;
  return allUserIds.every((id) => {
    const v = cardVotes[id];
    return typeof v === 'number' && v >= POSITIVE_THRESHOLD;
  });
}

/**
 * True when every connected member voted No on this card.
 *
 * The mirror of isInstantMatch, and it exists for the same reason: unanimity is
 * the only signal in this app strong enough to decide something on its own.
 *
 * R97. Without it the points could crown a film the whole room rejected. The
 * fallback ranks on `composite + votePoints`, a rating is 0-100 and a unanimous
 * no is about -5N, so on a two-person night a film rated 87 that both people
 * said no to scores 77 and beats anything rated below that which nobody
 * objected to. The winner screen then captioned it "Nobody agreed outright, so
 * the points decided" -- which is true and reads as a compromise, when what
 * actually happened is that the room's only unanimous opinion was ignored.
 *
 * Unanimity, not majority: two of three saying no is a room that disagrees, and
 * points deciding a disagreement is exactly what points are for. Everyone
 * saying no is not a disagreement.
 */
export function isUnanimousNo(votes: Votes, cardId: string, allUserIds: string[]): boolean {
  if (allUserIds.length === 0) return false;
  const cardVotes = votes[cardId];
  if (!cardVotes) return false;
  return allUserIds.every((id) => cardVotes[id] === VOTE_POINTS.DISLIKE);
}

export interface FallbackResult {
  cardId: string;
  total: number;
  composite: number;
  votePoints: number;
  isHybrid: boolean;
}

/**
 * Fallback settlement when the deck runs out without an instant match:
 *   T_i = S_i + Σ_u W_u,i
 * Ranked descending; ties break hybrid-first, then higher composite.
 */
export function rankFallback(deck: MovieCandidate[], votes: Votes): FallbackResult[] {
  const results = deck.map((card) => {
    const cardVotes = votes[card.id] ?? {};
    const votePoints = Object.values(cardVotes).reduce((sum, v) => sum + v, 0);
    const composite = card.scores.composite ?? 0;
    return {
      cardId: card.id,
      total: Math.round((composite + votePoints) * 10) / 10,
      composite,
      votePoints,
      isHybrid: card.isHybrid,
    };
  });
  return results.sort(
    (a, b) =>
      b.total - a.total ||
      Number(b.isHybrid) - Number(a.isHybrid) ||
      b.composite - a.composite,
  );
}

/** The absolute winner, or null on an empty deck. */
export function fallbackWinner(deck: MovieCandidate[], votes: Votes): string | null {
  return rankFallback(deck, votes)[0]?.cardId ?? null;
}
