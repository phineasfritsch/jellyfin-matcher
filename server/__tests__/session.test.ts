import { describe, expect, it } from 'vitest';
import { ABSTAIN } from '../../src/lib/knockout';
import { canSettle } from '../settlement';
import { RoomStore } from '../store';
import {
  beginDeckBuild,
  deckBuilt,
  deckBuildFailed,
  declare,
  recordElimination,
  recordGenres,
  recordVote,
  rejectWinner,
  startKnockout,
  undoVote,
} from '../transitions';

/**
 * A whole night, driven without socket.io.
 *
 * The principal engineer's condition was that the rules of the product exist
 * as transitions testable without the transport, with a full session from
 * lobby to settlement. Before this the only test of undo re-implemented the
 * handler's arithmetic inside the test body — it asserted the test could do
 * the maths, not that the server did, so the suite being green said nothing
 * about the code it was green about.
 */
function deck(...ids: string[]) {
  return ids.map((id, i) => ({
    id,
    title: id.toUpperCase(),
    isHybrid: false,
    jellyfinItemId: `jf-${id}`,
    scores: { composite: 90 - i * 10 },
  })) as never;
}

function room(names: string[]) {
  const store = new RoomStore();
  const { room, userId: first } = store.createRoom(names[0]!, true);
  const ids = [first];
  for (const name of names.slice(1)) ids.push(store.joinRoom(room.roomId, name, false).userId);
  return { store, room, ids };
}

