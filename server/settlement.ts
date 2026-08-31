/**
 * When a room is allowed to end.
 *
 * This module exists because the app manufactured the exact failure it was
 * built to prevent. The README's headline is "No stalemates, that's the whole
 * point"; `leaveRoom` deliberately keeps a mid-game leaver in `room.users` with
 * `connected: false` so their votes survive and they can rejoin — and both
 * settlement paths then iterated *every* user. A member who closed their phone
 * at card 12 could never vote again, so no card could reach unanimity, and
 * their `progress` never advanced, so the deck could never exhaust. The room
 * could not end. By construction, not by accident.
 *
 * The rule, stated once, here:
 *
 *   Only CONNECTED members decide whether a room can settle.
 *   Everyone's votes still count once it does.
 *
 * That split is the whole idea. Leaving forfeits your say in *when* the room
 * ends; it does not delete what you already said about the films.
 */
import { fallbackWinner, isInstantMatch, isUnanimousNo } from '../src/lib/match';
import type { Room } from './store';

/** Members still holding a phone. The only people who can stall a room. */
export function activeUserIds(room: Room): string[] {
  return Object.values(room.users)
    .filter((u) => u.connected)
    .map((u) => u.id);
}

/**
 * Every remaining member has reached the end of the deck.
 *
 * An empty deck counts as exhausted. It used to be guarded on
 * `deck.length > 0`, which parked a room in SWIPING forever whenever a genre
 * pair matched nothing — the one case where the room most needs to be told
 * something, since from the couch it is indistinguishable from a slow build.
 */
export function deckExhausted(room: Room): boolean {
  const active = activeUserIds(room);
  if (active.length === 0) return false; // nobody left to settle for
  if (room.deck.length === 0) return true;
  return active.every((id) => (room.progress[id] ?? 0) >= room.deck.length);
}

export interface Settlement {
  /** The winning card, or null when there is genuinely nothing to win. */
  cardId: string | null;
  viaFallback: boolean;
}

/**
 * Can this room end right now, and with what?
 *
 * `justVoted` is the card that prompted the check, if any — an instant match
 * can only be created by a vote, so there is no point scanning the whole deck.
 * Returns null when the room should keep going.
 */
export function canSettle(room: Room, justVoted: string | null): Settlement | null {
  const active = activeUserIds(room);
  if (active.length === 0) return null;

  // A card everybody still here has said yes to ends the room immediately --
  // unless the room already turned it down, in which case offering it again is
  // the app arguing with them (R63).
  const rejected = new Set(room.rejected);
  if (justVoted && !rejected.has(justVoted) && isInstantMatch(room.votes, justVoted, active)) {
    return { cardId: justVoted, viaFallback: false };
  }

  if (!deckExhausted(room)) return null;

  /*
    Out of cards: the points decide, among the ones still standing. A deck with
    nothing left has no winner, and says so rather than pretending.

    R97: "still standing" excludes anything every connected member said no to.
    The ranking is composite + vote sum, a rating is 0-100 and a unanimous no is
    about -5N, so without this the best-rated film the whole room rejected won
    on points -- announced as "Nobody agreed outright, so the points decided",
    which reads as a compromise when the room's one unanimous opinion had just
    been overruled.

    If that empties the list the room disliked everything, and the honest answer
    is the no-winner path that already exists rather than the least-hated film.
    Turning fifty unanimous noes into a recommendation is the failure this whole
    app is a reaction to.
  */
  const standing = room.deck.filter(
    (c) => !rejected.has(c.id) && !isUnanimousNo(room.votes, c.id, active),
  );
  return { cardId: fallbackWinner(standing, room.votes), viaFallback: true };
}
