/**
 * The rules of a night, as named transitions.
 *
 * Every one of these used to be a field assignment inside a socket handler:
 * `room.status = 'FINISHED'` here, `room.knockout = submitGenres(...)` there,
 * seventeen of them across eight places in server/index.ts. That has two costs
 * and the second is the expensive one.
 *
 * The first is that the rules of the product were only readable by reading the
 * transport. The second is that they were only *testable* through it — the
 * suite's one test of undo re-implemented the handler's arithmetic inside the
 * test body, so it asserted that the test could do the maths, not that the
 * server did. A green suite said nothing about the code.
 *
 * These are ordinary functions on a Room. They do not know what socket.io is,
 * they never emit anything, and they can be driven from lobby to settlement in
 * a plain test (see __tests__/session.test.ts). The handler's job shrinks to
 * translating events into these and broadcasting what comes back.
 *
 * Each returns what happened rather than mutating and staying silent, because
 * the caller usually has to tell the room something about it.
 */
import { createKnockout, reresolve, submitElimination, submitGenres } from '../src/lib/knockout';
import type { FallbackResult } from '../src/lib/match';
import type { MovieCandidate } from '../src/lib/types';
import { activeUserIds, canSettle, type Settlement } from './settlement';
import type { Room, RoomStore } from './store';

/** Everyone is ready: the lobby closes and genre picking starts. */
export function startKnockout(room: Room, store: RoomStore): boolean {
  if (room.status !== 'LOBBY' || !store.allReady(room)) return false;
  room.status = 'KNOCKOUT';
  room.knockout = createKnockout();
  store.touch(room);
  return true;
}

/** Two genres survived: the room moves to a deck that has not been built yet. */
export function beginDeckBuild(room: Room, store: RoomStore): void {
  room.status = 'SWIPING';
  room.deck = [];
  store.touch(room);
}

/** The deck came back. Everyone starts at card zero. */
export function deckBuilt(room: Room, deck: MovieCandidate[], store: RoomStore): void {
  room.deck = deck;
  room.progress = Object.fromEntries(Object.keys(room.users).map((id) => [id, 0]));
  store.touch(room);
}

/**
 * The deck could not be built. The room goes back to genre picking rather than
 * being stranded on a skeleton, and the knockout is reset so the same two
 * genres are not immediately re-chosen.
 */
export function deckBuildFailed(room: Room, store: RoomStore): void {
  room.status = 'KNOCKOUT';
  room.knockout = createKnockout();
  store.touch(room);
}

/** One member's genre picks. Locks the survivors when the round resolves. */
export function recordGenres(
  room: Room,
  userId: string,
  genres: string[],
  store: RoomStore,
): { done: boolean; needsRevote: boolean } {
  // Active members decide when the round ends; every submission still counts
  // toward the overlap (R87).
  room.knockout = submitGenres(room.knockout, userId, genres, activeUserIds(room));
  if (room.knockout.phase === 'DONE') room.lockedGenres = room.knockout.locked;
  store.touch(room);
  return { done: room.knockout.phase === 'DONE', needsRevote: room.knockout.needsRevote };
}

/** One member's elimination vote. Locks the survivors when two remain. */
export function recordElimination(
  room: Room,
  userId: string,
  genre: string,
  store: RoomStore,
): { done: boolean } {
  room.knockout = submitElimination(room.knockout, userId, genre, activeUserIds(room));
  if (room.knockout.phase === 'DONE') room.lockedGenres = room.knockout.locked;
  store.touch(room);
  return { done: room.knockout.phase === 'DONE' };
}

/** One vote on one card. Returns the settlement if this ended the night. */
export function recordVote(
  room: Room,
  userId: string,
  cardId: string,
  points: number,
  store: RoomStore,
): Settlement | null {
  room.votes[cardId] = { ...room.votes[cardId], [userId]: points };
  room.progress[userId] = (room.progress[userId] ?? 0) + 1;
  store.touch(room);
  return canSettle(room, cardId);
}

/**
 * Take back your own last vote (R48).
 *
 * Returns the card that came back, or null when there was nothing to undo.
 * The arithmetic lives here rather than in the handler precisely because the
 * old test re-implemented it and therefore tested nothing.
 */
export function undoVote(room: Room, userId: string, store: RoomStore): string | null {
  const index = (room.progress[userId] ?? 0) - 1;
  if (index < 0) return null;
  const card = room.deck[index];
  if (!card) return null;

  const cardVotes = { ...room.votes[card.id] };
  delete cardVotes[userId];
  if (Object.keys(cardVotes).length === 0) delete room.votes[card.id];
  else room.votes[card.id] = cardVotes;
  room.progress[userId] = index;
  store.touch(room);
  return card.id;
}

/** The room has landed on a film, or on nothing. */
export function declare(
  room: Room,
  cardId: string | null,
  store: RoomStore,
  outcome: { viaFallback: boolean; ranking: FallbackResult[] | null; playUrl: string | null } = {
    viaFallback: false,
    ranking: null,
    playUrl: null,
  },
): void {
  room.status = 'FINISHED';
  room.winner = cardId;
  // R90: on the room, not only in the event. A rejoin gets room:state and
  // nothing else, so anything that lives only in match:declared is gone the
  // moment somebody reloads.
  room.winnerViaFallback = outcome.viaFallback;
  room.winnerRanking = outcome.ranking;
  room.winnerPlayUrl = outcome.playUrl;
  // A new winner has not been asked for, whatever the last one's state was.
  room.winnerRequest = null;
  store.touch(room);
}

/**
 * "Not this one" (R63). The room resumes with that card struck out, so no
 * later settlement can hand it back.
 */
export function rejectWinner(room: Room, store: RoomStore): boolean {
  if (room.status !== 'FINISHED') return false;
  if (room.winner) room.rejected.push(room.winner);
  room.winner = null;
  // The night is no longer over, so the account of how it ended must go too,
  // or a later winner inherits this one's ranking (R90).
  room.winnerViaFallback = false;
  room.winnerRanking = null;
  room.winnerPlayUrl = null;
  room.winnerRequest = null;
  room.status = 'SWIPING';
  store.touch(room);
  return true;
}

/**
 * A member left. Re-run the knockout round in case they were the only one it
 * was still waiting on.
 *
 * settlement.ts already applied this rule to the deck; the knockout was left
 * out, so a phone closing during genre picking stranded the room reading
 * "2 of 3 in" until the leaver came back or the 2h TTL reaped it -- the exact
 * permanent stalemate this product's headline promise denies (R87).
 */
export function knockoutMemberLeft(room: Room, store: RoomStore): { done: boolean } {
  if (room.status !== 'KNOCKOUT') return { done: false };
  room.knockout = reresolve(room.knockout, activeUserIds(room));
  if (room.knockout.phase === 'DONE') room.lockedGenres = room.knockout.locked;
  store.touch(room);
  return { done: room.knockout.phase === 'DONE' };
}