describe('a whole night, lobby to settlement', () => {
  it('runs start to finish and lands on a film everybody said yes to', () => {
    const { store, room: r, ids } = room(['Ada', 'Bex', 'Cy']);
    const [a, b, c] = ids as [string, string, string];

    // Lobby. Nothing starts until everyone is ready.
    expect(startKnockout(r, store)).toBe(false);
    for (const id of ids) store.setReady(r.roomId, id, true);
    expect(startKnockout(r, store)).toBe(true);
    expect(r.status).toBe('KNOCKOUT');

    // Genres. Ada and Bex overlap on three; Cy has no opinion at all.
    recordGenres(r, a, ['Horror', 'Sci-Fi', 'Comedy'], store);
    recordGenres(r, b, ['Horror', 'Sci-Fi', 'Crime'], store);
    const afterCy = recordGenres(r, c, [], store);
    expect(afterCy.needsRevote).toBe(false);

    // Two of the three survive an elimination round.
    if (!afterCy.done) {
      recordElimination(r, a, 'Comedy', store);
      recordElimination(r, b, 'Comedy', store);
      recordElimination(r, c, ABSTAIN, store);
    }
    expect(r.knockout.phase).toBe('DONE');
    expect(r.lockedGenres).toHaveLength(2);

    // The deck builds.
    beginDeckBuild(r, store);
    expect(r.status).toBe('SWIPING');
    expect(r.deck).toHaveLength(0);
    deckBuilt(r, deck('c1', 'c2', 'c3'), store);
    expect(Object.values(r.progress)).toEqual([0, 0, 0]);

    // Card one: not unanimous, so the night continues.
    expect(recordVote(r, a, 'c1', 2, store)).toBeNull();
    expect(recordVote(r, b, 'c1', -5, store)).toBeNull();
    expect(recordVote(r, c, 'c1', 1, store)).toBeNull();

    // Card two: everyone says yes, and that is the night.
    expect(recordVote(r, a, 'c2', 2, store)).toBeNull();
    expect(recordVote(r, b, 'c2', 3, store)).toBeNull();
    const verdict = recordVote(r, c, 'c2', 2, store);
    expect(verdict).toEqual({ cardId: 'c2', viaFallback: false });

    declare(r, verdict!.cardId, store);
    expect(r.status).toBe('FINISHED');
    expect(r.winner).toBe('c2');
  });

  it('settles on points when the deck runs out with no agreement', () => {
    const { store, room: r, ids } = room(['Ada', 'Bex']);
    const [a, b] = ids as [string, string];
    beginDeckBuild(r, store);
    deckBuilt(r, deck('c1', 'c2'), store);

    for (const card of ['c1', 'c2']) {
      recordVote(r, a, card, 1, store);
      recordVote(r, b, card, 1, store);
    }
    const verdict = canSettle(r, null);
    expect(verdict?.viaFallback).toBe(true);
    // c1 has the higher composite and both votes are equal, so it wins.
    expect(verdict?.cardId).toBe('c1');
  });

  it('undo puts the card back and takes only your own vote with it', () => {
    const { store, room: r, ids } = room(['Ada', 'Bex']);
    const [a, b] = ids as [string, string];
    beginDeckBuild(r, store);
    deckBuilt(r, deck('c1', 'c2'), store);

    recordVote(r, a, 'c1', -5, store);
    recordVote(r, b, 'c1', 2, store);
    expect(r.progress[a]).toBe(1);

    expect(undoVote(r, a, store)).toBe('c1');
    expect(r.progress[a]).toBe(0);
    expect(r.votes.c1?.[a]).toBeUndefined();
    expect(r.votes.c1?.[b]).toBe(2); // untouched
    expect(r.progress[b]).toBe(1);

    // Nothing left to take back.
    expect(undoVote(r, a, store)).toBeNull();
  });

  it('rejecting the winner resumes the night and never re-offers that film', () => {
    const { store, room: r, ids } = room(['Ada', 'Bex']);
    const [a, b] = ids as [string, string];
    beginDeckBuild(r, store);
    deckBuilt(r, deck('c1', 'c2'), store);

    recordVote(r, a, 'c1', 2, store);
    const verdict = recordVote(r, b, 'c1', 2, store);
    expect(verdict?.cardId).toBe('c1');
    declare(r, 'c1', store);

    expect(rejectWinner(r, store)).toBe(true);
    expect(r.status).toBe('SWIPING');
    expect(r.winner).toBeNull();
    expect(r.rejected).toEqual(['c1']);

    // Even a unanimous yes cannot bring it back.
    undoVote(r, a, store);
    undoVote(r, b, store);
    recordVote(r, a, 'c1', 3, store);
    expect(recordVote(r, b, 'c1', 3, store)).toBeNull();
  });

  it('a member leaving mid-deck cannot stop the room ending', () => {
    const { store, room: r, ids } = room(['Ada', 'Bex', 'Cy']);
    const [a, b, c] = ids as [string, string, string];
    beginDeckBuild(r, store);
    deckBuilt(r, deck('c1', 'c2'), store);

    // Cy goes to bed at card zero and never votes again.
    store.leaveRoom(r.roomId, c);
    expect(r.users[c]!.connected).toBe(false);

    recordVote(r, a, 'c1', 2, store);
    const verdict = recordVote(r, b, 'c1', 2, store);
    expect(verdict).toEqual({ cardId: 'c1', viaFallback: false });
  });

  it('a failed deck build returns the room to genre picking, not a dead end', () => {
    const { store, room: r, ids } = room(['Ada', 'Bex']);
    for (const id of ids) store.setReady(r.roomId, id, true);
    startKnockout(r, store);
    recordGenres(r, ids[0]!, ['Horror', 'Sci-Fi'], store);
    recordGenres(r, ids[1]!, ['Horror', 'Sci-Fi'], store);

    beginDeckBuild(r, store);
    deckBuildFailed(r, store);
    expect(r.status).toBe('KNOCKOUT');
    expect(r.knockout.phase).toBe('CHECKBOX');
    // The picks are cleared, so the room does not immediately re-choose the
    // pair that just produced nothing.
    expect(r.knockout.submissions).toEqual({});
  });

  it('an empty deck settles rather than parking everyone on a skeleton', () => {
    const { store, room: r, ids } = room(['Ada', 'Bex']);
    void ids;
    beginDeckBuild(r, store);
    deckBuilt(r, deck(), store);
    expect(canSettle(r, null)).toEqual({ cardId: null, viaFallback: true });
  });
});
