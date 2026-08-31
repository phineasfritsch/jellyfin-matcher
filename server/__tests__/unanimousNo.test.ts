import { describe, expect, it } from 'vitest';
import { canSettle } from '../settlement';
import { RoomStore } from '../store';
import type { Room } from '../store';
import { isUnanimousNo, VOTE_POINTS } from '../../src/lib/match';

/**
 * R97: the points may not crown a film the whole room said no to.
 *
 * The fallback ranks on `composite + votePoints`. A rating is 0-100 and a
 * unanimous no is about -5N, so on a two-person night a film rated 87 that both
 * people rejected scores 77 and beats anything rated under that which nobody
 * objected to. The winner screen then captioned it "Nobody agreed outright, so
 * the points decided" -- true, and reading as a compromise, when what actually
 * happened is that the room's only unanimous opinion was overruled.
 */

function card(id: string, composite: number) {
  return {
    id,
    title: id,
    year: 2000,
    runtime: 100,
    posterUrl: null,
    trailerUrl: null,
    genres: [],
    isHybrid: false,
    jellyfinItemId: 'j',
    tmdbId: 1,
    allRatings: [],
    scores: { composite, imdb: null, letterboxd: null, rt: null },
  } as unknown as Room['deck'][number];
}

/** A finished deck: everyone has swiped everything, so the points decide. */
function exhausted(deck: Room['deck'], votes: Room['votes'], members: string[]) {
  const store = new RoomStore();
  const { room } = store.createRoom('Ada');
  // Replace the host with exactly the members this case is about, so the
  // room's membership is the list the assertions reason over.
  room.users = {};
  for (const id of members) {
    room.users[id] = { id, name: id, ready: true, connected: true, authed: false };
  }
  room.status = 'SWIPING';
  room.deck = deck;
  room.votes = votes;
  for (const id of members) room.progress[id] = deck.length;
  return room;
}

describe('a film the whole room said no to', () => {
  it('is recognised as a unanimous no', () => {
    const votes = { c1: { u_1: VOTE_POINTS.DISLIKE, u_2: VOTE_POINTS.DISLIKE } };
    expect(isUnanimousNo(votes, 'c1', ['u_1', 'u_2'])).toBe(true);
  });

  it('is not a unanimous no when somebody did not vote', () => {
    const votes = { c1: { u_1: VOTE_POINTS.DISLIKE } };
    expect(isUnanimousNo(votes, 'c1', ['u_1', 'u_2'])).toBe(false);
  });

  it('is not a unanimous no when one member merely shrugged', () => {
    // Two of three is a room that disagrees, and points deciding a
    // disagreement is exactly what points are for.
    const votes = {
      c1: { u_1: VOTE_POINTS.DISLIKE, u_2: VOTE_POINTS.DISLIKE, u_3: VOTE_POINTS.MAYBE },
    };
    expect(isUnanimousNo(votes, 'c1', ['u_1', 'u_2', 'u_3'])).toBe(false);
  });

  it('does not win on points, even rated far above everything else', () => {
    // The exact shape of the bug: 87 - 10 = 77 still beats 60.
    const room = exhausted(
      [card('c1', 87), card('c2', 60)],
      {
        c1: { u_1: VOTE_POINTS.DISLIKE, u_2: VOTE_POINTS.DISLIKE },
        c2: {},
      },
      ['u_1', 'u_2'],
    );

    const verdict = canSettle(room, null);
    expect(verdict).not.toBeNull();
    expect(verdict!.viaFallback).toBe(true);
    expect(verdict!.cardId).toBe('c2');
  });

  it('still wins if only some of the room said no', () => {
    const room = exhausted(
      [card('c1', 87), card('c2', 60)],
      {
        c1: { u_1: VOTE_POINTS.DISLIKE, u_2: VOTE_POINTS.MAYBE },
        c2: {},
      },
      ['u_1', 'u_2'],
    );
    // 87 - 5 + 1 = 83 against 60. The room disagreed; the points decided.
    expect(canSettle(room, null)!.cardId).toBe('c1');
  });

  it('says there is no winner when the room disliked every single film', () => {
    // Turning fifty unanimous noes into a recommendation is the failure this
    // app is a reaction to. The honest answer is the one that already exists.
    const room = exhausted(
      [card('c1', 87), card('c2', 60)],
      {
        c1: { u_1: VOTE_POINTS.DISLIKE, u_2: VOTE_POINTS.DISLIKE },
        c2: { u_1: VOTE_POINTS.DISLIKE, u_2: VOTE_POINTS.DISLIKE },
      },
      ['u_1', 'u_2'],
    );

    const verdict = canSettle(room, null);
    expect(verdict).not.toBeNull();
    expect(verdict!.cardId).toBeNull();
  });

  it('ignores the opinion of somebody who has left', () => {
    // Only connected members decide (settlement.ts). A departed member's no
    // still counts toward the points; it just cannot make a card unanimous on
    // its own.
    const room = exhausted(
      [card('c1', 87), card('c2', 60)],
      {
        c1: { u_1: VOTE_POINTS.DISLIKE, u_2: VOTE_POINTS.DISLIKE },
        c2: {},
      },
      ['u_1', 'u_2'],
    );
    room.users.u_2!.connected = false;

    // u_1 alone said no, so c1 is unanimously disliked among those still here.
    expect(canSettle(room, null)!.cardId).toBe('c2');
  });
});
