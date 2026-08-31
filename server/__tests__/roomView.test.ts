import { describe, expect, it } from 'vitest';
import { viewFor } from '../roomView';
import { RoomStore } from '../store';

/**
 * The room used to be broadcast whole. These tests are the difference between
 * a privacy promise and a rendering convention: the UI declined to draw other
 * people's votes, but the data was on every device in the room.
 */
function room$() {
  const store = new RoomStore();
  const { room, userId: a } = store.createRoom('Ada', true);
  const { userId: b } = store.joinRoom(room.roomId, 'Bex', false);
  const { userId: c } = store.joinRoom(room.roomId, 'Cy', false);
  room.status = 'SWIPING';
  room.deck = [{ id: 'c1' }, { id: 'c2' }] as never;
  room.progress = { [a]: 1, [b]: 2, [c]: 2 };
  room.votes = {
    c1: { [a]: -5, [b]: 2, [c]: 3 },
    c2: { [b]: 2, [c]: -5 },
  };
  room.knockout.submissions = { [a]: ['Horror'], [b]: ['Comedy'], [c]: ['Drama'] };
  room.knockout.elimVotes = { [b]: 'Horror', [c]: 'Comedy' };
  return { room, a, b, c };
}

describe('what one member can see', () => {
  it('carries their own votes and nobody else s', () => {
    const { room, a, b } = room$();
    const v = viewFor(room, a);
    expect(v.votes.c1).toEqual({ [a]: -5 });
    expect(v.votes.c1?.[b]).toBeUndefined();
    // A card they never voted on is absent entirely, not an empty object.
    expect(v.votes.c2).toBeUndefined();
  });

  it('carries their own deck position and nobody else s', () => {
    const { room, a, b, c } = room$();
    const v = viewFor(room, a);
    expect(v.progress).toEqual({ [a]: 1 });
    expect(v.progress[b]).toBeUndefined();
    expect(v.progress[c]).toBeUndefined();
  });

  it('replaces other people s positions with a count, which is all the UI needs', () => {
    const { room, a } = room$();
    expect(viewFor(room, a).othersFinished).toBe(2);
  });

  it('hides other people s genre picks, which the knockout screen promises', () => {
    const { room, a, b } = room$();
    const v = viewFor(room, a);
    expect(v.knockout.submissions).toEqual({ [a]: ['Horror'] });
    expect(v.knockout.submissions[b]).toBeUndefined();
    expect(v.submittedCount).toBe(3);
  });

  it('hides other people s elimination votes but still counts them', () => {
    const { room, a, b } = room$();
    const v = viewFor(room, a);
    // Ada has not voted this round, so she sees no ballots at all.
    expect(v.knockout.elimVotes).toEqual({});
    expect(v.knockout.elimVotes[b]).toBeUndefined();
    expect(v.votedCount).toBe(2);
  });

  it('leaks no other user id anywhere in the serialised payload', () => {
    const { room, a, b, c } = room$();
    const wire = JSON.stringify(viewFor(room, a));
    // Names are public -- the member list shows them. Vote and progress keys
    // are not, and those are user ids.
    const parsed = JSON.parse(wire);
    expect(Object.keys(parsed.progress)).toEqual([a]);
    for (const card of Object.values(parsed.votes) as Array<Record<string, number>>) {
      expect(Object.keys(card)).toEqual([a]);
    }
    expect(Object.keys(parsed.knockout.submissions)).toEqual([a]);
    expect(Object.keys(parsed.knockout.elimVotes)).toEqual([]);
    void b;
    void c;
  });

  it('still carries everything the room legitimately shares', () => {
    const { room, a } = room$();
    const v = viewFor(room, a);
    expect(v.roomId).toBe(room.roomId);
    expect(v.deck).toHaveLength(2);
    expect(Object.keys(v.users)).toHaveLength(3);
    expect(v.settings).toEqual(room.settings);
  });
});
