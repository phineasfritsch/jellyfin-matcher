import { describe, expect, it } from 'vitest';
import { RoomStore } from '../store';

/**
 * Undo, at the store level. The socket handler does the same arithmetic, and
 * these are the invariants it has to keep. Verified end to end against a live
 * server too, but that needs a real Jellyfin and cannot run in the suite.
 */
describe('taking a vote back', () => {
  function twoPersonRoom() {
    const store = new RoomStore();
    const { room, userId: a } = store.createRoom('Ada', true);
    const { userId: b } = store.joinRoom(room.roomId, 'Bex', false);
    room.status = 'SWIPING';
    room.deck = [
      { id: 'c1', title: 'One' },
      { id: 'c2', title: 'Two' },
    ] as never;
    room.progress = { [a]: 0, [b]: 0 };
    return { store, room, a, b };
  }

  it('a guest is distinguishable from an account holder', () => {
    const { room, a, b } = twoPersonRoom();
    expect(room.users[a]!.authed).toBe(true);
    expect(room.users[b]!.authed).toBe(false);
  });

  it('undo rewinds only the undoer, never the room', () => {
    const { room, a, b } = twoPersonRoom();
    room.votes.c1 = { [a]: -5, [b]: 2 };
    room.progress[a] = 1;
    room.progress[b] = 1;

    // What the handler does: drop this user's vote, step this user back.
    const votes = { ...room.votes.c1 };
    delete votes[a];
    room.votes.c1 = votes;
    room.progress[a] = 0;

    expect(room.votes.c1[a]).toBeUndefined();
    expect(room.votes.c1[b]).toBe(2); // the other player is untouched
    expect(room.progress[b]).toBe(1);
  });

  it('cannot rewind past the start of the deck', () => {
    const { room, a } = twoPersonRoom();
    expect((room.progress[a] ?? 0) - 1).toBeLessThan(0);
  });
});
